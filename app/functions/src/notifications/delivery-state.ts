import type { NotificationJob, NotificationStatus } from './jobs.js'
import type { ProviderOutcome } from '../whatsapp/client.js'

export interface DispatchMetadata {
  folio: string
  templateName: string
  locale: string
  documentSha256: string
  documentBytes: number
  recipientHash: string
  recipientLast4: string
}

export interface DeliveryResult {
  status: Extract<NotificationStatus, 'accepted' | 'retryable-failed' | 'terminal-failed' | 'suppressed' | 'unknown'>
  outcome: ProviderOutcome | 'suppressed'
  errorCode?: string
  messageId?: string
}

export interface DeliveryAttempt {
  workerId: string
  startedAt: number
  finishedAt?: number
  outcome: DeliveryResult['outcome'] | 'dispatching'
  metadata?: DispatchMetadata
  errorCode?: string
  messageId?: string
}

export interface DeliveryAudit {
  attempts: Record<string, DeliveryAttempt>
}

export function startDispatchState(
  job: NotificationJob, workerId: string, now: number, metadata: DispatchMetadata,
): NotificationJob | null {
  if (!Number.isFinite(now) || job.status !== 'processing' || job.lock?.workerId !== workerId || job.lock.leaseUntil <= now)
    return null
  const attempts = job.delivery?.attempts ?? {}
  if (Object.values(attempts).some(attempt => ['dispatching', 'accepted', 'unknown'].includes(attempt.outcome)))
    return null

  return {
    ...job,
    delivery: { attempts: { ...attempts, [`attempt-${job.attemptNumber}`]: {
      workerId, startedAt: now, outcome: 'dispatching', metadata,
    } } },
    updatedAt: now,
  }
}

export function finishDeliveryState(
  job: NotificationJob, workerId: string, now: number, result: DeliveryResult,
): NotificationJob {
  const previous = job.delivery?.attempts[`attempt-${job.attemptNumber}`]
  const ownsLease = job.status === 'processing' && job.lock?.workerId === workerId
  const ownsDispatch = previous?.workerId === workerId && ['dispatching', 'unknown'].includes(previous.outcome)
  if (!Number.isFinite(now) || (!ownsLease && !ownsDispatch))
    throw new Error('Delivery ownership lost')
  if (result.messageId && job.providerMessageId && result.messageId !== job.providerMessageId)
    throw new Error('Conflicting provider message id')

  return {
    ...job,
    status: ownsLease ? result.status : job.status,
    ...(result.messageId ? { providerMessageId: result.messageId } : {}),
    updatedAt: ownsLease ? now : job.updatedAt,
    lock: ownsLease ? null : job.lock,
    delivery: { attempts: { ...(job.delivery?.attempts ?? {}), [`attempt-${job.attemptNumber}`]: {
      ...previous,
      workerId: previous?.workerId ?? workerId,
      startedAt: previous?.startedAt ?? job.updatedAt,
      finishedAt: now,
      outcome: result.outcome,
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      ...(result.messageId ? { messageId: result.messageId } : {}),
    } } },
  }
}
