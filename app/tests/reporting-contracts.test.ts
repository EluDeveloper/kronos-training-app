import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dateForBusinessTimeZone, normalizeReportingFilters, parseReportingFilters, reportingPeriodComparison, reportingPeriodRange, serializeReportingFilters } from '../src/utils/reporting-periods'
import { allocateCentsProportionally, currency, metricDefinitions } from '../src/utils/reporting-metrics'

test('normaliza filtros de productos y conserva los límites compartibles', () => {
  const filters = normalizeReportingFilters({
    from: '2026-01-01',
    through: '2026-01-31',
    productIds: ['p2', 'p1', 'p2'],
    athleteId: ' a1 ',
    paymentMethod: 'transfer',
  })

  assert.deepEqual(filters, {
    from: '2026-01-01',
    through: '2026-01-31',
    productIds: ['p1', 'p2'],
    athleteId: 'a1',
    paymentMethod: 'transfer',
  })
  assert.deepEqual(parseReportingFilters(serializeReportingFilters(filters)), filters)
})

test('separa y restaura los estados de atleta y mensualidad sin colisión', () => {
  const filters = normalizeReportingFilters({
    from: '2026-10-01',
    through: '2026-10-31',
    athleteStatus: 'paused',
    membershipStatus: 'overdue',
  })

  assert.deepEqual(parseReportingFilters(serializeReportingFilters(filters)), {
    from: '2026-10-01',
    through: '2026-10-31',
    productIds: [],
    athleteStatus: 'paused',
    membershipStatus: 'overdue',
  })
})

test('separa y restaura filtros de inventario y personal sin colisionar con otros dominios', () => {
  const filters = normalizeReportingFilters({
    from: '2026-10-01',
    through: '2026-10-31',
    productIds: ['p1'],
    employeeId: ' e1 ',
    workStatus: 'approved',
    inventoryResolutionKind: 'covered',
    paymentMethod: 'cash',
  })

  assert.deepEqual(parseReportingFilters(serializeReportingFilters(filters)), {
    from: '2026-10-01',
    through: '2026-10-31',
    productIds: ['p1'],
    employeeId: 'e1',
    workStatus: 'approved',
    inventoryResolutionKind: 'covered',
    paymentMethod: 'cash',
  })
})

test('separa y restaura filtros financieros sin colisionar con filtros compartidos', () => {
  const filters = normalizeReportingFilters({
    from: '2026-10-01',
    through: '2026-10-31',
    paymentMethod: 'card',
    financialAccount: 'bank',
    expenseCategory: ' Operación ',
    expenseStatus: 'pending',
  })

  assert.deepEqual(parseReportingFilters(serializeReportingFilters(filters)), {
    from: '2026-10-01',
    through: '2026-10-31',
    productIds: [],
    paymentMethod: 'card',
    financialAccount: 'bank',
    expenseCategory: 'Operación',
    expenseStatus: 'pending',
  })
})

test('restaura filtros aunque la URL de detalle termine en un fragmento de navegación', () => {
  assert.deepEqual(parseReportingFilters('?from=2026-08-01&through=2026-08-31&paymentMethod=transfer#executive-overview-title'), {
    from: '2026-08-01',
    through: '2026-08-31',
    productIds: [],
    paymentMethod: 'transfer',
  })
})

test('genera periodos calendario en hora local de Ciudad de México', () => {
  assert.deepEqual(reportingPeriodRange({ kind: 'month', value: '2026-02' }), {
    from: '2026-02-01',
    through: '2026-02-28',
  })
  assert.deepEqual(reportingPeriodRange({ kind: 'week', value: '2026-09-24' }), {
    from: '2026-09-21',
    through: '2026-09-27',
  })
  assert.equal(dateForBusinessTimeZone('2026-01-01T05:30:00.000Z'), '2025-12-31')
  assert.deepEqual(reportingPeriodComparison({ from: '2024-02-29', through: '2024-02-29' }, 'year-over-year'), {
    current: { from: '2024-02-29', through: '2024-02-29' },
    previous: { from: '2023-02-28', through: '2023-02-28' },
  })
})

test('redondea moneda y distribuye cada centavo de forma estable', () => {
  assert.equal(currency(1.005), 1.01)

  const shares = allocateCentsProportionally(100, [{ id: 'b', weight: 1 }, { id: 'a', weight: 1 }, { id: 'c', weight: 1 }])

  assert.deepEqual(shares, { a: 33.34, b: 33.33, c: 33.33 })
  assert.equal(Object.values(shares).reduce((sum, amount) => sum + amount, 0), 100)
})

test('el diccionario distingue cobro, saldo, utilidad bruta y flujo', () => {
  const concepts = new Map(metricDefinitions.map(metric => [metric.key, metric.label]))

  assert.equal(concepts.get('recognizedRevenue'), 'Venta reconocida')
  assert.equal(concepts.get('collected'), 'Cobrado')
  assert.equal(concepts.get('receivable'), 'Cuentas por cobrar')
  assert.equal(concepts.get('grossProfit'), 'Utilidad bruta')
  assert.equal(concepts.get('cashFlow'), 'Flujo de efectivo')
})
