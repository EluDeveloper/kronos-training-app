import type { ReportingDataQuality, ReportingFilters } from '@/types/reporting'
import type { AthleteReport } from './reporting-athletes'
import type { MembershipReport } from './reporting-memberships'
import type { InventoryReport } from './reporting-inventory'
import type { WorkforceReport } from './reporting-workforce'
import type { StoreReport } from './reporting-store'
import type { FinanceReport } from './reporting-finance'
import { serializeReportingFilters } from './reporting-periods'

export type ReportingExportRecordType = 'metadata' | 'metric' | 'detail'

export interface ReportingExportRow {
  schemaVersion: '1'
  recordType: ReportingExportRecordType
  section: string
  key: string
  label: string
  date: string
  sourceType: string
  sourceId: string
  category: string
  status: string
  method: string
  account: string
  unit: string
  value: number | null
  secondaryValue: number | null
  quality: ReportingDataQuality | ''
  filters: string
}

export interface ReportingExportInput {
  generatedAt: string
  filters: ReportingFilters
  loadedSources: string[]
  athletes?: AthleteReport
  memberships?: MembershipReport
  inventory?: InventoryReport
  workforce?: WorkforceReport
  store?: StoreReport
  finance?: FinanceReport
}

const headers = ['schema_version', 'record_type', 'section', 'key', 'label', 'date', 'source_type', 'source_id', 'category', 'status', 'method', 'account', 'unit', 'value', 'secondary_value', 'quality', 'filters'] as const
const sectionOrder = ['Metadata', 'Atletas', 'Mensualidades', 'Inventario', 'Personal', 'Tienda', 'Finanzas', 'Conciliación']
const recordOrder: ReportingExportRecordType[] = ['metadata', 'metric', 'detail']

function row(filters: string, input: Partial<ReportingExportRow> & Pick<ReportingExportRow, 'recordType' | 'section' | 'key'>): ReportingExportRow {
  const { recordType, section, key, ...values } = input

  return {
    schemaVersion: '1', recordType, section, key,
    label: '', date: '', sourceType: '', sourceId: '', category: '', status: '', method: '', account: '', unit: '',
    value: null, secondaryValue: null, quality: '', filters, ...values,
  }
}

function metric(filters: string, section: string, key: string, label: string, value: number | null, quality: ReportingDataQuality = 'exact', unit = 'currency') {
  return row(filters, { recordType: 'metric', section, key, label, value, quality, unit })
}

