import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InMemoryNotificationJobStore,
  canTransitionNotificationStatus,
  notificationJobId,
  type NotificationJobInput,
} from '../src/notifications/jobs.ts'

const input: NotificationJobInput = {
  idempotencyKey: 'membership:athlete-1:2026-09:installment-1',
  type: 'payment-receipt',
  athleteId: 'athlete-1',
  reference: 'payment-1',
}

test('create-if-absent returns one job for concurrent duplicate keys', async () => {
  const store = new InMemoryNotificationJobStore()

  const results = await Promise.all([
    store.createIfAbsent(input, 1000),
    store.createIfAbsent(input, 1000),
  ])

  assert.equal(results.filter(result => result.created).length, 1)
  assert.equal(results[0].job.jobId, results[1].job.jobId)
  assert.equal(results[0].job.idempotencyKey, input.idempotencyKey)
  assert.equal(results[0].job.status, 'queued')
})

test('active lease prevents a second worker from processing the same job', async () => {
  const store = new InMemoryNotificationJobStore()
  const { job } = await store.createIfAbsent(input, 1000)

  const first = await store.acquireLease(job.jobId, 'worker-a', 1000, 60_000)
  const second = await store.acquireLease(job.jobId, 'worker-b', 1001, 60_000)

  assert.equal(first?.lock?.workerId, 'worker-a')
  assert.equal(second, null)
})

test('expired lease can be recovered without creating another job', async () => {
  const store = new InMemoryNotificationJobStore()
  const { job } = await store.createIfAbsent(input, 1000)

  await store.acquireLease(job.jobId, 'worker-a', 1000, 60_000)
  const recovered = await store.acquireLease(job.jobId, 'worker-b', 61_001, 60_000)

  assert.equal(recovered?.lock?.workerId, 'worker-b')
  assert.equal((await store.getById(job.jobId))?.jobId, notificationJobId(input.idempotencyKey))
})

test('invalid status regressions are rejected while retry recovery remains explicit', async () => {
  const store = new InMemoryNotificationJobStore()
  const { job } = await store.createIfAbsent(input, 1000)

  assert.equal(canTransitionNotificationStatus('queued', 'processing'), true)
  assert.equal(canTransitionNotificationStatus('delivered', 'sent'), false)
  assert.equal(canTransitionNotificationStatus('retryable-failed', 'processing'), true)

  await store.transition(job.jobId, 'processing', 1000)
  await assert.rejects(store.transition(job.jobId, 'queued', 1001), /Invalid notification status transition/)
  await store.transition(job.jobId, 'retryable-failed', 1002)
  await store.transition(job.jobId, 'processing', 1003)
  assert.equal((await store.getById(job.jobId))?.status, 'processing')
})

test('terminal statuses cannot be changed by a late provider update', async () => {
  const store = new InMemoryNotificationJobStore()
  const { job } = await store.createIfAbsent(input, 1000)

  await store.transition(job.jobId, 'processing', 1000)
  await store.transition(job.jobId, 'accepted', 1001)
  await store.transition(job.jobId, 'delivered', 1002)
  await assert.rejects(store.transition(job.jobId, 'sent', 1003), /Invalid notification status transition/)
  assert.equal((await store.getById(job.jobId))?.status, 'delivered')
})
