/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase } from '../src/notifications/realtime-job-store.ts'

test('Functions emulator accepts signed HTTP opt-out and its replay, but rejects invalid signatures and account IDs', async () => {
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')

  const database = getNotificationDatabase()
  const endpoint = 'http://127.0.0.1:5002/demo-kronos-training/us-central1/whatsappWebhook'
  const now = Math.floor(Date.now() / 1000) * 1000
  const id = 'qa-optout-transport'
  const messageId = `wamid.qa.transport.${now}`
  const key = createHash('sha256').update(JSON.stringify(['qa-business', 'qa-number', messageId])).digest('hex')
  const preference = database.ref(`v1/notificationPreferences/${id}`)
  const marker = database.ref(`v1/notificationOptOutEvents/${key}`)

  assert.equal((await preference.get()).exists(), false, 'Never replace an existing fixture')

  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'qa-business', changes: [{ field: 'messages', value: {
    // eslint-disable-next-line camelcase -- Match the local wire fixture.
    metadata: { phone_number_id: 'qa-number' }, messages: [{ id: messageId, from: '520000000009', timestamp: String(now / 1000), type: 'text', text: { body: 'BAJA' } }],
  } }] }] })

  const signature = (text: string) => `sha256=${createHmac('sha256', 'qa-only-synthetic-not-for-production').update(text).digest('hex')}`
  const post = (text: string, hash = signature(text)) => fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': hash }, body: text, signal: AbortSignal.timeout(15000) })
  try {
    await preference.set({ athleteId: id, receiptStatus: 'opted-in', reminderStatus: 'opted-in', consentedAt: now - 10000,
      consentedPhoneE164: '520000000009', createdAt: now - 10000, updatedAt: now - 10000, updatedBy: 'qa-operator' })
    assert.equal((await post(body, 'sha256=invalid')).status, 401)
    assert.equal((await post(body.replace('qa-business', 'qa-wrong'))).status, 400)
    assert.equal((await preference.child('receiptStatus').get()).val(), 'opted-in')

    const response = await post(body)

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'processed' })

    const withdrawn = (await preference.get()).val()

    assert.equal(withdrawn.receiptStatus, 'opted-out')
    assert.equal(withdrawn.reminderStatus, 'opted-out')
    assert.equal((await post(body)).status, 200)
    assert.deepEqual((await preference.get()).val(), withdrawn)
    assert.equal((await marker.get()).val().status, 'completed')
    assert.equal((await fetch(endpoint, { signal: AbortSignal.timeout(15000) })).status, 403)
  } finally {
    await preference.remove()
    await marker.remove()
    await deleteApp(database.app)
  }
})
