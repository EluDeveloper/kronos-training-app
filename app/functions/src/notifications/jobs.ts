import { createHash } from 'node:crypto'
import { finishDeliveryState, startDispatchState } from './delivery-state.js'
import type { DeliveryAudit, DeliveryResult, DispatchMetadata } from './delivery-state.js'
import { planNotificationRetry } from './retry-policy.js'

export type NotificationJobType = 'payment-receipt' | 'payment-reminder'

export type NotificationStatus =
  | 'queued'
  | 'processing'
  | 'accepted'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'retryable-failed'
  | 'terminal-failed'
  | 'suppressed'
  | 'unknown'

export interface NotificationJobInput {
  idempotencyKey: string
  type: NotificationJobType
  athleteId: string
  reference?: string
}

export interface NotificationJobLock {
  workerId: string
  leaseUntil: number
}

export interface NotificationJob extends NotificationJobInput {
  jobId: string
  providerMessageId?: string
  status: NotificationStatus
  attemptNumber: number
  createdAt: number
  updatedAt: number
  recoveryAt?: number
  lock: NotificationJobLock | null
  delivery?: DeliveryAudit
}

export interface CreateNotificationJobResult {
  job: NotificationJob
  created: boolean
}

export type NotificationLeaseSnapshot = Pick<NotificationJob, 'status' | 'attemptNumber' | 'updatedAt'>

export interface NotificationJobStore {
  createIfAbsent(input: NotificationJobInput, now: number): Promise<CreateNotificationJobResult>
  getById(jobId: string): Promise<NotificationJob | null>
  getByIdempotencyKey(idempotencyKey: string): Promise<NotificationJob | null>
  getByProviderMessageId(providerMessageId: string): Promise<NotificationJob | null>
  setProviderMessageId(jobId: string, providerMessageId: string, now: number): Promise<NotificationJob>
  acquireLease(jobId: string, workerId: string, now: number, leaseMs: number, expected?: NotificationLeaseSnapshot): Promise<NotificationJob | null>
  transition(jobId: string, status: NotificationStatus, now: number): Promise<NotificationJob>
  startDispatch(jobId: string, workerId: string, now: number, metadata: DispatchMetadata): Promise<boolean>
  finishDelivery(jobId: string, workerId: string, now: number, result: DeliveryResult): Promise<NotificationJob>
}

const allowedTransitions: Record<NotificationStatus, readonly NotificationStatus[]> = {
  queued: ['processing'],
  processing: ['accepted', 'retryable-failed', 'terminal-failed', 'suppressed', 'unknown'],
  accepted: ['sent', 'delivered', 'read', 'terminal-failed', 'unknown'],
  sent: ['delivered', 'read', 'terminal-failed'],
  delivered: ['read'],
  read: [],
  'retryable-failed': ['processing'],
  'terminal-failed': [],
  suppressed: [],
  unknown: ['sent', 'delivered', 'read', 'terminal-failed'],
}

export function canTransitionNotificationStatus(from: NotificationStatus, to: NotificationStatus): boolean {
  return from === to || allowedTransitions[from].includes(to)
}

export function notificationRecoveryAt(job: NotificationJob): number | null {
  let recoveryAt: number | null = null
  if (job.status === 'queued')
    recoveryAt = job.createdAt
  else if (job.status === 'processing')
    recoveryAt = job.lock?.leaseUntil ?? job.updatedAt
  else if (job.status === 'retryable-failed') {
    const retry = planNotificationRetry(job, job.updatedAt)

    recoveryAt = retry.retry ? retry.retryAt : job.updatedAt
  }

  if (recoveryAt !== null && (!Number.isSafeInteger(recoveryAt) || recoveryAt < 0))
    throw new Error('Invalid notification recovery time')

  return recoveryAt
}

export function synchronizeNotificationRecovery(job: NotificationJob): NotificationJob {
  const { recoveryAt: _, ...canonical } = job
  const recoveryAt = notificationRecoveryAt(job)

  return recoveryAt === null ? canonical : { ...canonical, recoveryAt }
}

// A wamid can be persisted before the send result. Keep early states pending
// until that result is durable; recovering a status never reserves another send.
export function decideProviderStatus(
  job: NotificationJob | null, providerMessageId: string, status: NotificationStatus, now: number,
): { completed: boolean; job: NotificationJob | null } {
  if (!['sent', 'delivered', 'read', 'retryable-failed', 'terminal-failed'].includes(status)
    || !Number.isSafeInteger(now) || now < 0)
    throw new Error('Invalid provider status')
  if (!job || job.providerMessageId !== providerMessageId || job.status === 'queued' || job.status === 'processing')
    return { completed: false, job }
  if (job.status === status || !canTransitionNotificationStatus(job.status, status))
    return { completed: true, job }

  return { completed: true, job: { ...job, status, updatedAt: Math.max(now, job.updatedAt), lock: null } }
}

export function notificationJobId(idempotencyKey: string): string {
  return `job-${createHash('sha256').update(canonicalNotificationIdempotencyKey(idempotencyKey)).digest('hex').slice(0, 32)}`
}

export class InMemoryNotificationJobStore implements NotificationJobStore {
  private readonly jobs = new Map<string, NotificationJob>()
  private readonly jobsByProviderMessageId = new Map<string, string>()

  async startDispatch(jobId: string, workerId: string, now: number, metadata: DispatchMetadata): Promise<boolean> {
    const job = this.jobs.get(jobId)
    const next = job ? startDispatchState(job, workerId, now, metadata) : null
    if (!next)
      return false
    this.jobs.set(jobId, structuredClone(synchronizeNotificationRecovery(next)))

    return true
  }

