/* eslint-disable import/extensions, camelcase -- Synthetic provider wire format. */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase } from '../src/notifications/realtime-job-store.ts'
import { notificationJobId } from '../src/notifications/jobs.ts'
import { inboxScope, parseStatusInbox } from '../src/whatsapp/status-inbox.ts'

test('one early HTTP status survives until real emulator payment/worker/inbox/projection triggers finish', { timeout: 60000 }, async () => {
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')

  const database = getNotificationDatabase()
  const endpoint = 'http://127.0.0.1:5002/demo-kronos-training/us-central1/whatsappWebhook'
  const now = Math.floor(Date.now() / 1000) * 1000
  const id = 'qa-inbox-transport'
  const jobId = notificationJobId('membership:' + id + ':2026-09:one')
  const messageId = 'wamid.fake.' + jobId
  const job = database.ref('v1/notificationJobs/' + jobId)
  const projection = database.ref('v1/notificationStatus/' + id + '/' + jobId)
  const config = { accountId: 'qa-business', phoneNumberId: 'qa-number' }
  const root = database.ref('v1/notificationStatusInbox/' + inboxScope(config))
  const owned: string[] = []

  const preference = { athleteId: id, receiptStatus: 'opted-in', reminderStatus: 'opted-in',
    consentedPhoneE164: '520000000009', consentedAt: now - 10000, consentSource: 'staff',
    recordedBy: 'qa-fixture', createdAt: now - 10000, updatedAt: now - 10000, updatedBy: 'qa-fixture' }

  const payment = { amount: 200, status: 'pending', totalAmount: 500, balance: 300, installments: {
    one: { id: 'one', amountApplied: 200, balanceAfter: 300, method: 'cash', appliedAt: new Date(now).toISOString() },
  } }

  async function post(status: string, signatureOverride?: string) {
    const body = { object: 'whatsapp_business_account', entry: [{ id: config.accountId, changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: config.phoneNumberId }, statuses: [{ id: messageId, status, timestamp: String(now / 1000) }],
    } }] }] }

    const raw = JSON.stringify(body)
    const parsed = parseStatusInbox(body, config, now, Buffer.byteLength(raw))
    if (parsed.status !== 'valid') throw new Error('Invalid fixture')
    const eventKey = parsed.events[0]!.eventKey

    owned.push(eventKey)

    const signature = 'sha256=' + createHmac('sha256', 'qa-only-synthetic-not-for-production').update(raw).digest('hex')

    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json',
      'x-hub-signature-256': signatureOverride ?? signature }, body: raw, signal: AbortSignal.timeout(15000) })

    return { response, eventKey }
  }
  async function until(check: () => Promise<boolean>) {
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
      if (await check()) return
      await delay(200)
    }
    throw new Error('Local trigger convergence timeout')
  }
  const paths = ['v1/athletes/' + id, 'v1/payments/' + id, 'v1/notificationPreferences/' + id]
  for (const path of [...paths, 'v1/notificationJobs/' + jobId, 'v1/notificationStatus/' + id])
    assert.equal((await database.ref(path).get()).exists(), false, 'Never overwrite existing fixtures')
  try {
    assert.equal((await post('delivered', 'sha256=invalid')).response.status, 401)

    const early = await post('delivered')

    assert.equal(early.response.status, 200)
    assert.equal((await root.child(early.eventKey).get()).val().processingStatus, 'pending')
    assert.equal((await job.get()).exists(), false)
    await database.ref('v1/athletes/' + id).set({ id, status: 'active', profile: { name: 'QA inbox transporte', phone: '0000000009' },
      membership: { agreedAmount: 500, paymentDay: 9 } })
    await database.ref('v1/notificationPreferences/' + id).set(preference)
    await database.ref('v1/payments/' + id + '/2026-09').set(payment)
    await until(async () => (await projection.child('status').get()).val() === 'delivered')
    assert.equal((await root.child(early.eventKey).get()).val().processingStatus, 'completed')
    assert.equal((await job.child('attemptNumber').get()).val(), 1)
    assert.equal((await post('read')).response.status, 200)
    await until(async () => (await projection.child('status').get()).val() === 'read')
    assert.equal((await post('sent')).response.status, 200)
    assert.equal((await job.child('status').get()).val(), 'read')
    assert.equal((await job.child('attemptNumber').get()).val(), 1)
    assert.deepEqual((await database.ref('v1/payments/' + id + '/2026-09').get()).val(), payment)
    assert.deepEqual((await database.ref('v1/notificationPreferences/' + id).get()).val(), preference)
  } finally {
    for (const path of paths) await database.ref(path).remove()
    await job.remove()

    // Deleting the job can enqueue projection cleanup; delete the owned projection last.
    await projection.remove()
    for (const key of owned) await root.child(key).remove()
    await deleteApp(database.app)
  }
})
