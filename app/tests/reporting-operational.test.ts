import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Athlete, InventoryClosure, InventoryResolution, Payment } from '../src/types/domain'
import type { PayrollSettlement, WorkEntry } from '../src/types/workforce'
import { buildAthleteReport } from '../src/utils/reporting-athletes'
import { buildMembershipReport } from '../src/utils/reporting-memberships'
import { buildInventoryReport } from '../src/utils/reporting-inventory'
import { buildWorkforceReport } from '../src/utils/reporting-workforce'

const filters = { from: '2026-01-01', through: '2026-12-31', productIds: [] as string[] }

test('cuenta eventos de atleta y marca el legado incompleto sin reconstruirlo', () => {
  const athlete: Athlete = {
    id: 'a1', profile: { name: 'Atleta QA', phone: '0000000000' }, membership: { schedule: 'AM', planId: 'm1', agreedAmount: 500, paymentDay: 5, registrationDate: '2026-01-01' },
    status: 'active', createdAt: Date.parse('2026-01-01T12:00:00-06:00'), updatedAt: Date.parse('2026-03-01T12:00:00-06:00'),
    lifecycleEvents: {
      created: { id: 'created', athleteId: 'a1', type: 'created', fromStatus: null, toStatus: 'active', effectiveDate: '2026-01-01', reason: 'Alta', createdBy: 'admin', createdAt: 1 },
      pause: { id: 'pause', athleteId: 'a1', type: 'paused', fromStatus: 'active', toStatus: 'paused', effectiveDate: '2026-02-01', reason: 'Pausa', createdBy: 'admin', createdAt: 2 },
      return: { id: 'return', athleteId: 'a1', type: 'reactivated', fromStatus: 'paused', toStatus: 'active', effectiveDate: '2026-03-01', reason: 'Regreso', createdBy: 'admin', createdAt: 3 },
    },
  }

  const legacy = { ...athlete, id: 'legacy', lifecycleEvents: undefined, migrationNeedsReview: true }
  const report = buildAthleteReport([athlete, legacy], filters)

  assert.equal(report.summary.enrollments.value, 2)
  assert.equal(report.summary.pauses.value, 1)
  assert.equal(report.summary.reactivations.value, 1)
  assert.equal(report.summary.retention.value, null)
  assert.equal(report.summary.events.quality, 'partial-history')
})

test('aplica el estado de atleta sin mezclarlo con otros estados del reporte', () => {
  const active = { id: 'active', status: 'active', createdAt: 1, lifecycleEvents: { created: { id: 'created', athleteId: 'active', type: 'created', fromStatus: null, toStatus: 'active', effectiveDate: '2026-01-01', createdAt: 1 } } }
  const paused = { id: 'paused', status: 'paused', createdAt: 1, lifecycleEvents: { paused: { id: 'paused-event', athleteId: 'paused', type: 'paused', fromStatus: 'active', toStatus: 'paused', effectiveDate: '2026-02-01', createdAt: 2 } } }

  const report = buildAthleteReport([active, paused] as never, { ...filters, athleteStatus: 'paused' })

  assert.equal(report.summary.paused.value, 1)
  assert.equal(report.summary.active.value, 0)
  assert.deepEqual(report.rows.map(row => row.athleteId), ['paused'])
})

test('calcula obligaciones y adelantos desde snapshots e installments efectivos', () => {
  const payment: Payment = {
    athleteId: 'a1', period: '2026-10', status: 'paid', amount: 200, totalAmount: 500, balance: 300,
    snapshot: { planId: 'plan-snapshot', agreedAmount: 500, paymentDay: 5, dueDate: '2026-10-05' },
    installments: { i1: { id: 'i1', amountApplied: 200, method: 'cash', appliedAt: Date.parse('2026-09-20T12:00:00-06:00'), balanceAfter: 300 } },
    createdAt: Date.parse('2026-09-20T12:00:00-06:00'), updatedAt: Date.parse('2026-09-20T12:00:00-06:00'),
  }

  const report = buildMembershipReport([payment], filters, { asOf: '2026-10-10' })

  assert.equal(report.summary.expected, 500)
  assert.equal(report.summary.collected, 200)
  assert.equal(report.summary.overdue, 300)
  assert.equal(report.summary.advanced, 200)
  assert.equal(report.summary.receivable, 300)
})