  async finishDelivery(jobId: string, workerId: string, now: number, result: DeliveryResult): Promise<NotificationJob> {
    const job = this.jobs.get(jobId)
    if (!job)
      throw new Error('Notification job not found')
    const existingJob = result.messageId ? this.jobsByProviderMessageId.get(result.messageId) : undefined
    if (existingJob && existingJob !== jobId)
      throw new Error('Provider message id is already assigned')
    const next = synchronizeNotificationRecovery(finishDeliveryState(job, workerId, now, result))

    this.jobs.set(jobId, next)
    if (result.messageId)
      this.jobsByProviderMessageId.set(result.messageId, jobId)

    return cloneJob(next)
  }

  async createIfAbsent(input: NotificationJobInput, now: number): Promise<CreateNotificationJobResult> {
    validateNotificationJobInput(input)

    const jobId = notificationJobId(input.idempotencyKey)
    const existing = this.jobs.get(jobId)
    if (existing)
      return { job: cloneJob(existing), created: false }

    const job = synchronizeNotificationRecovery({
      ...input,
      jobId,
      status: 'queued',
      attemptNumber: 0,
      createdAt: now,
      updatedAt: now,
      lock: null,
    })

    this.jobs.set(job.jobId, job)

    return { job: cloneJob(job), created: true }
  }

  async getById(jobId: string): Promise<NotificationJob | null> {
    const job = this.jobs.get(jobId)

    return job ? cloneJob(job) : null
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<NotificationJob | null> {
    return this.getById(notificationJobId(idempotencyKey))
  }

  async getByProviderMessageId(providerMessageId: string): Promise<NotificationJob | null> {
    const jobId = this.jobsByProviderMessageId.get(providerMessageId)

    return jobId ? this.getById(jobId) : null
  }

  async setProviderMessageId(jobId: string, providerMessageId: string, now: number): Promise<NotificationJob> {
    if (!providerMessageId.trim() || !Number.isFinite(now))
      throw new Error('Invalid provider message id')

    const job = this.jobs.get(jobId)
    if (!job)
      throw new Error('Notification job not found')

    const existingJobId = this.jobsByProviderMessageId.get(providerMessageId)
    if (existingJobId && existingJobId !== jobId)
      throw new Error('Provider message id is already assigned')

    if (job.providerMessageId && job.providerMessageId !== providerMessageId)
      throw new Error('Notification job already has a provider message id')

    job.providerMessageId = providerMessageId
    job.updatedAt = now
    this.jobs.set(jobId, synchronizeNotificationRecovery(job))
    this.jobsByProviderMessageId.set(providerMessageId, jobId)

    return cloneJob(this.jobs.get(jobId)!)
  }

  async acquireLease(jobId: string, workerId: string, now: number, leaseMs: number, expected?: NotificationLeaseSnapshot): Promise<NotificationJob | null> {
    if (!workerId.trim() || !Number.isFinite(now) || !Number.isFinite(leaseMs) || leaseMs <= 0)
      throw new Error('Invalid notification lease')

    const job = this.jobs.get(jobId)
    if (!job)
      return null

    if (expected && (job.status !== expected.status || job.attemptNumber !== expected.attemptNumber || job.updatedAt !== expected.updatedAt))
      return null

    const hasActiveLease = job.lock && job.lock.leaseUntil > now
    if (hasActiveLease && job.lock?.workerId !== workerId)
      return null

    if (job.status !== 'queued' && job.status !== 'retryable-failed' && job.status !== 'processing')
      return null

    if (job.status !== 'processing') {
      job.status = 'processing'
      job.attemptNumber += 1
    }
    job.lock = { workerId, leaseUntil: now + leaseMs }
    job.updatedAt = now
    this.jobs.set(jobId, synchronizeNotificationRecovery(job))

    return cloneJob(this.jobs.get(jobId)!)
  }

  async transition(jobId: string, status: NotificationStatus, now: number): Promise<NotificationJob> {
    if (!Number.isFinite(now))
      throw new Error('Invalid notification timestamp')

    const job = this.jobs.get(jobId)
    if (!job)
      throw new Error('Notification job not found')

    if (!canTransitionNotificationStatus(job.status, status))
      throw new Error(`Invalid notification status transition: ${job.status} -> ${status}`)

    if (job.status !== status) {
      job.status = status
      job.updatedAt = now
      if (status !== 'processing')
        job.lock = null
      if (status === 'processing')
        job.attemptNumber += 1
    }

    this.jobs.set(jobId, synchronizeNotificationRecovery(job))

    return cloneJob(this.jobs.get(jobId)!)
  }
}

export function validateNotificationJobInput(input: NotificationJobInput): void {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 256)
    throw new Error('Invalid notification idempotency key')
  if (!input.athleteId.trim() || input.athleteId.length > 128)
    throw new Error('Invalid notification athlete id')
  if (!input.reference?.trim() && input.type === 'payment-receipt')
    throw new Error('Payment notification reference is required')
}

function canonicalNotificationIdempotencyKey(idempotencyKey: string): string {
  const match = /^(?:membership|combined):([^:]+):([^:]+):([^:]+)$/.exec(idempotencyKey)

  return match ? `payment:${match[1]}:${match[2]}:${match[3]}` : idempotencyKey
}

function cloneJob(job: NotificationJob): NotificationJob {
  return structuredClone(job)
}
