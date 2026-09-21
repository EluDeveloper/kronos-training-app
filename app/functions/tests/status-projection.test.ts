import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notificationJobId, type NotificationJob } from '../src/notifications/jobs.js'
import { buildNotificationStatus, mergeNotificationStatus } from '../src/notifications/status-projection.js'

const key = 'membership:qa:2026-09:one'

const job: NotificationJob = {
  jobId: notificationJobId(key), idempotencyKey: key, athleteId: 'qa',
  type: 'payment-receipt', status: 'queued', createdAt: 1, updatedAt: 2,
  attemptNumber: 0, lock: null,
}

test('projection maps every canonical state without claiming acceptance means delivery', () => {
  const statuses = {
    queued: 'pending', processing: 'pending', 'retryable-failed': 'pending',
    accepted: 'accepted', sent: 'sent', delivered: 'delivered', read: 'read',
    suppressed: 'omitted', 'terminal-failed': 'error', unknown: 'unknown',
  } as const

  for (const [status, expected] of Object.entries(statuses))
    assert.equal(buildNotificationStatus({ ...job, status })?.status, expected)
})

test('projection allowlists fields and only exposes a matching canonical folio', () => {
  const folio = `REC-${job.jobId.slice(4).toUpperCase()}`

  const input = { ...job, attemptNumber: 1, providerMessageId: 'private', phone: 'private',
    delivery: { attempts: { 'attempt-1': { metadata: { folio, recipientHash: 'private', documentBytes: 300 }, errorCode: 'private' } } } }

  assert.deepEqual(buildNotificationStatus(input), { type: 'payment-receipt', status: 'pending', updatedAt: 2, folio, period: '2026-09' })
  input.delivery.attempts['attempt-1'].metadata.folio = 'private phone or arbitrary text'
  assert.equal(buildNotificationStatus(input)?.folio, undefined)
})

test('projection rejects malformed jobs and mismatched identity', () => {
  for (const value of [null,
    [],
    {},
    { ...job, jobId: 'other' },
    { ...job, athleteId: '../qa' },
    { ...job, updatedAt: Infinity },
    { ...job, updatedAt: -1 },
    { ...job, type: 'other' },
    { ...job, status: 'other' }])
    assert.equal(buildNotificationStatus(value), null)
})

test('period is derived only from an unambiguous matching membership or reminder', () => {
  const withKey = (idempotencyKey: string, extra = {}) => buildNotificationStatus({ ...job, ...extra, idempotencyKey, jobId: notificationJobId(idempotencyKey) })

  assert.equal(withKey('membership:other:2026-09:one')?.period, undefined)
  assert.equal(withKey('membership:qa:2026-13:one')?.period, undefined)
  assert.equal(withKey('sale-initial:sale')?.period, undefined)
  assert.equal(withKey('reminder:qa:2026-09-09:daily', { type: 'payment-reminder', reference: 'reminder:2026-09-09:monthly:2026-09' })?.period, '2026-09')
  assert.equal(withKey('reminder:qa:2026-09-09:daily', { type: 'payment-reminder', reference: 'reminder:2026-08-09:monthly:2026-08' })?.period, undefined)
})

test('out-of-order and equal-clock updates never regress delivered or read', () => {
  const view = buildNotificationStatus(job)!
  const read = { ...view, status: 'read' as const, updatedAt: 10 }
  const delivered = { ...view, status: 'delivered' as const, updatedAt: 9 }

  assert.deepEqual(mergeNotificationStatus(read, { ...view, updatedAt: 20 }), read)
  assert.deepEqual(mergeNotificationStatus(delivered, { ...view, status: 'read', updatedAt: 9 }), { ...delivered, status: 'read' })
  assert.deepEqual(mergeNotificationStatus(view, { ...view, updatedAt: 1 }), view)
  assert.deepEqual(mergeNotificationStatus(null, view), view)
})

test('canonical delivery/read advancement survives reversed concurrent webhook timestamps', () => {
  const view = buildNotificationStatus(job)!

  assert.deepEqual(mergeNotificationStatus({ ...view, status: 'delivered', updatedAt: 110 }, { ...view, status: 'read', updatedAt: 100 }),
    { ...view, status: 'read', updatedAt: 110 })
  assert.deepEqual(mergeNotificationStatus({ ...view, status: 'accepted', updatedAt: 110 }, { ...view, status: 'delivered', updatedAt: 100 }),
    { ...view, status: 'delivered', updatedAt: 110 })
  assert.deepEqual(mergeNotificationStatus({ ...view, status: 'accepted', updatedAt: 110 }, { ...view, status: 'sent', updatedAt: 100 }),
    { ...view, status: 'sent', updatedAt: 110 })
})
