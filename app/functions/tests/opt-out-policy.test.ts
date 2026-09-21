/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import { decideOptOut } from '../src/whatsapp/opt-out-policy.ts'

const now = Date.UTC(2026, 8, 9)
const event = { eventKey: 'a'.repeat(64), senderPhone: '520000000001', eventAt: now, receivedAt: now + 2000, keyword: 'BAJA' as const }

const preference = {
  athleteId: 'qa-optout-a', receiptStatus: 'opted-in', reminderStatus: 'opted-in',
  consentedPhoneE164: event.senderPhone, consentedAt: now - 1000, consentSource: 'staff',
  recordedBy: 'qa-operator', createdAt: now - 2000, updatedAt: now - 1000, updatedBy: 'qa-operator',
}

const decide = (value: unknown) => decideOptOut(value, preference.athleteId, event)

test('withdrawal changes only both statuses and withdrawal/update metadata', () => {
  assert.deepEqual(decide(preference), { status: 'update', value: {
    ...preference, receiptStatus: 'opted-out', reminderStatus: 'opted-out',
    optedOutAt: event.receivedAt, optOutSource: 'webhook', updatedAt: event.receivedAt, updatedBy: 'whatsapp-webhook',
  } })
  assert.equal(preference.receiptStatus, 'opted-in')
})

test('a newer grant is preserved; withdrawal wins within the same provider second', () => {
  assert.equal(decide({ ...preference, consentedAt: now + 1000 }).status, 'ignored')
  assert.equal(decide({ ...preference, consentedAt: now + 999 }).status, 'update')
  assert.equal(decide({ ...preference, consentedAt: new Date(now + 1000).toISOString() }).status, 'ignored')
  assert.equal(decide({ ...preference, consentedAt: '2026-09-08T18:00:00-06:00' }).status, 'update')
})

test('changed phone, deleted record and already withdrawn preferences are no-ops', () => {
  assert.equal(decide(null).status, 'ignored')
  assert.equal(decide({ ...preference, consentedPhoneE164: '520000000002' }).status, 'ignored')
  assert.equal(decide({ ...preference, receiptStatus: 'opted-out', reminderStatus: 'opted-out', optOutSource: 'staff' }).status, 'ignored')
})

test('unorderable active consent or mismatched stored identity never gets overwritten', () => {
  for (const consentedAt of [null, undefined, 'garbage', '', -1, 1.5, NaN, '2026-02-31T00:00:00Z'])
    assert.equal(decide({ ...preference, consentedAt }).status, 'retry-required')
  assert.equal(decide({ ...preference, athleteId: 'other' }).status, 'retry-required')
  assert.equal(decide({ ...preference, receiptStatus: 'INVALID' }).status, 'retry-required')
  assert.equal(decide({ ...preference, consentedAt: null, receiptStatus: 'unknown', reminderStatus: 'unknown' }).status, 'update')
})
