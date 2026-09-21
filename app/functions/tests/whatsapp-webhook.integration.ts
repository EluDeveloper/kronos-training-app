/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase, RealtimeDatabaseNotificationJobStore } from '../src/notifications/realtime-job-store.ts'
import {
  RealtimeWebhookEventStore,
  webhookEventRetentionMs,
} from '../src/whatsapp/realtime-webhook-events.ts'
import { processMetaWebhookEvent } from '../src/whatsapp/webhook.ts'

before(() => {
  // This suite writes synthetic fixtures; refuse every non-local/non-demo target.
  assert.match(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '', /^(?:127\.0\.0\.1|localhost):\d+$/)
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
})

beforeEach(async () => {
  await getNotificationDatabase().ref('v1').update({
    notificationJobs: null,
    notificationWebhookEvents: null,
  })
})

after(async () => {
  if (process.env.GCLOUD_PROJECT === 'demo-kronos-training'
    && /^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? ''))
    await deleteApp(getNotificationDatabase().app)
})

function payload(...statuses: Array<{ id: string; status: string }>) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses } }] }],
  }
}

async function acceptedJob(jobs: RealtimeDatabaseNotificationJobStore, suffix: string) {
  const { job } = await jobs.createIfAbsent({
    idempotencyKey: `sale-initial:qa-webhook-${suffix}`,
    type: 'payment-receipt',
    athleteId: 'qa-webhook-athlete',
    reference: `qa-sale-${suffix}`,
  }, 1000)

  await jobs.acquireLease(job.jobId, `worker-${suffix}`, 1000, 60_000)
  await jobs.setProviderMessageId(job.jobId, `wamid.qa.${suffix}`, 1001)
  await jobs.transition(job.jobId, 'accepted', 1002)

  return job
}

test('RTDB persists every status in a batch and deduplicates its replay', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const events = new RealtimeWebhookEventStore()
  const first = await acceptedJob(jobs, '1')
  const second = await acceptedJob(jobs, '2')
  const batch = payload({ id: 'wamid.qa.1', status: 'read' }, { id: 'wamid.qa.2', status: 'delivered' })

  await processMetaWebhookEvent(batch, events, jobs, 1003)

  const replay = await processMetaWebhookEvent(batch, events, jobs, 1004)

  assert.equal((await jobs.getById(first.jobId))?.status, 'read')
  assert.equal((await jobs.getById(second.jobId))?.status, 'delivered')
  assert.deepEqual(replay, { status: 'processed', results: [{ status: 'duplicate' }, { status: 'duplicate' }] })

  const markers = (await getNotificationDatabase().ref('v1/notificationWebhookEvents').get()).val()

  assert.equal(Object.keys(markers).length, 2)
  assert.deepEqual(Object.values(markers), [
    { receivedAt: 1003, expiresAt: 1003 + webhookEventRetentionMs },
    { receivedAt: 1003, expiresAt: 1003 + webhookEventRetentionMs },
  ])
})

test('webhook cleanup is bounded and preserves current or historical markers without TTL', async () => {
  const events = new RealtimeWebhookEventStore()
  const database = getNotificationDatabase()
  const root = database.ref('v1/notificationWebhookEvents')
  const now = 4_000_000_000

  for (let index = 0; index < 55; index++)
    await events.markProcessed(`expired-${index}`, now - webhookEventRetentionMs)
  await events.markProcessed('current', now)
  await root.child('f'.repeat(64)).set({ receivedAt: 1003 })

  assert.equal(await events.cleanup(now), 50)
  assert.equal(await events.cleanup(now), 5)
  assert.equal(await events.cleanup(now), 0)
  assert.equal((await root.child('f'.repeat(64)).get()).exists(), true)
  assert.equal((await root.orderByChild('expiresAt').startAt(now + 1).get()).numChildren(), 1)
})

test('RTDB retries a status after a temporary write failure', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const events = new RealtimeWebhookEventStore()
  const job = await acceptedJob(jobs, '1')
  const transition = jobs.transition.bind(jobs)

  jobs.transition = async () => { throw new Error('synthetic write failure') }

  const event = payload({ id: 'wamid.qa.1', status: 'delivered' })

  await assert.rejects(processMetaWebhookEvent(event, events, jobs, 1003), /synthetic write failure/)
  assert.equal((await getNotificationDatabase().ref('v1/notificationWebhookEvents').get()).exists(), false)
  jobs.transition = transition
  await processMetaWebhookEvent(event, events, jobs, 1004)

  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
})

test('RTDB replay after a marker failure preserves the original status timestamp', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const events = new RealtimeWebhookEventStore()
  const job = await acceptedJob(jobs, '1')
  const markProcessed = events.markProcessed.bind(events)

  events.markProcessed = async () => { throw new Error('synthetic marker failure') }

  const event = payload({ id: 'wamid.qa.1', status: 'delivered' })

  await assert.rejects(processMetaWebhookEvent(event, events, jobs, 1003), /synthetic marker failure/)
  events.markProcessed = markProcessed
  await processMetaWebhookEvent(event, events, jobs, 1004)

  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
  assert.equal((await jobs.getById(job.jobId))?.updatedAt, 1003)
  assert.deepEqual(await processMetaWebhookEvent(event, events, jobs, 1005), { status: 'duplicate' })
})

test('RTDB concurrent webhooks preserve read without duplicate completion records', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const events = new RealtimeWebhookEventStore()
  const job = await acceptedJob(jobs, '1')

  await Promise.all(['read', 'delivered', 'sent', 'read'].map(status =>
    processMetaWebhookEvent(payload({ id: 'wamid.qa.1', status }), events, jobs, 1003)))

  assert.equal((await jobs.getById(job.jobId))?.status, 'read')

  const markers = (await getNotificationDatabase().ref('v1/notificationWebhookEvents').get()).val()

  assert.equal(Object.keys(markers).length, 3)
})