export function buildReportingExportRows(input: ReportingExportInput): ReportingExportRow[] {
  const filters = serializeReportingFilters(input.filters)

  const rows: ReportingExportRow[] = [
    row(filters, { recordType: 'metadata', section: 'Metadata', key: 'generated_at', label: input.generatedAt }),
    row(filters, { recordType: 'metadata', section: 'Metadata', key: 'timezone', label: 'America/Mexico_City' }),
    row(filters, { recordType: 'metadata', section: 'Metadata', key: 'period_from', date: input.filters.from }),
    row(filters, { recordType: 'metadata', section: 'Metadata', key: 'period_through', date: input.filters.through }),
    ...[...input.loadedSources].sort().map(source => row(filters, { recordType: 'metadata' as const, section: 'Metadata', key: 'source', sourceId: source })),
  ]

  if (input.athletes) {
    const definitions: Array<[keyof AthleteReport['summary'], string, string]> = [
      ['active', 'Atletas activos', 'count'],
      ['paused', 'Atletas en pausa', 'count'],
      ['inactive', 'Atletas inactivos', 'count'],
      ['enrollments', 'Altas', 'count'],
      ['pauses', 'Pausas', 'count'],
      ['exits', 'Bajas', 'count'],
      ['reactivations', 'Reactivaciones', 'count'],
      ['retention', 'Retención', 'percent'],
      ['events', 'Eventos', 'count'],
    ]

    definitions.forEach(([name, label, unit]) => {
      const value = input.athletes!.summary[name]

      rows.push(metric(filters, 'Atletas', value.key === 'athleteEnrollments' && name === 'events' ? 'athleteEvents' : value.key, label, value.value, value.quality, unit))
    })
    input.athletes.rows.forEach(item => rows.push(row(filters, {
      recordType: 'detail', section: 'Atletas', key: 'lifecycle_event', date: item.effectiveDate,
      sourceType: 'athlete', sourceId: item.athleteId, status: item.toStatus, category: item.type,
    })))
    input.athletes.statusRows.forEach(item => rows.push(row(filters, {
      recordType: 'detail', section: 'Atletas', key: 'status_at_cutoff', sourceType: 'athlete', sourceId: item.athleteId,
      status: item.status, quality: item.quality,
    })))
  }

  if (input.memberships) {
    const summary = input.memberships.summary

    ;([
      ['expected', 'Mensualidad esperada'],
      ['collected', 'Mensualidad cobrada'],
      ['overdue', 'Mensualidad vencida'],
      ['advanced', 'Mensualidad adelantada'],
      ['receivable', 'Cartera de mensualidades'],
    ] as const).forEach(([key, label]) => rows.push(metric(filters, 'Mensualidades', key, label, summary[key], summary.quality)))
    input.memberships.rows.forEach(item => {
      rows.push(row(filters, {
        recordType: 'detail', section: 'Mensualidades', key: 'obligation', date: item.dueDate ?? `${item.period}-01`,
        sourceType: 'membership', sourceId: `${item.athleteId}:${item.period}`, status: item.status,
        value: item.expected, secondaryValue: item.balance, quality: item.quality, unit: 'currency',
      }))
      item.movements.forEach(movement => rows.push(row(filters, {
        recordType: 'detail', section: 'Mensualidades', key: 'payment', date: movement.effectiveDate,
        sourceType: 'membership-payment', sourceId: movement.id, method: movement.method,
        value: movement.amount, quality: item.quality, unit: 'currency',
      })))
    })
  }

  if (input.inventory) {
    const summary = input.inventory.summary

    ;([
      ['differenceUnits', 'Diferencia en unidades', 'count'],
      ['differenceValue', 'Diferencia valorizada', 'currency'],
      ['recoveredUnits', 'Unidades encontradas', 'count'],
      ['coveredUnits', 'Unidades cubiertas', 'count'],
      ['coveredValue', 'Importe cubierto', 'currency'],
      ['writtenOffValue', 'Fondo perdido', 'currency'],
      ['cashFlow', 'Recuperación efectiva', 'currency'],
    ] as const).forEach(([key, label, unit]) => rows.push(metric(filters, 'Inventario', key, label, summary[key], 'exact', unit)))
    input.inventory.rows.forEach(item => rows.push(row(filters, {
      recordType: 'detail', section: 'Inventario', key: 'closure_line', label: item.productName, date: item.closureDate,
      sourceType: 'inventory-closure', sourceId: `${item.closureId}:${item.productId}`,
      value: item.differenceValue, secondaryValue: item.differenceUnits, quality: 'exact', unit: 'currency',
    })))
    input.inventory.resolutionRows.forEach(item => rows.push(row(filters, {
      recordType: 'detail', section: 'Inventario', key: 'resolution', label: item.productName, date: item.resolutionDate,
      sourceType: 'inventory-resolution', sourceId: item.resolutionId, category: item.kind, method: item.method ?? '',
      value: item.amount, secondaryValue: item.units, quality: 'exact', unit: 'currency',
    })))
  }

  if (input.workforce) {
    const summary = input.workforce.summary

    ;([['accrued', 'Trabajo devengado'], ['paid', 'Trabajo pagado'], ['pending', 'Trabajo pendiente']] as const)
      .forEach(([key, label]) => rows.push(metric(filters, 'Personal', key, label, summary[key], summary.quality)))
    input.workforce.rows.forEach(item => rows.push(row(filters, {
      recordType: 'detail', section: 'Personal', key: 'work_entry', label: item.employeeName, date: item.workDate,
      sourceType: 'work-entry', sourceId: item.entryId, status: item.status, method: item.method ?? '',
      value: item.amount, quality: item.quality, unit: 'currency',
    })))
    input.workforce.settlementRows.forEach(item => rows.push(row(filters, {
      recordType: 'detail', section: 'Personal', key: 'settlement', label: item.employeeName, date: item.paidAt,
      sourceType: 'payroll-settlement', sourceId: item.settlementId, method: item.method,
      value: item.amount, quality: item.quality, unit: 'currency',
    })))
  }

  if (input.store) {
    const summary = input.store.summary

    const labels: Record<keyof StoreReport['summary']['qualityByMetric'], [string, string]> = {
      unitsSold: ['Unidades vendidas', 'count'], recognizedRevenue: ['Venta reconocida', 'currency'], historicalCost: ['Costo histórico', 'currency'],
      grossProfit: ['Utilidad bruta', 'currency'], grossMargin: ['Margen bruto', 'percent'], collected: ['Cobrado', 'currency'],
      recovered: ['Recuperado', 'currency'], receivable: ['Cartera Tienda', 'currency'], cancellations: ['Cancelaciones', 'currency'],
    }

    Object.entries(labels).forEach(([key, [label, unit]]) => {
      const metricKey = key as keyof typeof labels

      rows.push(metric(filters, 'Tienda', metricKey, label, summary[metricKey], summary.qualityByMetric[metricKey], unit))
    })
    input.store.rows.forEach(item => {
      const values = { recognizedRevenue: item.recognizedRevenue, historicalCost: item.historicalCost, collected: item.collected, recovered: item.recovered, receivable: item.receivable, cancellations: item.cancellationAmount }

      Object.entries(values).forEach(([key, value]) => rows.push(row(filters, {
        recordType: 'detail', section: 'Tienda', key, label: item.productName, date: key === 'cancellations' ? item.cancellationDate ?? item.saleDate : item.saleDate,
        sourceType: 'sale', sourceId: `${item.saleId}:${item.productId}`, value, quality: item.quality, unit: 'currency',
      })))
      item.payments.forEach(payment => rows.push(row(filters, {
        recordType: 'detail', section: 'Tienda', key: payment.recovered ? 'recovered_payment' : 'payment', label: item.productName,
        date: payment.appliedAt, sourceType: 'sale-payment', sourceId: payment.paymentId, method: payment.method,
        value: payment.amount, quality: item.quality, unit: 'currency',
      })))
    })
  }

  if (input.finance) {
    const summary = input.finance.summary

    const financeMetrics: Array<[keyof FinanceReport['summary'], string]> = [
      ['recognizedStoreRevenue', 'Venta reconocida'],
      ['storeGrossProfit', 'Utilidad bruta Tienda'],
      ['storeReceivable', 'Cartera Tienda'],
      ['membershipExpected', 'Mensualidad esperada'],
      ['membershipReceivable', 'Cartera mensualidades'],
      ['collected', 'Cobrado efectivo'],
      ['expensesPaid', 'Egresos pagados'],
      ['expensesPending', 'Egresos pendientes'],
      ['expensesScheduled', 'Egresos programados'],
      ['cashFlow', 'Flujo caja'],
      ['bankFlow', 'Flujo banco'],
      ['otherFlow', 'Flujo otro'],
      ['nonCashFlow', 'Flujo no monetario'],
    ]

    financeMetrics.forEach(([key, label]) => rows.push(metric(filters, 'Finanzas', key, label, summary[key])))
    input.finance.movements.forEach(item => rows.push(row(filters, {
      recordType: 'detail', section: 'Finanzas', key: 'movement', date: item.date, sourceType: item.source, sourceId: item.id,
      status: item.direction, method: item.method, account: item.account, value: item.amount, secondaryValue: item.accountAmount,
      quality: 'exact', unit: 'currency',
    })))
    input.finance.expenses.forEach(item => rows.push(row(filters, {
      recordType: 'detail', section: 'Finanzas', key: 'expense', date: item.date, sourceType: 'expense', sourceId: item.id,
      category: item.subcategory ? `${item.category} · ${item.subcategory}` : item.category, status: item.status, method: item.method,
      value: item.amount, quality: 'exact', unit: 'currency',
    })))

    ;([['cashVariance', 'Variación caja'], ['bankVariance', 'Variación banco'], ['totalVariance', 'Variación total']] as const)
      .forEach(([key, label]) => rows.push(metric(filters, 'Conciliación', key, label, summary[key])))
    input.finance.closures.forEach(item => rows.push(row(filters, {
      recordType: 'detail', section: 'Conciliación', key: item.isBaseline ? 'baseline_closure' : 'closure', date: item.date,
      sourceType: 'cash-closure', sourceId: item.id, account: 'cash', value: item.cashVariance, secondaryValue: item.expectedCash,
      quality: 'exact', unit: 'currency',
    }), row(filters, {
      recordType: 'detail', section: 'Conciliación', key: item.isBaseline ? 'baseline_closure' : 'closure', date: item.date,
      sourceType: 'cash-closure', sourceId: item.id, account: 'bank', value: item.bankVariance, secondaryValue: item.expectedBank,
      quality: 'exact', unit: 'currency',
    })))
  }

  return rows.sort((left, right) => sectionOrder.indexOf(left.section) - sectionOrder.indexOf(right.section)
    || recordOrder.indexOf(left.recordType) - recordOrder.indexOf(right.recordType)
    || left.date.localeCompare(right.date) || left.key.localeCompare(right.key) || left.sourceId.localeCompare(right.sourceId))
}

