import type { ReportingDataQuality, ReportingFilters } from '@/types/reporting'
import type { FinanceReport } from './reporting-finance'
import type { MembershipReport } from './reporting-memberships'
import type { AthleteReport } from './reporting-athletes'
import type { InventoryReport } from './reporting-inventory'
import type { WorkforceReport } from './reporting-workforce'
import { currency } from './reporting-metrics'

export interface ReportingChartPoint {
  bucket: string
  label: string
  values: Record<string, number | null>
  quality: ReportingDataQuality
}

export interface ReportingChartModel {
  title: string
  description: string
  unit: 'currency' | 'count' | 'percent'
  series: Array<{ key: string; label: string; kind: 'bar' | 'line' }>
  points: ReportingChartPoint[]
  state: 'ready' | 'empty' | 'partial' | 'unavailable'
}

type Granularity = 'day' | 'month' | 'year'
type Range = Pick<ReportingFilters, 'from' | 'through'>

export function chartGranularity(range: Range): Granularity {
  const days = Math.round((Date.parse(`${range.through}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1

  return days <= 45 ? 'day' : days <= 730 ? 'month' : 'year'
}

function bucket(date: string, granularity: Granularity): string {
  return granularity === 'day' ? date : granularity === 'month' ? date.slice(0, 7) : date.slice(0, 4)
}

function model(title: string, description: string, unit: ReportingChartModel['unit'], series: ReportingChartModel['series'], points: ReportingChartPoint[]): ReportingChartModel {
  return { title, description, unit, series, points: points.sort((a, b) => a.bucket.localeCompare(b.bucket)), state: !points.length ? 'empty' : points.some(point => point.quality !== 'exact' || Object.values(point.values).some(value => value === null)) ? 'partial' : 'ready' }
}

function add(points: Map<string, ReportingChartPoint>, date: string, granularity: Granularity, key: string, amount: number, initialKeys: string[]) {
  const id = bucket(date, granularity)
  const point = points.get(id) ?? { bucket: id, label: id, values: Object.fromEntries(initialKeys.map(item => [item, 0])), quality: 'exact' as const }

  point.values[key] = currency((point.values[key] ?? 0) + amount)
  points.set(id, point)
}

export type FinanceChartAccount = 'total' | 'cash' | 'bank' | 'other'

export function buildFinanceChart(report: FinanceReport, range: Range, account: FinanceChartAccount): ReportingChartModel {
  const points = new Map<string, ReportingChartPoint>()
  const granularity = chartGranularity(range)
  for (const movement of report.movements) {
    if (movement.account === 'non-cash' || account !== 'total' && movement.account !== account)
      continue
    add(points, movement.date, granularity, movement.direction === 'income' ? 'income' : 'expense', movement.accountAmount, ['income', 'expense', 'net'])
    add(points, movement.date, granularity, 'net', movement.direction === 'income' ? movement.accountAmount : -movement.accountAmount, ['income', 'expense', 'net'])
  }

  return model('Flujo monetario', 'Entradas y salidas efectivas por fecha de movimiento; el no monetario se muestra por separado y no integra el flujo.', 'currency', [
    { key: 'income', label: 'Entradas', kind: 'bar' }, { key: 'expense', label: 'Egresos', kind: 'bar' }, { key: 'net', label: 'Flujo neto', kind: 'line' },
  ], [...points.values()])
}

export function buildReconciliationChart(report: FinanceReport): ReportingChartModel {
  return model('Variaciones de cierres', 'Contado menos esperado; baseline identificada. Estas variaciones no integran el flujo.', 'currency', [
    { key: 'cash', label: 'Caja', kind: 'bar' }, { key: 'bank', label: 'Banco', kind: 'bar' },
  ], report.closures.map(closure => ({ bucket: `${closure.date}:${closure.id}`, label: `${closure.date}${closure.isBaseline ? ' · baseline' : ''}`, values: { cash: currency(closure.cashVariance), bank: currency(closure.bankVariance) }, quality: 'exact' })))
}

export function buildMembershipChart(report: MembershipReport, range: Range): ReportingChartModel {
  const points = new Map<string, ReportingChartPoint>()
  for (const row of report.rows) {
    const point = points.get(row.period) ?? { bucket: row.period, label: row.period, values: { expected: 0, collected: 0, receivable: 0 }, quality: 'exact' as ReportingDataQuality }
    const expectedInRange = row.dueDate ? row.dueDate >= range.from && row.dueDate <= range.through : `${row.period}-01` >= `${range.from.slice(0, 7)}-01` && `${row.period}-01` <= `${range.through.slice(0, 7)}-01`
    if (expectedInRange)
      point.values.expected = row.expected === null ? null : point.values.expected === null ? null : currency(point.values.expected + row.expected)
    point.values.collected = currency((point.values.collected ?? 0) + row.collected)
    point.values.receivable = row.balance === null ? null : point.values.receivable === null ? null : currency(point.values.receivable + row.balance)
    if (row.quality !== 'exact') point.quality = row.quality
    points.set(row.period, point)
  }

  if (report.summary.expected === null) for (const point of points.values()) point.values.expected = null
  if (report.summary.receivable === null) for (const point of points.values()) point.values.receivable = null

  return model('Mensualidades por periodo', 'Esperado según vencimiento, cobrado en el filtro y saldo pendiente al corte. Los valores desconocidos permanecen vacíos.', 'currency', [
    { key: 'expected', label: 'Esperado', kind: 'bar' }, { key: 'collected', label: 'Cobrado', kind: 'bar' }, { key: 'receivable', label: 'Pendiente al corte', kind: 'bar' },
  ], [...points.values()])
}

export function buildAthleteChart(report: AthleteReport, range: Range): ReportingChartModel {
  const points = new Map<string, ReportingChartPoint>()
  const granularity = chartGranularity(range)
  const keys = ['enrollments', 'pauses', 'exits', 'reactivations']
  const eventKey: Record<string, string> = { created: 'enrollments', paused: 'pauses', inactive: 'exits', reactivated: 'reactivations' }
  for (const row of report.rows) {
    const key = eventKey[row.type]
    if (key) add(points, row.effectiveDate, granularity, key, 1, keys)
  }

  const chart = model('Transiciones de atletas', 'Eventos por fecha efectiva; no representa el total de atletas activos. Un histórico legado parcial puede omitir altas sin evento.', 'count', [
    { key: 'enrollments', label: 'Altas', kind: 'bar' }, { key: 'pauses', label: 'Pausas', kind: 'bar' }, { key: 'exits', label: 'Bajas', kind: 'bar' }, { key: 'reactivations', label: 'Reactivaciones', kind: 'bar' },
  ], [...points.values()])

  if (report.summary.enrollments.quality !== 'exact' && chart.state === 'ready') chart.state = 'partial'

  return chart
}

export function buildInventoryChart(report: InventoryReport): ReportingChartModel {
  const grouped = new Map<string, ReportingChartPoint>()
  for (const row of report.rows) {
    const id = `${row.closureId}:${row.productId}`
    const point = grouped.get(id) ?? { bucket: id, label: `${row.productName} · ${row.closureDate}`, values: { difference: 0, covered: 0, writtenOff: 0 }, quality: 'exact' as const }

    point.values.difference = currency((point.values.difference ?? 0) + row.differenceValue)
    point.values.covered = currency((point.values.covered ?? 0) + row.coveredValue)
    point.values.writtenOff = currency((point.values.writtenOff ?? 0) + row.writtenOffValue)
    grouped.set(id, point)
  }
  const sorted = [...grouped.values()].sort((a, b) => Math.abs(b.values.difference ?? 0) - Math.abs(a.values.difference ?? 0) || a.bucket.localeCompare(b.bucket))
  const visible = sorted.slice(0, 10)
  if (sorted.length > 10) {
    const other = { bucket: 'zz-otros', label: 'Otros', values: { difference: 0, covered: 0, writtenOff: 0 }, quality: 'exact' as const }
    for (const point of sorted.slice(10)) for (const key of Object.keys(other.values) as Array<keyof typeof other.values>) other.values[key] = currency(other.values[key] + (point.values[key] ?? 0))
    visible.push(other)
  }

  const chart = model('Diferencias de inventario', 'Importes por producto; Otros reúne el resto. Resoluciones y diferencias son conceptos separados.', 'currency', [
    { key: 'difference', label: 'Diferencia neta', kind: 'bar' }, { key: 'covered', label: 'Faltante cubierto', kind: 'bar' }, { key: 'writtenOff', label: 'Fondo perdido', kind: 'bar' },
  ], visible)

  chart.points = visible

  return chart
}

export function buildWorkforceChart(report: WorkforceReport, range: Range): ReportingChartModel {
  const points = new Map<string, ReportingChartPoint>()
  const granularity = chartGranularity(range)
  const keys = ['accrued', 'paid', 'pending']
  for (const row of report.rows) {
    if (row.accruedInPeriod) add(points, row.workDate, granularity, 'accrued', row.amount, keys)
    if (row.pendingAtCutoff) add(points, row.workDate, granularity, 'pending', row.amount, keys)
  }
  for (const settlement of report.settlementRows) {
    if (settlement.quality === 'exact') add(points, settlement.paidAt, granularity, 'paid', settlement.amount, keys)
  }

  const chart = model('Devengo, pagos y pendiente', 'Devengado por fecha de trabajo; pagado por liquidación; pendiente al corte agrupado por fecha del trabajo de origen.', 'currency', [
    { key: 'accrued', label: 'Devengado', kind: 'bar' }, { key: 'paid', label: 'Pagado', kind: 'bar' }, { key: 'pending', label: 'Pendiente al corte', kind: 'bar' },
  ], [...points.values()])

  if (report.summary.quality !== 'exact' && chart.state === 'ready') chart.state = 'partial'

  return chart
}