test('muestra adelantos en el periodo de membresía aunque se hayan cobrado antes', () => {
  const payment: Payment = {
    athleteId: 'a1', period: '2026-10', status: 'paid', amount: 200,
    totalAmount: 500, balance: 300,
    snapshot: { planId: 'plan-snapshot', agreedAmount: 500, paymentDay: 5, dueDate: '2026-10-05' },
    installments: { i1: { id: 'i1', amountApplied: 200, method: 'cash', appliedAt: Date.parse('2026-09-20T12:00:00-06:00'), balanceAfter: 300 } },
    createdAt: Date.parse('2026-09-20T12:00:00-06:00'), updatedAt: Date.parse('2026-09-20T12:00:00-06:00'),
  }

  const report = buildMembershipReport([payment], { from: '2026-10-01', through: '2026-10-31', productIds: [] }, { asOf: '2026-09-25' })

  assert.equal(report.summary.expected, 500)
  assert.equal(report.summary.collected, 0)
  assert.equal(report.summary.advanced, 200)
  assert.equal(report.summary.receivable, 300)
})

test('filtra mensualidades por su estado de dominio y método efectivo', () => {
  const payment: Payment = {
    athleteId: 'a1', period: '2026-10', status: 'pending', amount: 200, totalAmount: 500, balance: 300,
    snapshot: { planId: 'plan-snapshot', agreedAmount: 500, paymentDay: 5, dueDate: '2026-10-05' },
    installments: { i1: { id: 'i1', amountApplied: 200, method: 'transfer', appliedAt: Date.parse('2026-10-01T12:00:00-06:00'), balanceAfter: 300 } },
    createdAt: 1, updatedAt: 1,
  }

  const included = buildMembershipReport([payment], { ...filters, membershipStatus: 'overdue', paymentMethod: 'transfer' }, { asOf: '2026-10-10' })
  const excluded = buildMembershipReport([payment], { ...filters, membershipStatus: 'paid', paymentMethod: 'transfer' }, { asOf: '2026-10-10' })

  assert.equal(included.rows.length, 1)
  assert.equal(included.summary.collected, 200)
  assert.equal(excluded.rows.length, 0)
})

test('no infiere mensualidad esperada ni vencimiento de pagos legados sin total ni snapshot', () => {
  const legacy: Payment = { athleteId: 'a1', period: '2026-10', status: 'paid', amount: 200, createdAt: 1, updatedAt: 1 }
  const report = buildMembershipReport([legacy], { from: '2026-10-01', through: '2026-10-31', productIds: [] }, { asOf: '2026-10-10' })

  assert.equal(report.summary.expected, null)
  assert.equal(report.summary.overdue, null)
  assert.equal(report.summary.receivable, null)
  assert.equal(report.summary.quality, 'unavailable')
  assert.equal(report.rows[0]?.expected, null)
})

test('suma diferencias y resoluciones sin convertir fondo perdido en flujo de caja', () => {
  const closure: InventoryClosure = {
    id: '2026-01-05', weekStart: '2026-01-05', weekEnd: '2026-01-11', items: {
      p1: { productId: 'p1', name: 'P', category: 'C', systemStock: 5, countedStock: 2, variance: -3, unitCost: 10, varianceValue: -30 },
    }, totalSystemUnits: 5, totalCountedUnits: 2, varianceUnits: -3, lossValue: 30, gainValue: 0,
    closedBy: 'admin', closedByName: 'Admin', createdAt: 1, updatedAt: 1, status: 'finalized',
  }

  const resolutions: InventoryResolution[] = [
    { id: 'found', adjustmentId: 'a1', closureId: closure.id, productId: 'p1', kind: 'found', units: 1, amount: 10, reason: 'Encontrada', createdBy: 'admin', createdAt: Date.parse('2026-01-06T12:00:00-06:00') },
    { id: 'covered', adjustmentId: 'a1', closureId: closure.id, productId: 'p1', kind: 'covered', units: 1, amount: 10, method: 'cash', reason: 'Cubierto', createdBy: 'admin', createdAt: Date.parse('2026-01-07T12:00:00-06:00') },
    { id: 'lost', adjustmentId: 'a1', closureId: closure.id, productId: 'p1', kind: 'written-off', units: 1, amount: 10, reason: 'Fondo perdido', createdBy: 'admin', createdAt: Date.parse('2026-01-08T12:00:00-06:00') },
    { id: 'corrected', adjustmentId: 'a1', closureId: closure.id, productId: 'p1', kind: 'corrected', units: 1, amount: 10, reason: 'Corrección documentada', createdBy: 'admin', createdAt: Date.parse('2026-01-09T12:00:00-06:00') },
  ]

  const report = buildInventoryReport([closure], resolutions, filters)

  assert.equal(report.summary.differenceUnits, -3)
  assert.equal(report.summary.recoveredUnits, 1)
  assert.equal(report.summary.coveredUnits, 1)
  assert.equal(report.summary.writtenOffValue, 10)
  assert.equal(report.summary.cashFlow, 10)
  assert.equal(report.resolutionRows.find(row => row.resolutionId === 'corrected')?.kind, 'corrected')
  assert.equal(report.rows[0]?.correctedUnits, 1)

  const cashOnly = buildInventoryReport([closure], resolutions, { ...filters, paymentMethod: 'cash' })

  assert.deepEqual(cashOnly.resolutionRows.map(row => row.resolutionId), ['covered'])
  assert.equal(cashOnly.summary.differenceUnits, -3)
  assert.equal(cashOnly.summary.recoveredUnits, 0)
  assert.equal(cashOnly.summary.writtenOffValue, 0)

  const laterResolutions = resolutions.map(resolution => ({ ...resolution, createdAt: Date.parse(`2026-01-${resolution.kind === 'found' ? '16' : resolution.kind === 'covered' ? '17' : '18'}T12:00:00-06:00`) }))
  const laterReport = buildInventoryReport([closure], laterResolutions, { from: '2026-01-15', through: '2026-01-31', productIds: [] })

  assert.equal(laterReport.summary.differenceUnits, 0)

  assert.equal(laterReport.summary.recoveredUnits, 1)
  assert.equal(laterReport.summary.cashFlow, 10)
})

