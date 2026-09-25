import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import type { Sale } from '../src/types/domain'
import type { ReportingFilters } from '../src/types/reporting'
import { buildExecutiveStoreMetrics, buildStoreDetailRecords, buildStoreTimeline, storeMetricFromQuery } from '../src/utils/reporting-executive'
import { resolveReportingLoadState } from '../src/utils/reporting-load-state'
import { buildStoreReport } from '../src/utils/reporting-store'
import { createReportingStoreQaFixture, reportingStoreQaFilters } from '../src/utils/reporting-store-qa-fixture'
import { createReportingAthletesMembershipsQaFixture, reportingAthletesMembershipsQaFilters } from '../src/utils/reporting-athletes-memberships-qa-fixture'
import { buildAthleteReport, buildAthleteTimeline } from '../src/utils/reporting-athletes'
import { buildMembershipReport } from '../src/utils/reporting-memberships'
import { createReportingInventoryWorkforceQaFixture, reportingInventoryWorkforceQaFilters } from '../src/utils/reporting-inventory-workforce-qa-fixture'
import { buildInventoryReport } from '../src/utils/reporting-inventory'
import { buildWorkforceReport } from '../src/utils/reporting-workforce'
import { createReportingFinanceQaFixture, reportingFinanceQaFilters } from '../src/utils/reporting-finance-qa-fixture'
import { buildFinanceReport } from '../src/utils/reporting-finance'

const timestamp = (day: string) => new Date(`${day}T12:00:00-06:00`).getTime()
const filters: ReportingFilters = { from: '2026-08-01', through: '2026-08-31', productIds: [] }

const sale: Sale = {
  id: 's1', customerName: 'No debe aparecer', athleteId: 'a1', total: 100, status: 'credit',
  createdAt: timestamp('2026-08-02'), updatedAt: timestamp('2026-08-10'),
  items: { p1: { productId: 'p1', name: 'Producto A', quantity: 2, unitPrice: 50, unitCost: 20 } },
  payments: {
    p1: { id: 'p1', amountApplied: 25, method: 'cash', appliedAt: timestamp('2026-08-02') },
    p2: { id: 'p2', amountApplied: 25, method: 'transfer', appliedAt: timestamp('2026-08-10') },
  },
}

test('el fixture QA sintético concilia Tienda y sólo contiene campos permitidos', () => {
  const dataset = createReportingStoreQaFixture('2026-08-01', '2026-08-31')
  const report = buildStoreReport(dataset.sales, filters)
  const cards = buildExecutiveStoreMetrics(report.summary)

  assert.deepEqual(dataset.sources, ['athletes', 'visits', 'store'])
  assert.deepEqual(dataset.loadedSources, ['athletes', 'visits', 'store'])
  assert.equal(report.summary.recognizedRevenue, 120)
  assert.equal(report.summary.collected, 55)
  assert.equal(report.summary.recovered, 25)
  assert.equal(report.summary.receivable, 65)
  assert.deepEqual(reportingStoreQaFilters('2026-09-25'), {
    from: '2026-09-19',
    through: '2026-09-25',
    productIds: [],
  })
  assert.equal(cards.find(card => card.key === 'recognizedRevenue')?.value, 120)
  assert.ok(dataset.sales.every(item => !('customerName' in item) && !('visitorId' in item)))
})

test('el fixture QA de Fase 4 recorre atletas y mensualidades sin PII ni escrituras', () => {
  const dataset = createReportingAthletesMembershipsQaFixture()
  const phaseFilters = reportingAthletesMembershipsQaFilters()
  const athletes = buildAthleteReport(dataset.athletes, phaseFilters)
  const memberships = buildMembershipReport(dataset.payments, phaseFilters)

  assert.deepEqual(dataset.sources, ['athletes', 'memberships'])
  assert.equal(athletes.summary.pauses.value, 1)
  assert.equal(athletes.summary.reactivations.value, 1)
  assert.equal(memberships.summary.expected, 500)
  assert.equal(memberships.summary.collected, 200)
  assert.equal(memberships.summary.overdue, 300)
  assert.deepEqual(memberships.rows[0]?.movements, [{ id: 'qa-installment-advance', amount: 200, method: 'transfer', effectiveDate: '2026-10-01' }])
  assert.equal(JSON.stringify(dataset).includes('phone'), false)
  assert.equal(JSON.stringify(dataset).includes('name'), false)
  assert.deepEqual(buildAthleteTimeline(athletes.rows, 'day').map(point => [point.bucket, point.pauses, point.reactivations]), [
    ['2026-10-05', 1, 0],
    ['2026-10-10', 0, 1],
  ])
  assert.deepEqual(buildAthleteTimeline(athletes.rows, 'month').map(point => [point.bucket, point.events]), [['2026-10', 2]])
  assert.deepEqual(buildAthleteTimeline(athletes.rows, 'year').map(point => [point.bucket, point.events]), [['2026', 2]])
})

