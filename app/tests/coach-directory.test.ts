import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Employee } from '../src/types/workforce'
import { coachDirectoryEntry } from '../src/utils/coach-directory'

test('proyecta sólo identidad, nombre y estado del empleado coach', () => {
  const employee = { id: 'coach-1', name: ' Coach QA ', kind: 'coach', status: 'active', currentRate: 500, phone: '5500000000', birthDate: '1990-01-01' } as Employee

  assert.deepEqual(coachDirectoryEntry(employee), { id: 'coach-1', name: 'Coach QA', status: 'active' })
})

test('omite empleados que no son coaches', () => {
  const employee = { id: 'cleaning-1', name: 'Limpieza QA', kind: 'cleaning', status: 'active' } as Employee

  assert.equal(coachDirectoryEntry(employee), null)
})
