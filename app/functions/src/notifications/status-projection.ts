import { notificationJobId } from './jobs.js'

export interface NotificationStatusView {
  type: 'payment-receipt' | 'payment-reminder'
  status: 'pending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'omitted' | 'error' | 'unknown'
  updatedAt: number
  folio?: string
  period?: string
}

const statuses: Record<string, NotificationStatusView['status']> = {
  queued: 'pending', processing: 'pending', 'retryable-failed': 'pending',
  accepted: 'accepted', sent: 'sent', delivered: 'delivered', read: 'read',
  suppressed: 'omitted', 'terminal-failed': 'error', unknown: 'unknown',
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function buildNotificationStatus(value: unknown): NotificationStatusView | null {
  const job = record(value)
  if (typeof job.athleteId !== 'string' || !/^[\w-]{1,128}$/.test(job.athleteId)
    || typeof job.idempotencyKey !== 'string' || job.idempotencyKey.length > 512
    || job.jobId !== notificationJobId(job.idempotencyKey)
    || (job.type !== 'payment-receipt' && job.type !== 'payment-reminder')
    || typeof job.status !== 'string' || !Object.hasOwn(statuses, job.status)
    || typeof job.updatedAt !== 'number' || !Number.isSafeInteger(job.updatedAt) || job.updatedAt < 0 || job.updatedAt > 8.64e15)
    return null

  const result: NotificationStatusView = { type: job.type, status: statuses[job.status], updatedAt: job.updatedAt }
  const [kind, athleteId, period, installment, ...extra] = job.idempotencyKey.split(':')
  if (job.type === 'payment-receipt' && ['membership', 'combined'].includes(kind)
    && athleteId === job.athleteId && installment && !extra.length && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(period))
    result.period = period

  if (job.type === 'payment-reminder' && kind === 'reminder' && athleteId === job.athleteId && installment === 'daily' && !extra.length) {
    const reference = typeof job.reference === 'string' ? job.reference.split(':') : []
    if (reference.length === 4 && reference[0] === 'reminder' && reference[1] === period
      && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(reference[3]))
      result.period = reference[3]
  }

  const attempt = record(record(record(job.delivery).attempts)[`attempt-${job.attemptNumber}`])
  const expectedFolio = `${job.type === 'payment-receipt' ? 'REC' : 'AVS'}-${String(job.jobId).slice(4).toUpperCase()}`
  if (record(attempt.metadata).folio === expectedFolio)
    result.folio = expectedFolio

  return result
}

// RTDB retries this pure reducer on conflicts. A stale trigger cannot undo proof
// of delivery/read, even if two canonical transitions share a millisecond.
export function mergeNotificationStatus(current: NotificationStatusView | null, next: NotificationStatusView): NotificationStatusView {
  if (!current)
    return next

  const order: Record<NotificationStatusView['status'], number> = { pending: 0, accepted: 1, unknown: 2, sent: 3, error: 4, omitted: 4, delivered: 5, read: 6 }

  // Webhooks can receive a timestamp before waiting for another transaction.
  // Canonical forward progress wins; keep the display clock non-decreasing.
  if (order[next.status] > order[current.status])
    return { ...next, updatedAt: Math.max(current.updatedAt, next.updatedAt) }
  if (order[next.status] < order[current.status] || next.updatedAt < current.updatedAt)
    return current

  return next
}

export async function syncNotificationStatus(jobId: string, dependencies: {
  readJob: (id: string) => Promise<unknown>
  writeProjection: (athleteId: string, id: string, view: NotificationStatusView) => Promise<void>
}): Promise<'updated' | 'ignored'> {
  if (!/^job-[a-f\d]{32}$/.test(jobId))
    throw new Error('Invalid notification job id')
  const job = record(await dependencies.readJob(jobId))
  const view = job.jobId === jobId ? buildNotificationStatus(job) : null
  if (!view)
    return 'ignored'
  await dependencies.writeProjection(job.athleteId as string, jobId, view)

  return 'updated'
}