function safeText(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

function csvCell(value: string | number | null) {
  if (value === null)
    return ''
  const text = typeof value === 'number' ? String(value) : safeText(value)

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function serializeReportingCsv(rows: ReportingExportRow[]) {
  const values = (item: ReportingExportRow): Array<string | number | null> => [
    item.schemaVersion,
    item.recordType,
    item.section,
    item.key,
    item.label,
    item.date,
    item.sourceType,
    item.sourceId,
    item.category,
    item.status,
    item.method,
    item.account,
    item.unit,
    item.value,
    item.secondaryValue,
    item.quality,
    item.filters,
  ]

  return `\uFEFF${headers.join(',')}\r\n${rows.map(item => values(item).map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function reportingExportFilename(filters: ReportingFilters) {
  return `kronos-reportes_${filters.from}_${filters.through}.csv`
}

export interface ReportingDownloadEnvironment {
  makeBlob: (content: string) => unknown
  createObjectUrl: (blob: unknown) => string
  clickDownload: (url: string, filename: string) => void
  revokeObjectUrl: (url: string) => void
  scheduleRevoke?: (callback: () => void) => void
}

const browserDownloadEnvironment = (): ReportingDownloadEnvironment => ({
  makeBlob: content => new Blob([content], { type: 'text/csv;charset=utf-8' }),
  createObjectUrl: blob => URL.createObjectURL(blob as Blob),
  clickDownload: (url, filename) => {
    const link = document.createElement('a')

    link.href = url
    link.download = filename
    link.hidden = true
    document.body.append(link)
    link.click()
    link.remove()
  },
  revokeObjectUrl: url => URL.revokeObjectURL(url),
  scheduleRevoke: callback => setTimeout(callback, 0),
})

export function downloadReportingCsv(content: string, filename: string, environment = browserDownloadEnvironment()) {
  const blob = environment.makeBlob(content)
  const url = environment.createObjectUrl(blob)

  try {
    environment.clickDownload(url, filename)
  }
  finally {
    const revoke = () => environment.revokeObjectUrl(url)

    if (environment.scheduleRevoke)
      environment.scheduleRevoke(revoke)
    else
      revoke()
  }
}
