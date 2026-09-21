/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryNotificationJobStore } from '../src/notifications/jobs.ts'
import { processNotificationJobWithRuntime } from '../src/notifications/local-worker.ts'
import type { NotificationDataSource } from '../src/notifications/worker.ts'

const metaEnvironment = {
  KRONOS_NOTIFICATION_WORKER_MODE: 'meta',
  GCLOUD_PROJECT: 'kronos-training-fd5e5',
  KRONOS_WHATSAPP_GRAPH_API_VERSION: 'v23.0',
  KRONOS_WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
}

const document = {
  kind: 'receipt' as const,
  title: 'RECIBO' as const,
  folio: 'MEM-QA-RUNTIME-001',
  customerName: 'Atleta QA',
  issuedAt: '2026-09-11T15:00:00Z',
  concept: 'Mensualidad',
  lines: [{ description: 'Mensualidad', amount: 500 }],
  total: 500,
  amountPaid: 500,
  balance: 0,
  isProofOfPayment: true as const,
}

test('disabled or invalid runtime exits before reading secrets or creating data adapters', async () => {
  let secretReads = 0
  let adapterCreations = 0

  const dependencies = {
    readAccessToken: () => {
      secretReads += 1

      return 'must-not-be-read'
    },
    createJobStore: () => {
      adapterCreations += 1

      return new InMemoryNotificationJobStore()
    },
    createDataSource: () => {
      adapterCreations += 1

      return createDataSource()
    },
  }

  assert.deepEqual(await processNotificationJobWithRuntime('unsafe-job', {
    environment: {},
    ...dependencies,
  }), { status: 'disabled' })
  assert.deepEqual(await processNotificationJobWithRuntime('unsafe-job', {
    environment: {
      ...metaEnvironment,
      KRONOS_WHATSAPP_GRAPH_API_VERSION: 'latest',
    },
    ...dependencies,
  }), { status: 'disabled' })
  assert.deepEqual(await processNotificationJobWithRuntime('job-' + 'a'.repeat(32), {
    environment: metaEnvironment,
    readAccessToken: () => {
      secretReads += 1

      return ''
    },
    createJobStore: dependencies.createJobStore,
    createDataSource: dependencies.createDataSource,
  }), { status: 'disabled' })
  assert.equal(secretReads, 1)
  assert.equal(adapterCreations, 0)
})

test('runtime connects Meta outcomes to accepted, retryable and unknown job states', async t => {
  await t.test('accepted', async () => {
    const context = await createContext('accepted')

    const responses = [
      Response.json({ id: '987654321' }),
      Response.json({ messages: [{ id: 'wamid.runtime-accepted-1' }] }),
    ]

    const result = await runMeta(context, async () => responses.shift()!)

    assert.equal(result.status, 'finished')
    assert.equal((await context.jobs.getById(context.jobId))?.status, 'accepted')
    assert.equal((await context.jobs.getById(context.jobId))?.providerMessageId, 'wamid.runtime-accepted-1')
  })

  await t.test('rate limit', async () => {
    const context = await createContext('rate-limit')

    await runMeta(context, async () => new Response(null, { status: 429 }))

    const saved = await context.jobs.getById(context.jobId)

    assert.equal(saved?.status, 'retryable-failed')
    assert.equal(saved?.delivery?.attempts['attempt-1'].errorCode, 'PROVIDER_TEMPORARY')
  })

  await t.test('network uncertainty is not retried', async () => {
    const context = await createContext('unknown')
    let fetchCalls = 0

    const fetch = async (): Promise<Response> => {
      fetchCalls += 1
      throw new Error('private remote detail')
    }

    await runMeta(context, fetch)
    await runMeta(context, fetch)

    const saved = await context.jobs.getById(context.jobId)

    assert.equal(saved?.status, 'unknown')
    assert.equal(saved?.delivery?.attempts['attempt-1'].errorCode, 'PROVIDER_UNKNOWN')
    assert.equal(fetchCalls, 1)
  })
})

async function createContext(reference: string) {
  const jobs = new InMemoryNotificationJobStore()

  const created = await jobs.createIfAbsent({
    idempotencyKey: `runtime:${reference}`,
    type: 'payment-receipt',
    athleteId: 'qa-runtime',
    reference,
  }, 1_000)

  return { jobs, jobId: created.job.jobId }
}

function runMeta(
  context: Awaited<ReturnType<typeof createContext>>,
  fetch: typeof globalThis.fetch,
) {
  return processNotificationJobWithRuntime(context.jobId, {
    environment: metaEnvironment,
    readAccessToken: () => 'test-token-kept-in-memory',
    fetch,
    createJobStore: () => context.jobs,
    createDataSource,
    createWorkerId: () => 'qa-runtime-worker',
    now: () => 1_001,
  })
}

function createDataSource(): NotificationDataSource {
  return {
    readEligibility: async () => ({ eligible: true, recipient: '+520000000000' }),
    readDocument: async () => document,
  }
}
