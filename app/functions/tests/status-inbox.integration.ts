/* eslint-disable import/extensions, camelcase -- Node tests and provider wire-format fixtures. */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { setTimeout as delay } from 'node:timers/promises'
import { getNotificationDatabase, RealtimeDatabaseNotificationJobStore } from '../src/notifications/realtime-job-store.ts'
import { RealtimeStatusInbox } from '../src/whatsapp/realtime-status-inbox.ts'
import { inboxScope, parseStatusInbox, statusInboxRetentionMs } from '../src/whatsapp/status-inbox.ts'
import { runLocalStatusInboxBatch, syncLocalStatusInbox } from '../src/whatsapp/local-status-inbox.ts'

const config = { accountId: 'qa-inbox-tests', phoneNumberId: 'qa-number' }
const now = Date.UTC(2026, 8, 9)
const owned = new Set<string>()
const ownedJobs = new Set<string>()
const root = () => getNotificationDatabase().ref('v1/notificationStatusInbox/' + inboxScope(config))
function event(id: string, at = now, status = 'delivered') {
  const parsed = parseStatusInbox({ object: 'whatsapp_business_account', entry: [{ id: config.accountId, changes: [{
    field: 'messages', value: { metadata: { phone_number_id: config.phoneNumberId },
      statuses: [{ id: 'wamid.qa.' + id, status, timestamp: String(at / 1000) }] },
  }] }] }, config, at, 1000)

  if (parsed.status !== 'valid') throw new Error('Expected fixture')
  const value = parsed.events[0]!

  owned.add(value.eventKey)

  return value
}
before(() => {
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
  process.env.KRONOS_NOTIFICATION_WORKER_MODE = 'fake'
  process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = 'local'
  process.env.KRONOS_WHATSAPP_QA_ACCOUNT_ID = config.accountId
  process.env.KRONOS_WHATSAPP_QA_NUMBER_ID = config.phoneNumberId
})
after(async () => {
  for (const key of owned) await root().child(key).remove()
  for (const key of ownedJobs) await getNotificationDatabase().ref('v1/notificationJobs/' + key).remove()
  await deleteApp(getNotificationDatabase().app)
})
test('inbox persists concurrent duplicates once and retains the first reception on replay', async () => {
  const input = event('duplicate')
  const store = new RealtimeStatusInbox()

  await Promise.all([store.enqueue(input, now), store.enqueue(input, now)])

  const saved = (await root().child(input.eventKey).get()).val()

  assert.deepEqual(saved, input.record)
  await store.enqueue({ ...input, record: { ...input.record, receivedAt: now + 1000 } }, now + 1000)
  assert.deepEqual((await root().child(input.eventKey).get()).val(), saved)
  await assert.rejects(store.enqueue({ ...input, record: { ...input.record, retryable: true } }, now), /Invalid|Conflict/)
  assert.deepEqual((await root().child(input.eventKey).get()).val(), saved)
})
test('inbox checks integrity before opening DB and never opens it when disabled', async () => {
  const input = event('disabled')
  let opened = 0
  const store = new RealtimeStatusInbox(() => { opened++; throw new Error('DB opened') })

  await assert.rejects(store.enqueue({ ...input, eventKey: 'x' }, now), /Invalid/)
  process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = 'off'
  try {
    await assert.rejects(store.enqueue(input, now), /disabled/)
    await assert.rejects(store.cleanup(now), /disabled/)
    await assert.rejects(store.page(), /disabled/)
  } finally {
    process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = 'local'
  }
  assert.equal(opened, 0)
})
test('bounded inbox cleanup removes only expired rows and does not extend TTL', async () => {
  const store = new RealtimeStatusInbox()
  const fresh = event('fresh', now + 1000)

  await store.enqueue(fresh, now + 1000)
  for (let i = 0; i < 52; i++) await store.enqueue(event('expired-' + i), now)
  const count = await store.cleanup(now + statusInboxRetentionMs)

  assert.equal(count, 50)
  assert.equal(await store.cleanup(now + statusInboxRetentionMs), 3)
  assert.deepEqual((await root().child(fresh.eventKey).get()).val(), fresh.record)
  assert.equal(await store.enqueue(event('already-expired'), now + statusInboxRetentionMs), 'expired')
})
test('inbox key cursor visits later rows even if earlier rows have no matching job', async () => {
  const store = new RealtimeStatusInbox()
  for (let i = 0; i < 28; i++) await store.enqueue(event('page-' + i), now)
  const first = await store.page()

  assert.equal(first.events.length, 25)
  assert.ok(first.nextCursor)

  const second = await store.page({ afterKey: first.nextCursor! })
  const keys = [...first.events, ...second.events].map(item => item.eventKey)

  assert.equal(new Set(keys).size, 29)
  assert.equal(second.nextCursor, null)
})

