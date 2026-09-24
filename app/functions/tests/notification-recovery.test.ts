/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryNotificationJobStore } from '../src/notifications/jobs.ts'
import { processNotificationJob, type NotificationDataSource } from '../src/notifications/worker.ts'
import { FakeWhatsAppProvider } from '../src/whatsapp/client.ts'
import {
  onNotificationRecoveryScheduled,
  runNotificationRecovery,
} from '../src/notifications/production-recovery.ts'

const metaEnvironment = {
  KRONOS_NOTIFICATION_RECOVERY_MODE: 'scheduled',
  KRONOS_NOTIFICATION_WORKER_MODE: 'meta',
  KRONOS_NOTIFICATION_ROLLOUT_MODE: 'qa',
  KRONOS_NOTIFICATION_QA_ATHLETE_ID: 'qa-recovery',
  GCLOUD_PROJECT: 'kronos-training-fd5e5',
  KRONOS_WHATSAPP_GRAPH_API_VERSION: 'v23.0',
  KRONOS_WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
}

const input = {
  idempotencyKey: 'recovery:qa:one',
  type: 'payment-receipt' as const,
  athleteId: 'qa-recovery',
  reference: 'one',
}

const recoveryDocument = {
  kind: 'receipt' as const,
  title: 'RECIBO' as const,
  folio: 'RECOVERY-QA-001',
  customerName: 'Atleta QA',
  issuedAt: '2026-09-21T15:00:00Z',
  concept: 'Mensualidad',
  lines: [{ description: 'Mensualidad', amount: 500 }],
  total: 500,
  amountPaid: 500,
  balance: 0,
  isProofOfPayment: true as const,
}

const recoveryData: NotificationDataSource = {
  readEligibility: async () => ({ eligible: true, recipient: '+520000000000' }),
  readDocument: async () => recoveryDocument,
}

test('jobs expose only their next automatic recovery time', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const { job } = await jobs.createIfAbsent(input, 1_000)

  assert.equal(job.recoveryAt, 1_000)

  const processing = await jobs.acquireLease(job.jobId, 'worker-one', 1_001, 60_000)

  assert.equal(processing?.recoveryAt, 61_001)

  const retryable = await jobs.finishDelivery(job.jobId, 'worker-one', 1_002, {
    status: 'retryable-failed', outcome: 'rejected', errorCode: 'PROVIDER_TEMPORARY',
  })

  assert.equal(retryable.recoveryAt, 61_002)

  const second = await jobs.acquireLease(job.jobId, 'worker-two', 61_002, 60_000)

  assert.equal(second?.recoveryAt, 121_002)

  const accepted = await jobs.finishDelivery(job.jobId, 'worker-two', 61_003, {
    status: 'accepted', outcome: 'accepted', messageId: 'wamid.recovery.accepted',
  })

  assert.equal(accepted.recoveryAt, undefined)
})

test('unknown and terminal outcomes never retain automatic recovery', async () => {
  for (const [suffix, result] of [
    ['unknown', { status: 'unknown', outcome: 'unknown', errorCode: 'PROVIDER_UNKNOWN' }],
    ['terminal', { status: 'terminal-failed', outcome: 'rejected', errorCode: 'PROVIDER_REJECTED' }],
    ['suppressed', { status: 'suppressed', outcome: 'suppressed', errorCode: 'OPTED_OUT' }],
  ] as const) {
    const jobs = new InMemoryNotificationJobStore()
    const created = await jobs.createIfAbsent({ ...input, idempotencyKey: `recovery:qa:${suffix}` }, 1_000)

    await jobs.acquireLease(created.job.jobId, suffix, 1_001, 60_000)

    const finished = await jobs.finishDelivery(created.job.jobId, suffix, 1_002, result)

    assert.equal(finished.recoveryAt, undefined)
  }
})

