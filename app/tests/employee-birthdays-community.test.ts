import assert from 'node:assert/strict'
import test from 'node:test'
import type { Employee } from '../src/types/workforce'
import { buildEmployeeBirthdayQueue, validateEmployeeBirthDate } from '../src/utils/employee-birthdays'

const employee = (id: string, birthDate: string | null, status: Employee['status'] = 'active'): Employee => ({
  id, name: `Empleado ${id}`, birthDate, kind: 'coach', startDate: '2025-01-01', status,
  compensationUnit: 'class', currentRate: 100, rateHistory: {}, createdAt: 1, updatedAt: 1,
})

test('incluye activos próximos y excluye inactivos o legados sin fecha', () => {
  const queue = buildEmployeeBirthdayQueue([
    employee('hoy', '1990-09-25'), employee('pronto', '1990-10-01'), employee('inactivo', '1990-09-25', 'inactive'), employee('legado', null),
  ], '2026-09-25')

  assert.deepEqual(queue.map(item => item.employee.id), ['hoy', 'pronto'])
})

test('normaliza 29 de febrero y valida fechas futuras', () => {
  const queue = buildEmployeeBirthdayQueue([employee('leap', '2000-02-29')], '2027-02-28')

  assert.equal(queue[0]?.occurrence, '2027-02-28')
  assert.throws(() => validateEmployeeBirthDate('2099-01-01', '2026-09-25'), /futura/i)
  assert.throws(() => validateEmployeeBirthDate('2026-02-31', '2026-09-25'), /válida/i)
})
