/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { buildNotificationConsentMutation } from '../src/utils/payment-notification.ts'

let env: RulesTestEnvironment
const uid = 'qa-optout-operator'
const id = 'qa-optout-rule-athlete'
const path = `v1/notificationPreferences/${id}`
const now = Date.now() - 10000

const withdrawn = {
  athleteId: id, receiptStatus: 'opted-out' as const, reminderStatus: 'opted-out' as const,
  consentedPhoneE164: '520000000001', consentedAt: now - 5000, consentSource: 'staff' as const,
  recordedBy: uid, optedOutAt: now, optOutSource: 'webhook' as const,
  createdAt: now - 5000, updatedAt: now, updatedBy: uid,
}

before(async () => {
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  env = await initializeTestEnvironment({ projectId: 'demo-kronos-training', database: {
    host: '127.0.0.1', port: 9010, rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
  } })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.database()

    await db.ref(`v1/users/${uid}`).set({ role: 'admin', enabled: true })
    await db.ref(`v1/athletes/${id}`).set({ id, status: 'active' })
    await db.ref(path).set(withdrawn)
  })
})
after(async () => {
  if (!env) return
  await env.withSecurityRulesDisabled(async context => {
    for (const key of [`v1/users/${uid}`, `v1/athletes/${id}`, path]) await context.database().ref(key).remove()
  })
  await env.cleanup()
})

test('stale set and child updates cannot restore consent or erase withdrawal evidence', async () => {
  const reference = env.authenticatedContext(uid).database().ref(path)

  await assertFails(reference.set({ ...withdrawn, receiptStatus: 'opted-in', optedOutAt: null, optOutSource: null }))
  await assertFails(reference.set({ ...withdrawn, receiptStatus: 'opted-in' }))
  await assertFails(reference.child('receiptStatus').set('opted-in'))
  await assertFails(reference.child('optedOutAt').remove())
  await assertFails(reference.child('optOutSource').set('staff'))
  await assertFails(reference.set({ ...withdrawn, receiptStatus: 'opted-in', consentedAt: Date.now() + 60000 }))
})

test('existing client mutation permits a fresh explicit grant and preserves withdrawal metadata', async () => {
  const next = buildNotificationConsentMutation({ athleteId: id, phone: '0000000001', current: withdrawn,
    receiptOptIn: true, reminderOptIn: true, consentConfirmed: true, withdrawalConfirmed: false,
    recordedBy: uid, now: now + 2000 })

  const reference = env.authenticatedContext(uid).database().ref(path)

  await assertSucceeds(reference.set(next))

  const saved = (await reference.get()).val()

  assert.equal(saved.receiptStatus, 'opted-in')
  assert.equal(saved.optedOutAt, withdrawn.optedOutAt)
  assert.equal(saved.optOutSource, 'webhook')
})

test('private event route and collection queries stay denied to clients', async () => {
  for (const context of [env.authenticatedContext(uid), env.unauthenticatedContext()]) {
    const db = context.database()

    await assertFails(db.ref('v1/notificationOptOutEvents').get())
    await assertFails(db.ref(`v1/notificationOptOutEvents/${'a'.repeat(64)}`).set({ status: 'completed' }))
    await assertFails(db.ref('v1/notificationPreferences').orderByChild('consentedPhoneE164').equalTo('520000000001').get())
  }
  await assertFails(env.unauthenticatedContext().database().ref(path).set(withdrawn))
})

test('same-second grant withdrawn by a retry cannot be restored by a stale client copy', async () => {
  const staleGrant = { ...withdrawn, receiptStatus: 'opted-in' as const, reminderStatus: 'opted-in' as const, consentedAt: now + 100 }

  await env.withSecurityRulesDisabled(context => context.database().ref(path).set({ ...staleGrant, receiptStatus: 'opted-out', reminderStatus: 'opted-out' }))

  const staleSave = buildNotificationConsentMutation({ athleteId: id, phone: '0000000001', current: staleGrant,
    receiptOptIn: true, reminderOptIn: true, consentConfirmed: false, withdrawalConfirmed: false,
    recordedBy: uid, now: now + 2000 })

  await assertFails(env.authenticatedContext(uid).database().ref(path).set(staleSave))

  const freshSave = buildNotificationConsentMutation({ athleteId: id, phone: '0000000001', current: { ...staleGrant, receiptStatus: 'opted-out', reminderStatus: 'opted-out' },
    receiptOptIn: true, reminderOptIn: true, consentConfirmed: true, withdrawalConfirmed: false,
    recordedBy: uid, now: now + 2000 })

  await assertSucceeds(env.authenticatedContext(uid).database().ref(path).set(freshSave))
  await assertSucceeds(env.authenticatedContext(uid).database().ref(path).set(freshSave))
})
