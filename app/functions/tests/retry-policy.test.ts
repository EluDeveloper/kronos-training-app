import assert from 'node:assert/strict'
import test from 'node:test'
import type { NotificationJob } from '../src/notifications/jobs.ts'
import { planNotificationRetry } from '../src/notifications/retry-policy.ts'

const baseJob: NotificationJob = {
  jobId: 'job-test',
  idempotencyKey: 'membership:athlete-1:2026-09:installment-1',
  type: 'payment-receipt',
  athleteId: 'athlete-1',
  reference: 'installment-1',
  status: 'retryable-failed',
  attemptNumber: 1,
  createdAt: 1_000,
  updatedAt: 1_000,
  lock: null,
}

test('retryable failures use the bounded backoff sequence', () => {
  const delays = [1, 5, 30, 180].map(minutes => minutes * 60_000)

  delays.forEach((delay, index) => {
    const decision = planNotificationRetry({ ...baseJob, attemptNumber: index + 1 }, 2_000)
    assert.deepEqual(decision, {
      retry: true,
      retryAt: 1_000 + delay,
      reason: 'retryable',
    })
  })
})

test('retry policy stops after four retries or after the 24-hour window', () => {
  assert.deepEqual(planNotificationRetry({ ...baseJob, attemptNumber: 5 }, 2_000), {
    retry: false,
    reason: 'max-retries',
  })
  assert.deepEqual(planNotificationRetry({ ...baseJob, createdAt: 1, updatedAt: 86_400_001 }, 86_400_002), {
    retry: false,
    reason: 'window-expired',
  })
})

test('terminal, suppressed and unknown jobs never receive an automatic retry', () => {
  for (const status of ['terminal-failed', 'suppressed', 'unknown'] as const) {
    assert.deepEqual(planNotificationRetry({ ...baseJob, status }, 2_000), {
      retry: false,
      reason: 'not-retryable',
    })
  }
})
