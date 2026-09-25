import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAthleteTransition } from '../src/utils/athlete-lifecycle'

const now = new Date('2026-09-24T12:00:00-06:00').getTime()

test('permite pausar con regreso esperado y conserva un evento auditable', () => {
  const transition = buildAthleteTransition('active', {
    id: 'event-1', toStatus: 'paused', effectiveDate: '2026-09-24', expectedReturnDate: '2026-10-08', reason: 'Viaje temporal',
  }, 'admin-1', now, 'athlete-1')

  assert.equal(transition.event.fromStatus, 'active')
  assert.equal(transition.event.toStatus, 'paused')
  assert.equal(transition.patch.status, 'paused')
  assert.equal(transition.patch.expectedReturnDate, '2026-10-08')
  assert.equal(transition.patch.inactiveAt, null)
})

test('distingue baja de pausa y permite reactivar sin borrar historia', () => {
  const inactive = buildAthleteTransition('paused', {
    id: 'event-2', toStatus: 'inactive', effectiveDate: '2026-10-01', reason: 'Baja definitiva solicitada',
  }, 'admin-1', now, 'athlete-1')

  const active = buildAthleteTransition('inactive', {
    id: 'event-3', toStatus: 'active', effectiveDate: '2026-11-01', reason: 'Solicitó reincorporación',
  }, 'admin-1', now + 1, 'athlete-1')

  assert.equal(inactive.patch.inactiveAt, '2026-10-01')
  assert.equal(inactive.patch.expectedReturnDate, null)
  assert.equal(active.patch.inactiveAt, null)
  assert.equal(active.event.toStatus, 'active')
})

test('rechaza transiciones sin efecto, motivos vacíos y regreso anterior', () => {
  assert.throws(() => buildAthleteTransition('active', { id: 'same', toStatus: 'active', effectiveDate: '2026-09-24', reason: 'Sin cambio' }, 'admin', now, 'athlete'), /transición/i)
  assert.throws(() => buildAthleteTransition('active', { id: 'empty', toStatus: 'paused', effectiveDate: '2026-09-24', reason: ' ' }, 'admin', now, 'athlete'), /motivo/i)
  assert.throws(() => buildAthleteTransition('active', { id: 'date', toStatus: 'paused', effectiveDate: '2026-09-24', expectedReturnDate: '2026-09-20', reason: 'Pausa temporal' }, 'admin', now, 'athlete'), /regreso/i)
})