test('disabled or invalid recovery exits before secret and database access', async () => {
  let secretReads = 0
  let databaseReads = 0

  const dependencies = {
    readAccessToken: () => {
      secretReads += 1

      return 'qa-only-synthetic-access-token'
    },
    listDueJobIds: async () => {
      databaseReads += 1

      return []
    },
  }

  for (const environment of [
    {},
    { ...metaEnvironment, KRONOS_NOTIFICATION_RECOVERY_MODE: 'disabled' },
    { ...metaEnvironment, KRONOS_NOTIFICATION_RECOVERY_MODE: 'unexpected' },
    { ...metaEnvironment, FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' },
  ]) {
    const result = await runNotificationRecovery({
      environment,
      ...dependencies,
      now: () => 1_000,
    })

    assert.equal(result.status, 'disabled')
  }

  assert.equal(secretReads, 0)
  assert.equal(databaseReads, 0)
})

test('invalid access token exits before querying due jobs', async () => {
  let databaseReads = 0

  const result = await runNotificationRecovery({
    environment: metaEnvironment,
    readAccessToken: () => '',
    listDueJobIds: async () => {
      databaseReads += 1

      return []
    },
    now: () => 1_000,
  })

  assert.deepEqual(result, {
    status: 'disabled', reason: 'INVALID_SECRET', selected: 0,
  })
  assert.equal(databaseReads, 0)
})

test('one recovery run processes at most 25 unique due jobs and returns aggregates only', async () => {
  const ids = Array.from({ length: 25 }, (_, index) => `job-${index.toString(16).padStart(32, '0')}`)
  const processed: string[] = []
  let active = 0
  let maximumActive = 0

  const result = await runNotificationRecovery({
    environment: metaEnvironment,
    readAccessToken: () => 'qa-only-synthetic-access-token',
    listDueJobIds: async (now, limit) => {
      assert.equal(now, 2_000)
      assert.equal(limit, 25)

      return ids
    },
    processJob: async jobId => {
      processed.push(jobId)
      active++
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active--

      return { status: jobId === ids[0] ? 'deferred' as const : 'finished' as const }
    },
    now: () => 2_000,
  })

  assert.deepEqual(processed, ids)
  assert.equal(maximumActive, 3)
  assert.deepEqual(result, {
    status: 'processed', selected: 25, finished: 24, deferred: 1,
    busy: 0, skipped: 0, failed: 0,
  })
  assert.equal(JSON.stringify(result).includes('job-'), false)
})

test('recovery rejects an oversized, duplicate or malformed adapter page', async () => {
  const validId = 'job-' + 'a'.repeat(32)

  const base = {
    environment: metaEnvironment,
    readAccessToken: () => 'qa-only-synthetic-access-token',
    processJob: async () => ({ status: 'finished' as const }),
    now: () => 2_000,
  }

  for (const ids of [
    Array.from({ length: 26 }, (_, index) => `job-${index.toString(16).padStart(32, '0')}`),
    [validId, validId],
    ['unsafe-job'],
  ]) {
    await assert.rejects(runNotificationRecovery({
      ...base,
      listDueJobIds: async () => ids,
    }), /Invalid notification recovery page/)
  }
})

test('two concurrent recovery runs still submit one message', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const created = await jobs.createIfAbsent({ ...input, idempotencyKey: 'recovery:qa:concurrent' }, 1_000)

  const provider = new FakeWhatsAppProvider({
    response: { outcome: 'accepted', messageId: 'wamid.recovery.concurrent' },
  })

  let worker = 0

  const dependencies = {
    environment: metaEnvironment,
    readAccessToken: () => 'qa-only-synthetic-access-token',
    listDueJobIds: async () => [created.job.jobId],
    processJob: async (jobId: string) => processNotificationJob({
      jobId,
      jobs,
      data: recoveryData,
      provider,
      workerId: `scheduled-${++worker}`,
      now: () => 1_001,
    }),
    now: () => 1_001,
  }

  await Promise.all([
    runNotificationRecovery(dependencies),
    runNotificationRecovery(dependencies),
  ])

  assert.equal(provider.submittedRequests.length, 1)
  assert.equal((await jobs.getById(created.job.jobId))?.status, 'accepted')
  assert.equal((await jobs.getById(created.job.jobId))?.recoveryAt, undefined)
})

test('exhausted retry recovery becomes terminal without another dispatch', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const created = await jobs.createIfAbsent({ ...input, idempotencyKey: 'recovery:qa:exhausted' }, 1_000)
  let recoveryAt = created.job.recoveryAt!

  for (let attempt = 1; attempt <= 5; attempt++) {
    const workerId = `failed-${attempt}`

    await jobs.acquireLease(created.job.jobId, workerId, recoveryAt, 60_000)

    const failed = await jobs.finishDelivery(created.job.jobId, workerId, recoveryAt + 1, {
      status: 'retryable-failed', outcome: 'rejected', errorCode: 'PROVIDER_TEMPORARY',
    })

    recoveryAt = failed.recoveryAt!
  }

  const provider = new FakeWhatsAppProvider({
    response: { outcome: 'accepted', messageId: 'wamid.must-not-send' },
  })

  const result = await processNotificationJob({
    jobId: created.job.jobId,
    jobs,
    data: {
      readEligibility: async () => { throw new Error('Exhausted retry must not read eligibility') },
      readDocument: async () => { throw new Error('Exhausted retry must not read a document') },
    },
    provider,
    workerId: 'terminalizer',
    now: () => recoveryAt,
  })

  assert.equal(result.status, 'finished')
  assert.equal(result.job?.status, 'terminal-failed')
  assert.equal(result.job?.recoveryAt, undefined)
  assert.equal(provider.submittedRequests.length, 0)
})

test('deployed recovery keeps one five-minute scheduler and only the access-token binding', () => {
  const endpoint = (onNotificationRecoveryScheduled as unknown as {
    __endpoint: {
      timeoutSeconds?: number | null
      maxInstances?: number | null
      concurrency?: number | null
      secretEnvironmentVariables?: Array<{ key: string }>
      scheduleTrigger?: { schedule?: string; timeZone?: string }
    }
  }).__endpoint

  assert.deepEqual(endpoint.secretEnvironmentVariables?.map(secret => secret.key), [
    'WHATSAPP_ACCESS_TOKEN',
  ])
  assert.equal(endpoint.scheduleTrigger?.schedule, '*/5 * * * *')
  assert.equal(endpoint.scheduleTrigger?.timeZone, 'UTC')
  assert.equal(endpoint.timeoutSeconds, 540)
  assert.equal(endpoint.maxInstances, 1)
  assert.equal(endpoint.concurrency, 1)
})
