import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Employee } from '../src/types/workforce'
import { buildWorkEntry, selectSettlementEntries, validateDailyWorkEntry, workforceTotals } from '../src/utils/workforce-payroll'

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  id: 'employee-1', name: 'Coach Ana', kind: 'coach', startDate: '2026-09-01', status: 'active',
  compensationUnit: 'class', currentRate: 150, rateHistory: {}, createdAt: 1, updatedAt: 1, ...overrides,
})

test('cada trabajo congela la tarifa y redondea a centavos', () => {
  const original = buildWorkEntry(employee({ currentRate: 123.456 }), { id: 'entry-1', date: '2026-09-24', quantity: 2 }, 'admin', 10)
  const changed = buildWorkEntry(employee({ currentRate: 200 }), { id: 'entry-2', date: '2026-09-25', quantity: 1 }, 'admin', 20)

  assert.equal(original.rateSnapshot, 123.46)
  assert.equal(original.amount, 246.91)
  assert.equal(changed.rateSnapshot, 200)
})

test('limpieza diaria exige motivo para una segunda asistencia', () => {
  const cleaner = employee({ kind: 'cleaning', compensationUnit: 'day', currentRate: 300 })
  const first = buildWorkEntry(cleaner, { id: 'entry-1', date: '2026-09-24', quantity: 1 }, 'admin', 10)

  assert.throws(() => validateDailyWorkEntry(cleaner, [first], '2026-09-24'), /motivo/i)
  assert.doesNotThrow(() => validateDailyWorkEntry(cleaner, [first], '2026-09-24', 'Turno extraordinario'))
})

test('una liquidación sólo mezcla líneas del mismo empleado y nunca pagadas', () => {
  const first = buildWorkEntry(employee(), { id: 'entry-1', date: '2026-09-20', quantity: 2 }, 'admin', 10)
  const second = buildWorkEntry(employee(), { id: 'entry-2', date: '2026-09-24', quantity: 1 }, 'admin', 20)
  const selection = selectSettlementEntries([first, second], [first.id, second.id])

  assert.equal(selection.amount, 450)
  assert.equal(selection.periodFrom, '2026-09-20')
  assert.equal(selection.periodThrough, '2026-09-24')
  assert.throws(() => selectSettlementEntries([{ ...first, status: 'paid' }], [first.id]), /liquidada/i)
  assert.throws(() => selectSettlementEntries([first, { ...second, id: 'entry-3', employeeId: 'employee-2' }], [first.id, 'entry-3']), /mismo empleado/i)
})

test('devengado, pagado y pendiente reconcilian a centavos', () => {
  const first = buildWorkEntry(employee(), { id: 'entry-1', date: '2026-09-20', quantity: 2 }, 'admin', 10)
  const second = { ...buildWorkEntry(employee(), { id: 'entry-2', date: '2026-09-24', quantity: 1 }, 'admin', 20), status: 'paid' as const }

  assert.deepEqual(workforceTotals([first, second]), { accrued: 450, paid: 150, pending: 300 })
})
