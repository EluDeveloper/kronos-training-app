/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase } from '../src/notifications/realtime-job-store.ts'
import { RealtimeOptOutStore } from '../src/whatsapp/realtime-opt-out.ts'
import { optOutRetentionMs } from '../src/whatsapp/inbound-opt-out.ts'

const now = Date.UTC(2026, 8, 9)
const event = { eventKey: 'a'.repeat(64), senderPhone: '520000000001', eventAt: now, receivedAt: now + 2000, keyword: 'BAJA' as const }

const preference = (id: string, overrides = {}) => ({
  athleteId: id, receiptStatus: 'opted-in', reminderStatus: 'opted-in', consentedPhoneE164: event.senderPhone,
  consentedAt: now - 10000, consentSource: 'staff', recordedBy: 'qa-operator', createdAt: now - 10000,
  updatedAt: now - 10000, updatedBy: 'qa-operator', ...overrides,
})

const owned = new Set<string>()
const ownedEvents = new Set<string>()
const prefs = () => getNotificationDatabase().ref('v1/notificationPreferences')
const events = () => getNotificationDatabase().ref('v1/notificationOptOutEvents')
async function seed(id: string, overrides = {}) {
  owned.add(id)
  await prefs().child(id).set(preference(id, overrides))
}
async function applyEvent(input = event) {
  ownedEvents.add(input.eventKey)

  return new RealtimeOptOutStore().process(input)
}

before(() => {
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
  process.env.KRONOS_NOTIFICATION_WORKER_MODE = 'fake'
  process.env.KRONOS_WHATSAPP_OPT_OUT_MODE = 'local'
  process.env.KRONOS_WHATSAPP_QA_ACCOUNT_ID = 'qa-business'
  process.env.KRONOS_WHATSAPP_QA_NUMBER_ID = 'qa-number'
})

after(async () => {
  for (const id of owned) await prefs().child(id).remove()
  for (const id of ownedEvents) await events().child(id).remove()
  await deleteApp(getNotificationDatabase().app)
})

test('shared number withdrawal persists once under concurrent delivery and cold transaction caches', async () => {
  await seed('qa-optout-a')
  await seed('qa-optout-b')
  await seed('qa-optout-other', { consentedPhoneE164: '520000000002' })

  const results = await Promise.all([applyEvent(), applyEvent()])

  assert.ok(results.includes('applied'))
  for (const id of ['qa-optout-a', 'qa-optout-b']) {
    const value = (await prefs().child(id).get()).val()

    assert.equal(value.receiptStatus, 'opted-out')
    assert.equal(value.reminderStatus, 'opted-out')
    assert.equal(value.consentedAt, now - 10000)
    assert.equal(value.optedOutAt, event.receivedAt)
  }
  assert.equal((await prefs().child('qa-optout-other/receiptStatus').get()).val(), 'opted-in')
  assert.equal(await applyEvent({ ...event, receivedAt: now + 9000 }), 'duplicate')
  assert.deepEqual((await events().child(event.eventKey).get()).val(), {
    status: 'completed', receivedAt: event.receivedAt, expiresAt: event.receivedAt + optOutRetentionMs,
  })
})

test('partial failure remains pending and resumes without overwriting a newer consent', async () => {
  await seed('qa-optout-a')
  await seed('qa-optout-b', { consentedAt: 'invalid-date' })

  const input = { ...event, eventKey: 'b'.repeat(64) }

  assert.equal(await applyEvent(input), 'retry-required')
  assert.equal((await events().child(input.eventKey).get()).val().status, 'pending')
  await seed('qa-optout-a', { consentedAt: now + 1000 })
  await seed('qa-optout-b')
  assert.equal(await applyEvent({ ...input, receivedAt: now + 9000 }), 'applied')
  assert.equal((await prefs().child('qa-optout-a/receiptStatus').get()).val(), 'opted-in')
  assert.equal((await prefs().child('qa-optout-b/optedOutAt').get()).val(), input.receivedAt)
})

test('over 50 matches fails without writing preferences or an event marker', async () => {
  const input = { ...event, eventKey: 'c'.repeat(64), senderPhone: '520000000003' }
  for (let i = 0; i < 51; i++) await seed(`qa-optout-limit-${i}`, { consentedPhoneE164: input.senderPhone })
  assert.equal(await applyEvent(input), 'retry-required')
  assert.equal((await events().child(input.eventKey).get()).exists(), false)
  assert.equal((await prefs().child('qa-optout-limit-0/receiptStatus').get()).val(), 'opted-in')
})

test('bounded cleanup removes only expired private markers, preserving current events and consent', async () => {
  const previous = (await prefs().child('qa-optout-b').get()).val()

  assert.equal(await new RealtimeOptOutStore().cleanup(event.receivedAt + optOutRetentionMs - 1), 0)
  assert.equal(await new RealtimeOptOutStore().cleanup(event.receivedAt + optOutRetentionMs), 2)
  assert.equal(await new RealtimeOptOutStore().cleanup(event.receivedAt + optOutRetentionMs), 0)
  assert.deepEqual((await prefs().child('qa-optout-b').get()).val(), previous)
})