test('el fixture QA de Fase 5 concilia Inventario y Personal sin texto libre', () => {
  const dataset = createReportingInventoryWorkforceQaFixture()
  const phaseFilters = reportingInventoryWorkforceQaFilters()
  const inventory = buildInventoryReport(dataset.inventoryClosures, dataset.inventoryResolutions, phaseFilters)
  const workforce = buildWorkforceReport(dataset.workEntries, dataset.payrollSettlements, phaseFilters)

  assert.deepEqual(dataset.sources, ['inventory', 'workforce'])
  assert.deepEqual(dataset.loadedSources, ['inventory', 'workforce'])
  assert.equal(inventory.summary.differenceValue, -30)
  assert.equal(inventory.summary.coveredValue, 10)
  assert.equal(inventory.summary.writtenOffValue, 10)
  assert.equal(inventory.resolutionRows.some(row => row.kind === 'corrected'), true)
  assert.equal(workforce.summary.accrued, 300)
  assert.equal(workforce.summary.paid, 200)
  assert.equal(workforce.summary.pending, 100)
  assert.equal(workforce.summary.quality, 'exact')
  assert.equal(JSON.stringify(dataset).includes('phone'), false)
  assert.equal(JSON.stringify(dataset).includes('note'), false)
  assert.equal(JSON.stringify(dataset).includes('reference'), false)
  assert.equal(JSON.stringify(dataset).includes('createdBy'), false)
})

test('el fixture QA de Fase 6 concilia Finanzas y cierres sin texto libre', () => {
  const dataset = createReportingFinanceQaFixture()

  const report = buildFinanceReport({
    sales: dataset.sales,
    membershipPayments: dataset.payments,
    visitPayments: dataset.visitPayments,
    expenses: dataset.expenses,
    cashClosures: dataset.cashClosures,
    inventoryRecoveries: dataset.inventoryResolutions,
  }, reportingFinanceQaFilters())

  assert.deepEqual(dataset.sources, ['store', 'memberships', 'visit-payments', 'expenses', 'cash-closures', 'inventory'])
  assert.equal(report.summary.recognizedStoreRevenue, 120)
  assert.equal(report.summary.collected, 230)
  assert.equal(report.summary.expensesPaid, 50)
  assert.equal(report.summary.cashFlow, 100)
  assert.equal(report.summary.bankFlow, 80)
  assert.equal(report.summary.totalVariance, -5)
  assert.equal(report.movements.length, 6)
  assert.equal(JSON.stringify(dataset).includes('description'), false)
  assert.equal(JSON.stringify(dataset).includes('phone'), false)
  assert.equal(JSON.stringify(dataset).includes('closedBy'), false)
})

test('restaura sólo métricas de Tienda válidas desde la URL', () => {
  assert.equal(storeMetricFromQuery('collected'), 'collected')
  assert.equal(storeMetricFromQuery('cashFlow'), null)
  assert.equal(storeMetricFromQuery(['collected']), null)
})

test('las tarjetas ejecutivas exponen definiciones, unidades y calidad métrica individual', () => {
  const report = buildStoreReport([sale], filters)
  const cards = buildExecutiveStoreMetrics(report.summary)
  const cost = cards.find(card => card.key === 'historicalCost')!
  const collected = cards.find(card => card.key === 'collected')!

  assert.equal(cost.label, 'Costo histórico')
  assert.equal(cost.value, 40)
  assert.equal(cost.unit, 'currency')
  assert.equal(cost.quality, 'exact')
  assert.match(cost.meaning, /Costo unitario/)
  assert.equal(collected.value, 50)
  assert.equal(collected.attribution, 'movement-date')
  assert.equal(cards.find(card => card.key === 'cancellations')?.attribution, 'event-date')
})

test('un costo legado desconocido produce valor no disponible en tarjetas de utilidad', () => {
  const legacy = {
    ...sale,
    items: { p1: { productId: 'p1', name: 'Producto legado', quantity: 2, unitPrice: 50 } },
  } as unknown as Sale

  const cards = buildExecutiveStoreMetrics(buildStoreReport([legacy], filters).summary)

  assert.equal(cards.find(card => card.key === 'historicalCost')?.value, null)
  assert.equal(cards.find(card => card.key === 'grossProfit')?.value, null)
  assert.equal(cards.find(card => card.key === 'grossMargin')?.quality, 'partial-history')
})