async function createJob(suffix: string, messageId: string) {
  const jobs = new RealtimeDatabaseNotificationJobStore()

  const { job } = await jobs.createIfAbsent({
    athleteId: 'qa-inbox-athlete', type: 'payment-receipt', idempotencyKey: 'sale-initial:qa-inbox-' + suffix, reference: 'qa-inbox-' + suffix,
  }, now)

  ownedJobs.add(job.jobId)
  await jobs.acquireLease(job.jobId, 'qa-worker', now, 60000)
  await jobs.setProviderMessageId(job.jobId, messageId, now)

  return { jobs, job }
}
test('early inbox waits through absent job and processing then applies without another webhook', async () => {
  const input = event('race')
  const inbox = new RealtimeStatusInbox()

  await inbox.enqueue(input, now)
  assert.equal(await inbox.reconcile(input.eventKey, now), 'pending')

  const { jobs, job } = await createJob('race', input.record.providerMessageId)

  assert.equal(await inbox.reconcile(input.eventKey, now), 'pending')
  assert.equal((await root().child(input.eventKey).get()).val().processingStatus, 'pending')
  await jobs.transition(job.jobId, 'accepted', now)
  assert.equal(await inbox.reconcile(input.eventKey, now), 'completed')
  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
  assert.equal((await jobs.getById(job.jobId))?.attemptNumber, 1)
})
test('failure after job write keeps inbox pending; concurrent retry completes without regressing read', async () => {
  const input = event('partial')
  const inbox = new RealtimeStatusInbox()

  await inbox.enqueue(input, now)

  const { jobs, job } = await createJob('partial', input.record.providerMessageId)

  await jobs.transition(job.jobId, 'accepted', now)

  const original = RealtimeDatabaseNotificationJobStore.prototype.confirmProviderStatus

  RealtimeDatabaseNotificationJobStore.prototype.confirmProviderStatus = async function (...args) {
    await original.apply(this, args)
    throw new Error('Injected write completion failure')
  }
  try {
    await assert.rejects(inbox.reconcile(input.eventKey, now), /Injected/)
  } finally {
    RealtimeDatabaseNotificationJobStore.prototype.confirmProviderStatus = original
  }
  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
  assert.equal((await root().child(input.eventKey).get()).val().processingStatus, 'pending')
  await jobs.transition(job.jobId, 'read', now + 2000)
  await Promise.all([inbox.reconcile(input.eventKey, now), inbox.reconcile(input.eventKey, now)])
  assert.equal((await jobs.getById(job.jobId))?.status, 'read')
  assert.equal((await root().child(input.eventKey).get()).val().processingStatus, 'completed')
})
test('ambiguous association and changed message id cannot apply an unrelated status', async () => {
  const input = event('ambiguous')
  const inbox = new RealtimeStatusInbox()

  await inbox.enqueue(input, now)

  const a = await createJob('ambiguous-a', input.record.providerMessageId)
  const b = await createJob('ambiguous-b', input.record.providerMessageId)

  await a.jobs.transition(a.job.jobId, 'accepted', now)
  await b.jobs.transition(b.job.jobId, 'accepted', now)
  assert.equal(await inbox.reconcile(input.eventKey, now), 'pending')
  assert.equal(await a.jobs.confirmProviderStatus(a.job.jobId, 'wamid.qa.wrong', 'read', now), false)
  assert.equal((await a.jobs.getById(a.job.jobId))?.status, 'accepted')
  assert.equal((await b.jobs.getById(b.job.jobId))?.status, 'accepted')
})

test('local consumer paginates every event for one message, and recovery runner advances over unknowns', async () => {
  const inbox = new RealtimeStatusInbox()
  for (let i = 0; i < 55; i++) await inbox.enqueue(event('one-message', now - i * 1000), now)
  const { jobs, job } = await createJob('one-message', 'wamid.qa.one-message')

  await jobs.transition(job.jobId, 'accepted', now)

  const result = await syncLocalStatusInbox(job.jobId, () => now)

  assert.equal(result.processed, 55)
  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
  assert.equal((await jobs.getById(job.jobId))?.attemptNumber, 1)
  let cursor: string | undefined
  let processed = 0
  do {
    const page = await runLocalStatusInboxBatch({ afterKey: cursor, now: () => now })

    processed += page.processed
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  assert.equal(processed, 87)
})

test('individually valid but conflicting failed records reject promptly without replacing the original', async () => {
  const input = event('valid-conflict', now, 'failed')
  const inbox = new RealtimeStatusInbox()

  await inbox.enqueue(input, now)

  const conflicting = { ...input, record: { ...input.record, retryable: true } }

  await assert.rejects(Promise.race([
    inbox.enqueue(conflicting, now),
    delay(1000).then(() => { throw new Error('Conflict did not finish') }),
  ]), /Conflict in inbox event/)
  assert.deepEqual((await root().child(input.eventKey).get()).val(), input.record)
})
