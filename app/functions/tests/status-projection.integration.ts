/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase, RealtimeDatabaseNotificationJobStore } from '../src/notifications/realtime-job-store.ts'
import { processLocalNotificationJob } from '../src/notifications/local-worker.ts'
import { syncLocalNotificationStatus } from '../src/notifications/local-status-projection.ts'
import { mergeNotificationStatus, syncNotificationStatus } from '../src/notifications/status-projection.ts'

const now = Date.parse('2026-09-09T15:00:00Z')
const payment = { status: 'pending', totalAmount: 500, installments: { one: { amountApplied: 200, balanceAfter: 300, appliedAt: '2026-09-09T15:00:00Z' } } }

before(() => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
  assert.match(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '', /^(?:127\.0\.0\.1|localhost):\d+$/)
  process.env.KRONOS_NOTIFICATION_WORKER_MODE = 'fake'
})
beforeEach(async () => {
  await getNotificationDatabase().ref('v1').set({
    athletes: { qa: { status: 'active', profile: { name: 'Atleta QA', phone: '0000000000' }, membership: { agreedAmount: 500, paymentDay: 9 } } },
    payments: { qa: { '2026-09': payment } },
    notificationPreferences: { qa: { athleteId: 'qa', receiptStatus: 'opted-in', consentedPhoneE164: '520000000000' } },
  })
})
after(async () => {
  delete process.env.KRONOS_NOTIFICATION_WORKER_MODE
  await deleteApp(getNotificationDatabase().app)
})

test('worker fake creates a compact projection; repeated synchronization does not send again', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const { job } = await jobs.createIfAbsent({ type: 'payment-receipt', athleteId: 'qa', idempotencyKey: 'membership:qa:2026-09:one', reference: 'membership:qa:2026-09:one' }, now)

  await processLocalNotificationJob(job.jobId, () => now)
  await Promise.all([syncLocalNotificationStatus(job.jobId), syncLocalNotificationStatus(job.jobId)])

  const row = (await getNotificationDatabase().ref(`v1/notificationStatus/qa/${job.jobId}`).get()).val()

  assert.deepEqual(Object.keys(row).sort(), ['folio', 'period', 'status', 'type', 'updatedAt'])
  assert.equal(row.status, 'accepted')
  assert.equal((await jobs.getById(job.jobId))?.attemptNumber, 1)
  assert.deepEqual((await getNotificationDatabase().ref('v1/payments/qa/2026-09').get()).val(), payment)
})

test('synchronization uses current job and cannot regress a read projection', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const { job } = await jobs.createIfAbsent({ type: 'payment-receipt', athleteId: 'qa', idempotencyKey: 'membership:qa:2026-09:one', reference: 'membership:qa:2026-09:one' }, now)

  await processLocalNotificationJob(job.jobId, () => now)
  await jobs.transition(job.jobId, 'read', now + 1)
  await syncLocalNotificationStatus(job.jobId)
  await syncLocalNotificationStatus(job.jobId)
  assert.equal((await getNotificationDatabase().ref(`v1/notificationStatus/qa/${job.jobId}/status`).get()).val(), 'read')
})

test('projection write failure leaves job and payment unchanged and retry only writes projection', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const { job } = await jobs.createIfAbsent({ type: 'payment-receipt', athleteId: 'qa', idempotencyKey: 'membership:qa:2026-09:one', reference: 'membership:qa:2026-09:one' }, now)

  await processLocalNotificationJob(job.jobId, () => now)

  const jobBeforeFailure = await jobs.getById(job.jobId)

  await assert.rejects(syncNotificationStatus(job.jobId, { readJob: id => jobs.getById(id), writeProjection: async () => { throw new Error('synthetic unavailable') } }))
  assert.deepEqual(await jobs.getById(job.jobId), jobBeforeFailure)
  await syncLocalNotificationStatus(job.jobId)
  assert.deepEqual(await jobs.getById(job.jobId), jobBeforeFailure)
  assert.deepEqual((await getNotificationDatabase().ref('v1/payments/qa/2026-09').get()).val(), payment)
})

test('local projection guard disables I/O outside fake mode and missing jobs are ignored', async () => {
  delete process.env.KRONOS_NOTIFICATION_WORKER_MODE
  assert.equal(await syncLocalNotificationStatus('invalid'), 'disabled')
  process.env.KRONOS_NOTIFICATION_WORKER_MODE = 'fake'
  assert.equal(await syncLocalNotificationStatus(`job-${'f'.repeat(32)}`), 'ignored')
  await assert.rejects(syncLocalNotificationStatus('../qa'))
  assert.equal((await getNotificationDatabase().ref('v1/notificationStatus').get()).exists(), false)
})

test('a delayed RTDB projector cannot overwrite newer canonical delivery evidence', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const { job } = await jobs.createIfAbsent({ type: 'payment-receipt', athleteId: 'qa', idempotencyKey: 'membership:qa:2026-09:one', reference: 'membership:qa:2026-09:one' }, now)

  await processLocalNotificationJob(job.jobId, () => now)

  const statusRef = getNotificationDatabase().ref(`v1/notificationStatus/qa/${job.jobId}`)
  let release!: () => void
  let captured!: () => void

  const delayed = new Promise<void>(resolve => { release = resolve })
  const snapshotCaptured = new Promise<void>(resolve => { captured = resolve })

  const staleProjector = syncNotificationStatus(job.jobId, {
    readJob: id => jobs.getById(id),
    writeProjection: async (_athleteId, _id, view) => {
      captured()
      await delayed
      await statusRef.transaction(current => mergeNotificationStatus(current, view))
    },
  })

  await snapshotCaptured
  try {
    await jobs.transition(job.jobId, 'delivered', now + 100)
    await syncLocalNotificationStatus(job.jobId)

    // Receive time can precede the delivered transaction's completion time.
    await jobs.transition(job.jobId, 'read', now + 50)
    await syncLocalNotificationStatus(job.jobId)
  }
  finally { release() }
  await staleProjector

  const projected = (await statusRef.get()).val()

  assert.equal(projected.status, 'read')
  assert.equal(projected.updatedAt, now + 100)
  assert.equal((await jobs.getById(job.jobId))?.attemptNumber, 1)
})
