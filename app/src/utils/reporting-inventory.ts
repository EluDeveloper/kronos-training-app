import type { ReportingFilters, ReportingInventoryClosureSource, ReportingInventoryResolutionSource } from '@/types/reporting'
import { dateForBusinessTimeZone } from './reporting-periods'
import { currency } from './reporting-metrics'

export interface InventoryReport {
  summary: { differenceUnits: number; differenceValue: number; recoveredUnits: number; coveredUnits: number; coveredValue: number; writtenOffValue: number; cashFlow: number }
  rows: Array<{ closureId: string; closureDate: string; productId: string; productName: string; differenceUnits: number; differenceValue: number; foundUnits: number; coveredUnits: number; coveredValue: number; writtenOffValue: number; correctedUnits: number }>
  resolutionRows: Array<{ resolutionId: string; adjustmentId: string; closureId: string; closureDate: string; resolutionDate: string; productId: string; productName: string; kind: ReportingInventoryResolutionSource['kind']; units: number; amount: number; method?: ReportingInventoryResolutionSource['method'] }>
}

export function buildInventoryReport(closures: ReportingInventoryClosureSource[], resolutions: ReportingInventoryResolutionSource[], filters: ReportingFilters): InventoryReport {
  const rows: InventoryReport['rows'] = []
  const resolutionRows: InventoryReport['resolutionRows'] = []
  for (const closure of closures) {
    if (closure.status !== 'finalized')
      continue
    const closureDate = closure.finalizedAt ? dateForBusinessTimeZone(closure.finalizedAt) : closure.weekEnd
    const closureInPeriod = closureDate >= filters.from && closureDate <= filters.through
    for (const item of Object.values(closure.items ?? {})) {
      if (filters.productIds.length && !filters.productIds.includes(item.productId))
        continue

      const matching = resolutions.filter(resolution => resolution.closureId === closure.id && resolution.productId === item.productId
        && dateForBusinessTimeZone(resolution.createdAt) >= filters.from
        && dateForBusinessTimeZone(resolution.createdAt) <= filters.through
        && (!filters.inventoryResolutionKind || resolution.kind === filters.inventoryResolutionKind)
        && (!filters.paymentMethod || resolution.kind === 'covered' && resolution.method === filters.paymentMethod))

      if (!closureInPeriod && !matching.length)
        continue

      matching.forEach(resolution => resolutionRows.push({
        resolutionId: resolution.id,
        adjustmentId: resolution.adjustmentId,
        closureId: closure.id,
        closureDate,
        resolutionDate: dateForBusinessTimeZone(resolution.createdAt),
        productId: item.productId,
        productName: item.name,
        kind: resolution.kind,
        units: Number(resolution.units || 0),
        amount: currency(Number(resolution.amount || 0)),
        ...(resolution.method ? { method: resolution.method } : {}),
      }))

      rows.push({
        closureId: closure.id,
        closureDate,
        productId: item.productId,
        productName: item.name,
        differenceUnits: closureInPeriod ? Number(item.variance || 0) : 0,
        differenceValue: closureInPeriod ? currency(Number(item.varianceValue || 0)) : 0,
        foundUnits: matching.filter(resolution => resolution.kind === 'found').reduce((sum, resolution) => sum + resolution.units, 0),
        coveredUnits: matching.filter(resolution => resolution.kind === 'covered').reduce((sum, resolution) => sum + resolution.units, 0),
        coveredValue: currency(matching.filter(resolution => resolution.kind === 'covered').reduce((sum, resolution) => sum + resolution.amount, 0)),
        writtenOffValue: currency(matching.filter(resolution => resolution.kind === 'written-off').reduce((sum, resolution) => sum + resolution.amount, 0)),
        correctedUnits: matching.filter(resolution => resolution.kind === 'corrected').reduce((sum, resolution) => sum + resolution.units, 0),
      })
    }
  }
  const differenceUnits = rows.reduce((sum, row) => sum + row.differenceUnits, 0)
  const differenceValue = currency(rows.reduce((sum, row) => sum + row.differenceValue, 0))
  const coveredValue = currency(rows.reduce((sum, row) => sum + row.coveredValue, 0))

  return {
    summary: {
      differenceUnits,
      differenceValue,
      recoveredUnits: rows.reduce((sum, row) => sum + row.foundUnits, 0),
      coveredUnits: rows.reduce((sum, row) => sum + row.coveredUnits, 0),
      coveredValue,
      writtenOffValue: currency(rows.reduce((sum, row) => sum + row.writtenOffValue, 0)),
      cashFlow: coveredValue,
    },
    rows,
    resolutionRows,
  }
}
