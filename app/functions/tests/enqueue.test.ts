import assert from 'node:assert/strict'
import test from 'node:test'
import { enqueuePaymentNotification } from '../src/notifications/enqueue.ts'
import { InMemoryNotificationJobStore } from '../src/notifications/jobs.ts'
import type { PaymentAppliedEvent } from '../src/notifications/payment-events.ts'

const event: PaymentAppliedEvent = {
  kind: 'membership',
  correlationKey: 'membership:athlete-1:2026-09:installment-1',
  athleteId: 'athlete-1',
  referenceId: 'installment-1',
  period: '2026-09',
  amountApplied: 500,
  occurredAt: 1000,
}

test('repeated payment events enqueue one deterministic receipt job', async () => {
  const store = new InMemoryNotificationJobStore()

  const first = await enqueuePaymentNotification(event, store, 1000)
  const second = await enqueuePaymentNotification({ ...event, occurredAt: 2000 }, store, 2000)

  assert.equal(first?.created, true)
  assert.equal(second?.created, false)
  assert.equal(first?.job.jobId, second?.job.jobId)
})

test('events without an athlete are suppressed before job creation', async () => {
  const store = new InMemoryNotificationJobStore()

  const result = await enqueuePaymentNotification({ ...event, athleteId: null }, store, 1000)

  assert.equal(result, null)
  assert.equal(await store.getByIdempotencyKey(event.correlationKey), null)
})
