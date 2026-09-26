import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planCoachDirectoryBackfill } from '../scripts/backfill-coach-directory.mjs'

const coach = { id: 'coach-1', kind: 'coach', name: '  Ana  ', status: 'active', currentRate: 900 }

test('proyecta sólo ID, nombre y estado de empleados Coach', () => {
  const plan = planCoachDirectoryBackfill({ 'coach-1': coach, other: { kind: 'cleaning' } }, null)

  assert.deepEqual(plan.additions, { 'coach-1': { id: 'coach-1', name: 'Ana', status: 'active' } })
  assert.equal(plan.total, 1)
})

test('omite entradas idénticas y falla ante conflicto sin sobrescribir', () => {
  const directory = { 'coach-1': { id: 'coach-1', name: 'Ana', status: 'active' } }

  assert.deepEqual(planCoachDirectoryBackfill({ 'coach-1': coach }, directory), { additions: {}, matched: 1, total: 1 })
  assert.throws(() => planCoachDirectoryBackfill({ 'coach-1': coach }, { 'coach-1': { id: 'coach-1', name: 'Otra', status: 'active' } }))
})

test('rechaza una ficha Coach incompleta', () => {
  assert.throws(() => planCoachDirectoryBackfill({ 'coach-1': { ...coach, id: 'otro' } }, null))
})
