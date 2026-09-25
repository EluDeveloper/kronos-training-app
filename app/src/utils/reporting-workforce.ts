import type { ReportingDataQuality, ReportingFilters, ReportingPayrollSettlementSource, ReportingWorkEntrySource } from '@/types/reporting'
import { currency } from './reporting-metrics'

export interface WorkforceReport {
  summary: { accrued: number; paid: number; pending: number; quality: ReportingDataQuality }
  rows: Array<{ employeeId: string; employeeName: string; workDate: string; entryId: string; amount: number; status: ReportingWorkEntrySource['status']; accruedInPeriod: boolean; paidInPeriod: boolean; pendingAtCutoff: boolean; quality: ReportingDataQuality; settlementId?: string; settlementPaidAt?: string; method?: ReportingPayrollSettlementSource['method'] }>
  settlementRows: Array<{ settlementId: string; employeeId: string; employeeName: string; paidAt: string; amount: number; method: ReportingPayrollSettlementSource['method']; entryIds: string[]; quality: ReportingDataQuality; note?: string }>
}

export function buildWorkforceReport(entries: ReportingWorkEntrySource[], settlements: ReportingPayrollSettlementSource[], filters: ReportingFilters): WorkforceReport {
  const employeeEntries = entries.filter(entry => (!filters.employeeId || entry.employeeId === filters.employeeId) && (!filters.workStatus || entry.status === filters.workStatus))
  const scopedEntries = employeeEntries.filter(entry => entry.date >= filters.from && entry.date <= filters.through)
  const pendingEntries = employeeEntries.filter(entry => entry.date <= filters.through && entry.status !== 'paid')

  const scopedSettlements = settlements.filter(settlement => settlement.paidAt >= filters.from
    && settlement.paidAt <= filters.through
    && (!filters.employeeId || settlement.employeeId === filters.employeeId)
    && (!filters.paymentMethod || settlement.method === filters.paymentMethod)
    && (!filters.workStatus || filters.workStatus === 'paid'))

  const entryById = new Map(entries.map(entry => [entry.id, entry]))
  const paidByEntry = new Map<string, ReportingPayrollSettlementSource>()
  const countedEntryIds = new Set<string>()
  const settlementRows: WorkforceReport['settlementRows'] = []
  let paid = 0

  for (const settlement of [...scopedSettlements].sort((left, right) => left.id.localeCompare(right.id))) {
    const entryIds = Object.keys(settlement.entryIds ?? {})
    const linkedEntries = entryIds.map(id => entryById.get(id))
    let note = ''
    if (!entryIds.length || linkedEntries.some(entry => !entry))
      note = 'La liquidación contiene líneas inexistentes.'
    else if (linkedEntries.some(entry => entry!.status !== 'paid' || entry!.employeeId !== settlement.employeeId))
      note = 'Las líneas no coinciden con el empleado o no están pagadas.'
    else if (linkedEntries.some(entry => entry!.payrollSettlementId && entry!.payrollSettlementId !== settlement.id))
      note = 'Una línea apunta a otra liquidación.'
    else if (linkedEntries.some(entry => countedEntryIds.has(entry!.id)))
      note = 'Una línea aparece en más de una liquidación.'
    else if (currency(linkedEntries.reduce((sum, entry) => sum + Number(entry!.amount || 0), 0)) !== currency(settlement.amount))
      note = 'El monto de la liquidación no coincide con sus líneas.'

    const quality: ReportingDataQuality = note ? 'unavailable' : 'exact'

    settlementRows.push({
      settlementId: settlement.id,
      employeeId: settlement.employeeId,
      employeeName: settlement.employeeName,
      paidAt: settlement.paidAt,
      amount: currency(settlement.amount),
      method: settlement.method,
      entryIds,
      quality,
      ...(note ? { note } : {}),
    })

    if (!note) {
      paid = currency(paid + settlement.amount)
      linkedEntries.forEach(entry => {
        countedEntryIds.add(entry!.id)
        paidByEntry.set(entry!.id, settlement)
      })
    }
  }

  const relevantIds = new Set([...scopedEntries, ...pendingEntries, ...[...paidByEntry.keys()].map(id => entryById.get(id)!).filter(Boolean)].map(entry => entry.id))

  const rows = employeeEntries
    .filter(entry => relevantIds.has(entry.id))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
    .map(entry => {
      const settlement = paidByEntry.get(entry.id)
      const canonicalSettlement = entry.payrollSettlementId ? settlements.find(item => item.id === entry.payrollSettlementId) : undefined
      const quality: ReportingDataQuality = entry.status === 'paid' && !canonicalSettlement ? 'unavailable' : 'exact'

      return {
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        workDate: entry.date,
        entryId: entry.id,
        amount: currency(entry.amount),
        status: entry.status,
        accruedInPeriod: entry.date >= filters.from && entry.date <= filters.through,
        paidInPeriod: Boolean(settlement),
        pendingAtCutoff: entry.date <= filters.through && entry.status !== 'paid',
        quality,
        ...(entry.payrollSettlementId ? { settlementId: entry.payrollSettlementId } : {}),
        ...(settlement ? { settlementPaidAt: settlement.paidAt, method: settlement.method } : {}),
      }
    })

  return {
    summary: {
      accrued: currency(scopedEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)),
      paid,
      pending: currency(pendingEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)),
      quality: settlementRows.some(row => row.quality !== 'exact') || rows.some(row => row.quality !== 'exact') ? 'partial-history' : 'exact',
    },
    rows,
    settlementRows,
  }
}
