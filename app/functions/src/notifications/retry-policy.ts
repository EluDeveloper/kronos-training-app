import type { NotificationJob } from './jobs.js'

export const notificationRetryDelaysMs = [
  1 * 60_000,
  5 * 60_000,
  30 * 60_000,
  180 * 60_000,
] as const

export const notificationRetryWindowMs = 24 * 60 * 60_000

export type NotificationRetryReason =
  | 'retryable'
  | 'max-retries'
  | 'window-expired'
  | 'not-retryable'
  | 'invalid-state'

export type NotificationRetryPlan =
  | { retry: true; retryAt: number; reason: 'retryable' }
  | { retry: false; reason: Exclude<NotificationRetryReason, 'retryable'> }

export function planNotificationRetry(job: NotificationJob, now: number): NotificationRetryPlan {
  if (!Number.isFinite(now)
    || !Number.isFinite(job.createdAt)
    || !Number.isFinite(job.updatedAt)
    || !Number.isInteger(job.attemptNumber)
    || job.attemptNumber < 1) {
    return { retry: false, reason: 'invalid-state' }
  }

  if (job.status !== 'retryable-failed')
    return { retry: false, reason: 'not-retryable' }

  if (now - job.createdAt >= notificationRetryWindowMs)
    return { retry: false, reason: 'window-expired' }

  const delay = notificationRetryDelaysMs[job.attemptNumber - 1]
  if (delay === undefined)
    return { retry: false, reason: 'max-retries' }

  const retryAt = job.updatedAt + delay
  if (retryAt - job.createdAt >= notificationRetryWindowMs)
    return { retry: false, reason: 'window-expired' }

  return { retry: true, retryAt, reason: 'retryable' }
}
