/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import {
  InMemoryNotificationJobStore,
  type NotificationJobInput,
} from '../src/notifications/jobs.ts'
import {
  InMemoryWebhookEventStore,
  parseMetaWebhookEvents,
  processMetaWebhookEvent,
  validateWebhookChallenge,
  verifyMetaWebhookSignature,
} from '../src/whatsapp/webhook.ts'

const appSecret = 'test-only-app-secret'

const jobInput: NotificationJobInput = {
  idempotencyKey: 'membership:athlete-1:2026-09:installment-1',
  type: 'payment-receipt',
  athleteId: 'athlete-1',
  reference: 'payment-1',
}

function signature(body: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`
}

test('webhook signature accepts the exact HMAC and rejects malformed signatures', () => {
  const body = JSON.stringify({ hello: 'world' })

  assert.equal(verifyMetaWebhookSignature(body, signature(body), appSecret), true)
  assert.equal(verifyMetaWebhookSignature(body, 'sha256=invalid', appSecret), false)
  assert.equal(verifyMetaWebhookSignature(body, undefined, appSecret), false)
  assert.equal(verifyMetaWebhookSignature(body, signature(body).toUpperCase(), appSecret), false)
})

test('webhook challenge requires the configured mode and token', () => {
  assert.equal(validateWebhookChallenge({
    mode: 'subscribe',
    verifyToken: 'expected-token',
    challenge: 'challenge-123',
  }, 'expected-token'), 'challenge-123')
  assert.equal(validateWebhookChallenge({
    mode: 'subscribe',
    verifyToken: 'wrong-token',
    challenge: 'challenge-123',
  }, 'expected-token'), null)
  assert.equal(validateWebhookChallenge({
    mode: 'not-subscribe',
    verifyToken: 'expected-token',
    challenge: 'challenge-123',
  }, 'expected-token'), null)
})

test('webhook parser extracts only the required provider status fields', () => {
  const events = parseMetaWebhookEvents({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          statuses: [{ id: 'wamid.test.1', status: 'delivered' }],
        },
      }],
    }],
  })

  assert.deepEqual(events, [{
    eventId: 'wamid.test.1:delivered',
    providerMessageId: 'wamid.test.1',
    status: 'delivered',
    retryable: false,
  }])
  assert.deepEqual(parseMetaWebhookEvents({ object: 'unexpected' }), [])
  assert.deepEqual(parseMetaWebhookEvents({ object: 'whatsapp_business_account', entry: [] }), [])
})

test('duplicate webhooks are ignored and late statuses cannot regress a job', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const webhookEvents = new InMemoryWebhookEventStore()
  const { job } = await jobs.createIfAbsent(jobInput, 1000)

  await jobs.acquireLease(job.jobId, 'worker-a', 1000, 60_000)
  await jobs.transition(job.jobId, 'accepted', 1001)
  await jobs.setProviderMessageId(job.jobId, 'wamid.test.1', 1002)

  const payload = (status: string, timestamp?: string) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses: [{
      id: 'wamid.test.1',
      status,
      ...(timestamp ? { timestamp } : {}),
    }] } }] }],
  })

  assert.deepEqual(await processMetaWebhookEvent(payload('sent'), webhookEvents, jobs, 1003), {
    status: 'applied',
    jobStatus: 'sent',
  })
  assert.deepEqual(await processMetaWebhookEvent(payload('sent'), webhookEvents, jobs, 1004), {
    status: 'duplicate',
  })
  assert.deepEqual(await processMetaWebhookEvent(payload('delivered', '1005'), webhookEvents, jobs, 1005), {
    status: 'applied',
    jobStatus: 'delivered',
  })
  assert.deepEqual(await processMetaWebhookEvent(payload('read', '1006'), webhookEvents, jobs, 1006), {
    status: 'applied',
    jobStatus: 'read',
  })
  assert.deepEqual(await processMetaWebhookEvent(payload('delivered', '1007'), webhookEvents, jobs, 1007), {
    status: 'ignored',
    reason: 'stale-status',
  })
  assert.equal((await jobs.getById(job.jobId))?.status, 'read')
})

test('unknown provider messages are acknowledged but do not mutate jobs', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const webhookEvents = new InMemoryWebhookEventStore()

  assert.deepEqual(await processMetaWebhookEvent({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.unknown', status: 'read' }] } }] }],
  }, webhookEvents, jobs, 1000), {
    status: 'ignored',
    reason: 'unknown-message',
  })
})

function statusPayload(...statuses: Array<{ id: string; status: string }>) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses } }] }],
  }
}

async function acceptedJob(jobs: InMemoryNotificationJobStore, suffix = '1') {
  const { job } = await jobs.createIfAbsent({
    ...jobInput,
    idempotencyKey: `sale-initial:qa-${suffix}`,
  }, 1000)

  await jobs.acquireLease(job.jobId, `worker-${suffix}`, 1000, 60_000)
  await jobs.setProviderMessageId(job.jobId, `wamid.test.${suffix}`, 1001)
  await jobs.transition(job.jobId, 'accepted', 1002)

  return job
}

test('a webhook batch updates every message across entries and changes', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const events = new InMemoryWebhookEventStore()
  const first = await acceptedJob(jobs, '1')
  const second = await acceptedJob(jobs, '2')

  const payload = statusPayload(
    { id: 'wamid.test.1', status: 'sent' },
    { id: 'wamid.test.2', status: 'delivered' },
  )

  payload.entry.push({ changes: [
    { field: 'messages', value: { statuses: [{ id: 'wamid.test.1', status: 'delivered' }] } },
    { field: 'messages', value: { statuses: [{ id: 'wamid.test.2', status: 'read' }] } },
  ] })

  await processMetaWebhookEvent(payload, events, jobs, 1003)

  assert.equal((await jobs.getById(first.jobId))?.status, 'delivered')
  assert.equal((await jobs.getById(second.jobId))?.status, 'read')
})

test('read can arrive before sent and delivered without being discarded', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const events = new InMemoryWebhookEventStore()
  const job = await acceptedJob(jobs)

  await processMetaWebhookEvent(statusPayload({ id: 'wamid.test.1', status: 'read' }), events, jobs, 1003)

  assert.equal((await jobs.getById(job.jobId))?.status, 'read')
})

test('a known message with an unknown outcome is reconciled by delivery evidence', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const events = new InMemoryWebhookEventStore()
  const job = await acceptedJob(jobs)

  await jobs.transition(job.jobId, 'unknown', 1003)

  await processMetaWebhookEvent(statusPayload({ id: 'wamid.test.1', status: 'delivered' }), events, jobs, 1004)

  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
})

test('a failed status write does not consume the event before its retry', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const events = new InMemoryWebhookEventStore()
  const job = await acceptedJob(jobs)
  const transition = jobs.transition.bind(jobs)

  jobs.transition = async () => { throw new Error('temporary database failure') }

  const payload = statusPayload({ id: 'wamid.test.1', status: 'delivered' })

  await assert.rejects(processMetaWebhookEvent(payload, events, jobs, 1003), /temporary database failure/)
  jobs.transition = transition
  await processMetaWebhookEvent(payload, events, jobs, 1004)

  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
})

test('an early webhook can be replayed after its message is correlated', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const events = new InMemoryWebhookEventStore()
  const payload = statusPayload({ id: 'wamid.test.1', status: 'delivered' })

  await processMetaWebhookEvent(payload, events, jobs, 1000)

  const job = await acceptedJob(jobs)

  await processMetaWebhookEvent(payload, events, jobs, 1003)

  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
})

test('replaying a partially failed batch finishes the remaining messages', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const events = new InMemoryWebhookEventStore()
  const first = await acceptedJob(jobs, '1')
  const second = await acceptedJob(jobs, '2')
  const transition = jobs.transition.bind(jobs)

  jobs.transition = async (jobId, status, now) => {
    if (jobId === second.jobId)
      throw new Error('temporary second write failure')

    return transition(jobId, status, now)
  }

  const payload = statusPayload(
    { id: 'wamid.test.1', status: 'delivered' },
    { id: 'wamid.test.2', status: 'delivered' },
  )

  await assert.rejects(processMetaWebhookEvent(payload, events, jobs, 1003), /temporary second write failure/)
  jobs.transition = transition
  await processMetaWebhookEvent(payload, events, jobs, 1004)

  assert.equal((await jobs.getById(first.jobId))?.status, 'delivered')
  assert.equal((await jobs.getById(second.jobId))?.status, 'delivered')
})

test('a failed completion marker can be retried without applying the status twice', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const events = new InMemoryWebhookEventStore()
  const job = await acceptedJob(jobs)
  const markProcessed = events.markProcessed.bind(events)

  events.markProcessed = async () => { throw new Error('temporary marker failure') }

  const payload = statusPayload({ id: 'wamid.test.1', status: 'delivered' })

  await assert.rejects(processMetaWebhookEvent(payload, events, jobs, 1003), /temporary marker failure/)
  events.markProcessed = markProcessed
  await processMetaWebhookEvent(payload, events, jobs, 1004)

  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
  assert.equal((await jobs.getById(job.jobId))?.updatedAt, 1003)
  assert.deepEqual(await processMetaWebhookEvent(payload, events, jobs, 1005), { status: 'duplicate' })
})

test('a concurrent newer status wins without making the older webhook fail', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const events = new InMemoryWebhookEventStore()
  const job = await acceptedJob(jobs)
  const transition = jobs.transition.bind(jobs)

  jobs.transition = async (jobId, status, now) => {
    await transition(jobId, 'read', now)

    return transition(jobId, status, now)
  }

  const result = await processMetaWebhookEvent(
    statusPayload({ id: 'wamid.test.1', status: 'delivered' }), events, jobs, 1003,
  )

  assert.deepEqual(result, { status: 'ignored', reason: 'stale-status' })
  assert.equal((await jobs.getById(job.jobId))?.status, 'read')
})
