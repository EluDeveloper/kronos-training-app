/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase, type Database } from 'firebase-admin/database'
import { notificationJobId } from '../src/notifications/jobs.ts'

// No worker, projector, enqueue or webhook handler imports: all execution must
// come from emulator events or the local HTTP endpoint, never direct calls.
test('automatic RTDB events enqueue, send fake, project and process local HTTP webhooks', { timeout: 180_000 }, async t => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  assert.equal(process.env.KRONOS_NOTIFICATION_WORKER_MODE, 'fake')

  const appSecret = process.env.WHATSAPP_APP_SECRET ?? ''
  const timeoutMs = Number(process.env.KRONOS_QA_PIPELINE_TIMEOUT_MS ?? 45_000)

  assert.ok(appSecret.startsWith('qa-only-'), 'Only a synthetic local signing key is allowed')
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 60_000)

  const app = initializeApp({
    projectId: 'demo-kronos-training',
    databaseURL: 'http://127.0.0.1:9010?ns=demo-kronos-training-default-rtdb',
  }, `automatic-qa-${randomUUID()}`)

  const database = getDatabase(app)
  const athleteId = `qa-auto-${randomUUID()}`
  const jobId = notificationJobId(`membership:${athleteId}:2026-09:one`)
  const jobPath = `v1/notificationJobs/${jobId}`
  const statusPath = `v1/notificationStatus/${athleteId}/${jobId}`
  const paymentPath = `v1/payments/${athleteId}/2026-09`
  const timestamp = new Date().toISOString()

  const payment = { status: 'pending', totalAmount: 500, balance: 300, installments: {
    one: { id: 'one', amountApplied: 200, balanceAfter: 300, appliedAt: timestamp },
  } }

  try {
    await database.ref(`v1/athletes/${athleteId}`).set({
      status: 'active', profile: { name: 'Atleta sintetico automatico', phone: '0000000000' },
      membership: { agreedAmount: 500, paymentDay: 8 },
    })
    await database.ref(`v1/notificationPreferences/${athleteId}`).set({
      athleteId, receiptStatus: 'opted-in', reminderStatus: 'opted-in', consentedPhoneE164: '520000000000',
    })
    assert.equal((await database.ref(jobPath).get()).exists(), false)

    const startedAt = Date.now()

    await database.ref(paymentPath).set(payment)

    const accepted = await waitForStatus(database, statusPath, 'accepted', timeoutMs)

    t.diagnostic(`Automatic payment-to-projection observed in ${Date.now() - startedAt} ms (local emulator only)`)
    assert.deepEqual(Object.keys(accepted).sort(), ['folio', 'period', 'status', 'type', 'updatedAt'])
    assert.equal(accepted.folio, `REC-${jobId.slice(4).toUpperCase()}`)
    assert.equal(accepted.period, '2026-09')

    const job = (await database.ref(jobPath).get()).val()

    assert.equal(job.providerMessageId, `wamid.fake.${jobId}`)
    assert.equal(job.attemptNumber, 1)
    assert.equal(Object.keys(job.delivery.attempts).length, 1)

    const postStatus = async (status: string) => {
      const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
        statuses: [{ id: job.providerMessageId, status }],
      } }] }] })

      const response = await fetch('http://127.0.0.1:5002/demo-kronos-training/us-central1/whatsappWebhook', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}` },
        body,
      })

      assert.equal(response.status, 200)

      return response.json() as Promise<{ status: string }>
    }

    assert.equal((await postStatus('delivered')).status, 'applied')
    await waitForStatus(database, statusPath, 'delivered', timeoutMs)
    assert.equal((await postStatus('read')).status, 'applied')

    const read = await waitForStatus(database, statusPath, 'read', timeoutMs)

    assert.equal((await postStatus('read')).status, 'duplicate')
    assert.equal((await postStatus('sent')).status, 'ignored')
    assert.deepEqual((await database.ref(statusPath).get()).val(), read)
    assert.deepEqual((await database.ref(paymentPath).get()).val(), payment)

    const finalJob = (await database.ref(jobPath).get()).val()

    assert.equal(finalJob.status, 'read')
    assert.equal(finalJob.attemptNumber, 1)
    assert.deepEqual(finalJob.delivery, job.delivery)
  } finally {
    await deleteApp(app)
  }
})

async function waitForStatus(database: Database, path: string, expected: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const value = (await database.ref(path).get()).val()
    if (value?.status === expected)
      return value
    await delay(100)
  }
  assert.fail(`Automatic pipeline did not publish ${expected} within ${timeoutMs} ms`)
}