test('separa trabajo devengado, pagado y pendiente y omite contacto personal', () => {
  const entries: WorkEntry[] = [
    { id: 'paid', employeeId: 'e1', employeeName: 'Empleado QA', date: '2026-01-02', unit: 'class', quantity: 1, rateSnapshot: 200, amount: 200, status: 'paid', payrollSettlementId: 's1', createdBy: 'admin', createdAt: 1, updatedAt: 1 },
    { id: 'pending', employeeId: 'e1', employeeName: 'Empleado QA', date: '2026-01-03', unit: 'class', quantity: 1, rateSnapshot: 200, amount: 200, status: 'approved', createdBy: 'admin', createdAt: 2, updatedAt: 2 },
  ]

  const settlements: PayrollSettlement[] = [{ id: 's1', employeeId: 'e1', employeeName: 'Empleado QA', entryIds: { paid: true }, periodFrom: '2026-01-02', periodThrough: '2026-01-02', amount: 200, method: 'cash', paidAt: '2026-01-03', expenseId: 'payroll-s1', createdBy: 'admin', createdAt: 1, updatedAt: 1 }]
  const report = buildWorkforceReport(entries, settlements, filters)

  assert.equal(report.summary.accrued, 400)
  assert.equal(report.summary.paid, 200)
  assert.equal(report.summary.pending, 200)
  assert.equal(JSON.stringify(report).includes('phone'), false)
})

test('incluye pendiente anterior al inicio, filtra por empleado y marca liquidaciones inconsistentes', () => {
  const entries: WorkEntry[] = [
    { id: 'old-pending', employeeId: 'e1', employeeName: 'Entrenadora QA', date: '2025-12-20', unit: 'class', quantity: 1, rateSnapshot: 100, amount: 100, status: 'approved', note: 'privada', createdBy: 'admin', createdAt: 1, updatedAt: 1 },
    { id: 'paid-broken', employeeId: 'e1', employeeName: 'Entrenadora QA', date: '2026-01-02', unit: 'class', quantity: 1, rateSnapshot: 200, amount: 200, status: 'paid', payrollSettlementId: 'broken', createdBy: 'admin', createdAt: 2, updatedAt: 2 },
    { id: 'other', employeeId: 'e2', employeeName: 'Otra persona', date: '2026-01-02', unit: 'day', quantity: 1, rateSnapshot: 300, amount: 300, status: 'approved', createdBy: 'admin', createdAt: 3, updatedAt: 3 },
  ]

  const settlements: PayrollSettlement[] = [{ id: 'broken', employeeId: 'e1', employeeName: 'Entrenadora QA', entryIds: { 'paid-broken': true }, periodFrom: '2026-01-02', periodThrough: '2026-01-02', amount: 250, method: 'cash', reference: 'privada', paidAt: '2026-01-03', expenseId: 'payroll-broken', createdBy: 'admin', createdAt: 1, updatedAt: 1 }]

  const report = buildWorkforceReport(entries, settlements, { ...filters, employeeId: 'e1' })

  assert.equal(report.summary.accrued, 200)
  assert.equal(report.summary.paid, 0)
  assert.equal(report.summary.pending, 100)
  assert.equal(report.summary.quality, 'partial-history')
  assert.equal(report.rows.find(row => row.entryId === 'old-pending')?.pendingAtCutoff, true)
  assert.equal(report.settlementRows[0]?.quality, 'unavailable')
  assert.equal(JSON.stringify(report).includes('privada'), false)

  const pendingOnly = buildWorkforceReport(entries, settlements, { ...filters, employeeId: 'e1', workStatus: 'approved' })

  assert.deepEqual(pendingOnly.rows.map(row => row.entryId), ['old-pending'])
  assert.equal(pendingOnly.summary.paid, 0)
})
