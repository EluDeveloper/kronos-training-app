/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isNotificationAthleteAllowed,
  resolveNotificationRollout,
} from '../src/notifications/rollout.ts'

test('rollout is inert by default and rejects unknown modes', () => {
  assert.deepEqual(resolveNotificationRollout({}), {
    mode: 'disabled',
    reason: 'MODE_DISABLED',
  })
  assert.deepEqual(resolveNotificationRollout({
    KRONOS_NOTIFICATION_ROLLOUT_MODE: 'disabled',
  }), {
    mode: 'disabled',
    reason: 'MODE_DISABLED',
  })
  assert.deepEqual(resolveNotificationRollout({
    KRONOS_NOTIFICATION_ROLLOUT_MODE: 'unexpected',
  }), {
    mode: 'disabled',
    reason: 'INVALID_CONFIGURATION',
  })
})

test('qa rollout accepts one exact canonical athlete id', () => {
  const rollout = resolveNotificationRollout({
    KRONOS_NOTIFICATION_ROLLOUT_MODE: 'qa',
    KRONOS_NOTIFICATION_QA_ATHLETE_ID: 'athlete-qa-001',
  })

  assert.deepEqual(rollout, {
    mode: 'qa',
    athleteId: 'athlete-qa-001',
  })
  assert.equal(isNotificationAthleteAllowed(rollout, 'athlete-qa-001'), true)
  assert.equal(isNotificationAthleteAllowed(rollout, 'athlete-qa-002'), false)
  assert.equal(isNotificationAthleteAllowed(rollout, ' athlete-qa-001 '), false)
})

test('qa rollout fails closed for missing or ambiguous athlete ids', () => {
  for (const athleteId of [
    undefined,
    '',
    ' athlete-qa-001',
    'athlete/qa/001',
    'athlete:qa:001',
    'a'.repeat(129),
  ]) {
    assert.deepEqual(resolveNotificationRollout({
      KRONOS_NOTIFICATION_ROLLOUT_MODE: 'qa',
      KRONOS_NOTIFICATION_QA_ATHLETE_ID: athleteId,
    }), {
      mode: 'disabled',
      reason: 'INVALID_CONFIGURATION',
    })
  }
})

test('production rollout remains blocked in this phase', () => {
  const rollout = resolveNotificationRollout({
    KRONOS_NOTIFICATION_ROLLOUT_MODE: 'production',
    KRONOS_NOTIFICATION_QA_ATHLETE_ID: 'athlete-qa-001',
  })

  assert.deepEqual(rollout, {
    mode: 'disabled',
    reason: 'PRODUCTION_BLOCKED',
  })
  assert.equal(isNotificationAthleteAllowed(rollout, 'athlete-qa-001'), false)
})