test('la gráfica separa venta reconocida por fecha de venta y cobro/recuperación por fecha de movimiento', () => {
  const report = buildStoreReport([sale], filters)
  const timeline = buildStoreTimeline(report, filters)

  assert.deepEqual(timeline.map(point => [point.bucket, point.recognizedRevenue, point.collected, point.recovered]), [
    ['2026-08-02', 100, 25, 0],
    ['2026-08-10', 0, 25, 25],
  ])
  assert.equal(timeline.reduce((sum, point) => sum + point.recognizedRevenue, 0), report.summary.recognizedRevenue)
  assert.equal(timeline.reduce((sum, point) => sum + point.collected, 0), report.summary.collected)
})

test('el drill-down de KPIs conserva la conciliación y llega a los IDs de ventas y pagos', () => {
  const report = buildStoreReport([sale], filters)
  const sales = buildStoreDetailRecords(report, 'recognizedRevenue')
  const collections = buildStoreDetailRecords(report, 'collected')
  const recoveries = buildStoreDetailRecords(report, 'recovered')

  assert.equal(sales.reduce((sum, record) => sum + (record.amount ?? 0), 0), report.summary.recognizedRevenue)
  assert.equal(collections.reduce((sum, record) => sum + (record.amount ?? 0), 0), report.summary.collected)
  assert.equal(recoveries.reduce((sum, record) => sum + (record.amount ?? 0), 0), report.summary.recovered)
  assert.deepEqual(collections.map(record => record.payment?.id), ['p1', 'p2'])
  assert.equal(sales[0]?.saleId, 's1')
})

test('el detalle de utilidad mantiene el costo desconocido visible como parcial', () => {
  const legacy = {
    ...sale,
    items: { p1: { productId: 'p1', name: 'Producto legado', quantity: 2, unitPrice: 50 } },
  } as unknown as Sale

  const report = buildStoreReport([legacy], filters)
  const records = buildStoreDetailRecords(report, 'grossProfit')

  assert.equal(records.length, 1)
  assert.equal(records[0]?.amount, null)
  assert.equal(records[0]?.quality, 'partial-history')
})

test('el detalle de cancelación usa su fecha efectiva y no la fecha original de venta', () => {
  const cancelled: Sale = { ...sale, status: 'cancelled', cancelledAt: timestamp('2026-08-20') }
  const records = buildStoreDetailRecords(buildStoreReport([cancelled], filters), 'cancellations')

  assert.equal(records[0]?.date, '2026-08-20')
})

test('los periodos extensos agrupan tendencias por mes para evitar series diarias enormes', () => {
  const saleAtEnd = { ...sale, id: 's2', createdAt: timestamp('2026-12-12'), updatedAt: timestamp('2026-12-12') }
  const longRange = { from: '2026-01-01', through: '2026-12-31', productIds: [] }
  const timeline = buildStoreTimeline(buildStoreReport([sale, saleAtEnd], longRange), longRange)

  assert.equal(timeline.some(point => point.bucket === '2026-08'), true)
  assert.equal(timeline.some(point => point.bucket === '2026-12'), true)
  assert.equal(timeline.some(point => point.bucket.length === 10), false)
})

test('el estado de carga contempla datos de Tienda aunque las fuentes operativas estén vacías', () => {
  assert.equal(resolveReportingLoadState({ sources: ['store'], loadedSources: ['store'], hasAnyData: true }), 'ready')
  assert.equal(resolveReportingLoadState({ sources: ['store'], loadedSources: ['store'], hasAnyData: false }), 'empty')
  assert.equal(resolveReportingLoadState({ sources: ['store'], loadedSources: [], errors: ['store'], hasAnyData: false }), 'error')
  assert.equal(buildExecutiveStoreMetrics(buildStoreReport([], filters).summary).find(card => card.key === 'grossMargin')?.quality, 'unavailable')
})

test('la exportación se integra como acción Admin accesible y sin navegación', () => {
  const page = readFileSync(new URL('../src/pages/reportes.vue', import.meta.url), 'utf8')
  const button = readFileSync(new URL('../src/components/kronos/reports/ReportExportButton.vue', import.meta.url), 'utf8')

  assert.match(page, /v-if="session\.isAdmin"/)
  assert.match(page, /<ReportExportButton/)
  assert.match(button, />\s*Exportar CSV\s*</)
  assert.match(button, /aria-live="polite"/)
  assert.match(button, /downloadReportingCsv/)
  assert.doesNotMatch(button, /router|href=/i)
})
