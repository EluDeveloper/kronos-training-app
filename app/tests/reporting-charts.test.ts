import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chartGranularity, buildFinanceChart, buildReconciliationChart, buildMembershipChart, buildInventoryChart, buildAthleteChart, buildWorkforceChart } from '../src/utils/reporting-charts'

const range = { from: '2026-08-01', through: '2026-08-31', productIds: [] }

test('agrupa por amplitud del periodo', () => {
  assert.equal(chartGranularity(range), 'day')
  assert.equal(chartGranularity({ ...range, through: '2026-11-01' }), 'month')
  assert.equal(chartGranularity({ ...range, through: '2029-08-01' }), 'year')
})

test('finanzas separa cuentas monetarias y no monetarias', () => {
  const report = { movements: [
    { date: '2026-08-02', account: 'cash', direction: 'income', accountAmount: 50 },
    { date: '2026-08-02', account: 'bank', direction: 'expense', accountAmount: 20 },
    { date: '2026-08-03', account: 'non-cash', direction: 'income', accountAmount: 12 },
  ] } as Parameters<typeof buildFinanceChart>[0]

  const model = buildFinanceChart(report, range, 'total')

  assert.equal(model.points.reduce((sum, point) => sum + (point.values.net ?? 0), 0), 30)
  assert.equal(buildFinanceChart(report, range, 'cash').points.reduce((sum, point) => sum + (point.values.net ?? 0), 0), 50)
})

test('conciliación conserva el signo y marca baseline', () => {
  const report = { closures: [
    { id: 'a', date: '2026-08-02', cashVariance: -4, bankVariance: 2, isBaseline: true },
  ] } as Parameters<typeof buildReconciliationChart>[0]

  const model = buildReconciliationChart(report)

  assert.deepEqual(model.points[0]?.values, { cash: -4, bank: 2 })
  assert.match(model.points[0]?.label ?? '', /base/i)
})

test('mensualidades no convierte desconocidos a cero', () => {
  const report = { summary: { expected: null, receivable: null, quality: 'unavailable' }, rows: [
    { period: '2026-08', dueDate: null, expected: null, collected: 10, balance: null, quality: 'unavailable' },
  ] } as Parameters<typeof buildMembershipChart>[0]

  const model = buildMembershipChart(report, range)

  assert.equal(model.points[0]?.values.expected, null)
  assert.equal(model.points[0]?.values.receivable, null)
  assert.equal(model.points[0]?.values.collected, 10)
})

test('inventario conserva el total en Otros', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ closureId: 'c1', closureDate: '2026-08-01', productId: `p${index}`, productName: `Producto ${index}`, differenceValue: index + 1, coveredValue: 0, writtenOffValue: 0 }))
  const model = buildInventoryChart({ rows } as Parameters<typeof buildInventoryChart>[0])

  assert.equal(model.points.length, 11)
  assert.equal(model.points.reduce((sum, point) => sum + (point.values.difference ?? 0), 0), 78)
  assert.equal(model.points.at(-1)?.label, 'Otros')
})

test('atletas cuenta eventos por fecha efectiva sin confundir estados', () => {
  const report = { summary: { enrollments: { quality: 'exact' } }, rows: [
    { effectiveDate: '2026-08-02', type: 'created' },
    { effectiveDate: '2026-08-03', type: 'paused' },
  ] } as Parameters<typeof buildAthleteChart>[0]

  const model = buildAthleteChart(report, range)

  assert.equal(model.points.reduce((sum, point) => sum + (point.values.enrollments ?? 0), 0), 1)
  assert.equal(model.points.reduce((sum, point) => sum + (point.values.pauses ?? 0), 0), 1)
})

test('personal atribuye pago a liquidación y pendiente a fecha del trabajo', () => {
  const report = { summary: { quality: 'exact' }, rows: [
    { workDate: '2026-08-02', amount: 100, accruedInPeriod: true, pendingAtCutoff: true },
    { workDate: '2026-08-03', amount: 200, accruedInPeriod: true, pendingAtCutoff: false },
  ], settlementRows: [{ paidAt: '2026-08-20', amount: 200, quality: 'exact' }] } as Parameters<typeof buildWorkforceChart>[0]

  const model = buildWorkforceChart(report, range)

  assert.equal(model.points.reduce((sum, point) => sum + (point.values.accrued ?? 0), 0), 300)
  assert.equal(model.points.reduce((sum, point) => sum + (point.values.paid ?? 0), 0), 200)
  assert.equal(model.points.reduce((sum, point) => sum + (point.values.pending ?? 0), 0), 100)
})
