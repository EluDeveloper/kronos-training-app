/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import {
  getNotificationDatabase,
  RealtimeDatabaseNotificationJobStore,
} from '../src/notifications/realtime-job-store.ts'
import { runNotificationRecovery } from '../src/notifications/production-recovery.ts'
import { processNotificationJob } from '../src/notifications/worker.ts'
import { FakeWhatsAppProvider } from '../src/whatsapp/client.ts'

const now = Date.parse('2026-09-21T15:00:00.000Z')

before(() => {
  assert.match(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '', /^(?:127\.0\.0\.1|localhost):\d+$/)
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
})

beforeEach(async () => {
  await getNotificationDatabase().ref('v1/notificationJobs').remove()
})

after(async () => {
  if (process.env.GCLOUD_PROJECT === 'demo-kronos-training'
    && /^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? ''))
    await deleteApp(getNotificationDatabase().app)
})

test('RTDB recovery index selects only due queued, retry and expired-lease jobs', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const queued = await jobs.createIfAbsent(jobInput('queued'), now)
  const future = await jobs.createIfAbsent(jobInput('future'), now + 10_000)
  const retry = await jobs.createIfAbsent(jobInput('retry'), now)
  const expiredLease = await jobs.createIfAbsent(jobInput('lease'), now)
  const terminal = await jobs.createIfAbsent(jobInput('terminal'), now)

  await jobs.acquireLease(retry.job.jobId, 'retry-worker', now, 60_000)
  await jobs.finishDelivery(retry.job.jobId, 'retry-worker', now + 1, {
    status: 'retryable-failed', outcome: 'rejected', errorCode: 'PROVIDER_TEMPORARY',
  })
  await jobs.acquireLease(expiredLease.job.jobId, 'expired-worker', now, 1_000)
  await jobs.acquireLease(terminal.job.jobId, 'terminal-worker', now, 60_000)
  await jobs.finishDelivery(terminal.job.jobId, 'terminal-worker', now + 1, {
    status: 'terminal-failed', outcome: 'rejected', errorCode: 'PROVIDER_REJECTED',
  })

  assert.deepEqual(await jobs.listDueRecoveryJobIds(now, 25), [queued.job.jobId])

  const afterLease = await jobs.listDueRecoveryJobIds(now + 1_000, 25)

  assert.deepEqual(new Set(afterLease), new Set([queued.job.jobId, expiredLease.job.jobId]))

  const afterRetry = await jobs.listDueRecoveryJobIds(now + 60_001, 25)

  assert.deepEqual(new Set(afterRetry), new Set([
    queued.job.jobId,
    future.job.jobId,
    retry.job.jobId,
    expiredLease.job.jobId,
  ]))
  assert.equal(afterRetry.includes(terminal.job.jobId), false)
  assert.equal((await getNotificationDatabase().ref(
    `v1/notificationJobs/${terminal.job.jobId}/recoveryAt`,
  ).get()).exists(), false)
})

test('RTDB recovery query never returns more than the configured batch limit', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()

  await Promise.all(Array.from({ length: 30 }, (_, index) =>
    jobs.createIfAbsent(jobInput(`batch-${index}`), now)))

  const due = await jobs.listDueRecoveryJobIds(now, 25)

  assert.equal(due.length, 25)
  assert.equal(new Set(due).size, 25)
})

test('production-shaped recovery runner completes a due RTDB job with an injected fake', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const created = await jobs.createIfAbsent(jobInput('runner'), now)

  const provider = new FakeWhatsAppProvider({
    response: { outcome: 'accepted', messageId: 'wamid.recovery.integration' },
  })

  const result = await runNotificationRecovery({
    environment: {
      KRONOS_NOTIFICATION_RECOVERY_MODE: 'scheduled',
      KRONOS_NOTIFICATION_WORKER_MODE: 'meta',
      GCLOUD_PROJECT: 'kronos-training-fd5e5',
      KRONOS_WHATSAPP_GRAPH_API_VERSION: 'v23.0',
      KRONOS_WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
      KRONOS_NOTIFICATION_ROLLOUT_MODE: 'qa',
      KRONOS_NOTIFICATION_QA_ATHLETE_ID: 'qa-recovery',
    },
    readAccessToken: () => 'qa-only-synthetic-access-token',
    listDueJobIds: (timestamp, limit) => jobs.listDueRecoveryJobIds(timestamp, limit),
    processJob: jobId => processNotificationJob({
      jobId,
      jobs,
      data: {
        readEligibility: async () => ({ eligible: true, recipient: '+520000000000' }),
        readDocument: async () => ({
          kind: 'receipt', title: 'RECIBO', folio: 'RECOVERY-QA-RTDB',
          customerName: 'Atleta QA', issuedAt: '2026-09-21T15:00:00Z',
          concept: 'Mensualidad', lines: [{ description: 'Mensualidad', amount: 500 }],
          total: 500, amountPaid: 500, balance: 0, isProofOfPayment: true,
        }),
      },
      provider,
      workerId: 'scheduled-integration',
      now: () => now,
    }),
    now: () => now,
  })

  assert.equal(result.status, 'processed')
  assert.equal(result.status === 'processed' && result.finished, 1)
  assert.equal(provider.submittedRequests.length, 1)
  assert.equal((await jobs.getById(created.job.jobId))?.status, 'accepted')
  assert.equal((await jobs.getById(created.job.jobId))?.recoveryAt, undefined)
})

function jobInput(reference: string) {
  return {
    idempotencyKey: `recovery:integration:${reference}`,
    type: 'payment-receipt' as const,
    athleteId: 'qa-recovery',
    reference,
  }
}
