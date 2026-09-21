import { getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { finishDeliveryState, startDispatchState } from './delivery-state.js'
import type { DeliveryAudit, DeliveryResult, DispatchMetadata } from './delivery-state.js'
import type {
  NotificationJob,
  NotificationJobInput,
  NotificationJobStore,
  NotificationLeaseSnapshot,
  NotificationStatus,
} from './jobs.js'
import {
  canTransitionNotificationStatus,
  decideProviderStatus,
  notificationJobId,
  notificationRecoveryAt,
  synchronizeNotificationRecovery,
  validateNotificationJobInput,
} from './jobs.js'

const jobsPath = 'v1/notificationJobs'
const notificationAppName = 'kronos-notification-runtime'

const notificationStatuses = new Set<NotificationStatus>([
  'queued',
  'processing',
  'accepted',
  'sent',
  'delivered',
  'read',
  'retryable-failed',
  'terminal-failed',
  'suppressed',
  'unknown',
])

export class RealtimeDatabaseNotificationJobStore implements NotificationJobStore {
  private readonly database = getNotificationDatabase()

  async confirmProviderStatus(jobId: string, providerMessageId: string, status: NotificationStatus, now: number): Promise<boolean> {
    let completed = false
    decideProviderStatus(null, providerMessageId, status, now)

    const result = await this.database.ref(jobPath(jobId)).transaction(current => {
      try {
        const job = parseJobOrNull(current)
        const decision = decideProviderStatus(job, providerMessageId, status, now)

        completed = decision.completed

        // Confirm even no-ops against the server, not an optimistic local cache.
        return decision.job === job ? current : toStoredJob(decision.job!)
      } catch {
        return undefined
      }
    })

    if (!result.committed)
      throw new Error('Invalid persisted notification job')

    return completed
  }

  async startDispatch(jobId: string, workerId: string, now: number, metadata: DispatchMetadata): Promise<boolean> {
    const result = await this.database.ref(jobPath(jobId)).transaction(current => {
      const job = parseJobOrNull(current)

      // RTDB may invoke a transaction first with an empty local cache. Returning
      // null lets it retry against server data; undefined would abort too early.
      if (!job)
        return current
      const next = startDispatchState(job, workerId, now, metadata)

      return next ? toStoredJob(next) : undefined
    })

    return result.committed && result.snapshot.exists()
  }

  async finishDelivery(jobId: string, workerId: string, now: number, result: DeliveryResult): Promise<NotificationJob> {
    const transaction = await this.database.ref(jobPath(jobId)).transaction(current => {
      const job = parseJobOrNull(current)
      if (!job)
        return current

      return toStoredJob(finishDeliveryState(job, workerId, now, result))
    })

    if (!transaction.committed)
      throw new Error('Notification job not found')

    return parseJob(transaction.snapshot.val())
  }

  async createIfAbsent(input: NotificationJobInput, now: number) {
    validateNotificationJobInput(input)
    if (!Number.isFinite(now))
      throw new Error('Invalid notification timestamp')

    const job: NotificationJob = {
      ...input,
      jobId: notificationJobId(input.idempotencyKey),
      status: 'queued',
      attemptNumber: 0,
      createdAt: now,
      updatedAt: now,
      lock: null,
    }

    let created = false

    const result = await this.database.ref(jobPath(job.jobId)).transaction(current => {
      created = !current

      return current ?? toStoredJob(job)
    })

    const parsed = parseJob(result.snapshot.val())

    return { job: parsed, created }
  }

  async listDueRecoveryJobIds(now: number, limit = 25): Promise<string[]> {
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isInteger(limit) || limit < 1 || limit > 25)
      throw new Error('Invalid notification recovery query')

    const snapshot = await this.database.ref(jobsPath)
      .orderByChild('recoveryAt')
      .startAt(0)
      .endAt(now)
      .limitToFirst(limit)
      .get()

    const jobIds: string[] = []

    snapshot.forEach(child => {
      const job = parseJob(child.val())
      if (child.key !== job.jobId)
        throw new Error('Invalid persisted notification job')
      jobIds.push(job.jobId)

      return false
    })

    return jobIds
  }

  async getById(jobId: string): Promise<NotificationJob | null> {
    const snapshot = await this.database.ref(jobPath(jobId)).get()

    return snapshot.exists() ? parseJob(snapshot.val()) : null
  }

  getByIdempotencyKey(idempotencyKey: string): Promise<NotificationJob | null> {
    return this.getById(notificationJobId(idempotencyKey))
  }

  async getByProviderMessageId(providerMessageId: string): Promise<NotificationJob | null> {
    if (!providerMessageId.trim())
      return null

    const snapshot = await this.database.ref(jobsPath)
      .orderByChild('providerMessageId')
      .equalTo(providerMessageId)
      .get()

    if (!snapshot.exists())
      return null

    const values = snapshot.val()
    if (!isRecord(values))
      return null
    const firstJob = Object.values(values)[0]

    return firstJob ? parseJob(firstJob) : null
  }

  async setProviderMessageId(jobId: string, providerMessageId: string, now: number): Promise<NotificationJob> {
    if (!providerMessageId.trim() || !Number.isFinite(now))
      throw new Error('Invalid provider message id')

    const result = await this.database.ref(jobPath(jobId)).transaction(current => {
      const job = parseJobOrNull(current)
      if (!job)
        return current
      if (job.providerMessageId && job.providerMessageId !== providerMessageId)
        return undefined

      return toStoredJob({
        ...job,
        providerMessageId,
        updatedAt: now,
      })
    })

    const job = parseJob(result.snapshot.val())
    if (job.providerMessageId !== providerMessageId)
      throw new Error('Notification job already has a provider message id')

    return job
  }

  async acquireLease(jobId: string, workerId: string, now: number, leaseMs: number, expected?: NotificationLeaseSnapshot): Promise<NotificationJob | null> {
    if (!workerId.trim() || !Number.isFinite(now) || !Number.isFinite(leaseMs) || leaseMs <= 0)
      throw new Error('Invalid notification lease')

    const result = await this.database.ref(jobPath(jobId)).transaction(current => {
      const job = parseJobOrNull(current)
      if (!job)
        return current

      // The retry decision must still describe the state being locked. Otherwise
      // an overlapping rejection could be retried before its new backoff expires.
      if (expected && (job.status !== expected.status || job.attemptNumber !== expected.attemptNumber || job.updatedAt !== expected.updatedAt))
        return undefined

      const hasActiveLease = job.lock && job.lock.leaseUntil > now
      if (hasActiveLease && job.lock?.workerId !== workerId)
        return toStoredJob(job)
      if (job.status !== 'queued' && job.status !== 'retryable-failed' && job.status !== 'processing')
        return toStoredJob(job)

      const next: NotificationJob = {
        ...job,
        status: 'processing',
        attemptNumber: job.status === 'processing' ? job.attemptNumber : job.attemptNumber + 1,
        updatedAt: now,
        lock: { workerId, leaseUntil: now + leaseMs },
      }


      return toStoredJob(next)
    })

    if (!result.committed)
      return null
    const job = parseJobOrNull(result.snapshot.val())
    if (!job || job.status !== 'processing' || job.lock?.workerId !== workerId)
      return null

    return job
  }

  async transition(jobId: string, status: NotificationStatus, now: number): Promise<NotificationJob> {
    if (!notificationStatuses.has(status) || !Number.isFinite(now))
      throw new Error('Invalid notification transition')

    const result = await this.database.ref(jobPath(jobId)).transaction(current => {
      const job = parseJobOrNull(current)
      if (!job)
        return current
      if (!canTransitionNotificationStatus(job.status, status))
        return undefined
      if (job.status === status)
        return toStoredJob(job)

      return toStoredJob({
        ...job,
        status,
        attemptNumber: status === 'processing' ? job.attemptNumber + 1 : job.attemptNumber,
        updatedAt: now,
        lock: status === 'processing' ? job.lock : null,
      })
    })

    const job = parseJob(result.snapshot.val())
    if (job.status !== status)
      throw new Error(`Invalid notification status transition to ${status}`)

    return job
  }
}

export function getNotificationDatabase() {
  const app = getApps().find(candidate => candidate.name === notificationAppName) ?? initializeNotificationApp()

  return getDatabase(app)
}

function initializeNotificationApp() {
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT
  const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST

  const databaseURL = projectId && emulatorHost
    ? `http://${emulatorHost}?ns=${encodeURIComponent(`${projectId}-default-rtdb`)}`
    : undefined

  return initializeApp({
    ...(projectId ? { projectId } : {}),
    ...(databaseURL ? { databaseURL } : {}),
  }, notificationAppName)
}

function jobPath(jobId: string): string {
  return `${jobsPath}/${jobId}`
}

function toStoredJob(job: NotificationJob): Record<string, unknown> {
  const canonical = synchronizeNotificationRecovery(job)

  return {
    jobId: canonical.jobId,
    idempotencyKey: canonical.idempotencyKey,
    type: canonical.type,
    athleteId: canonical.athleteId,
    ...(canonical.reference ? { reference: canonical.reference } : {}),
    ...(canonical.providerMessageId ? { providerMessageId: canonical.providerMessageId } : {}),
    status: canonical.status,
    attemptNumber: canonical.attemptNumber,
    createdAt: canonical.createdAt,
    updatedAt: canonical.updatedAt,
    ...(canonical.recoveryAt !== undefined ? { recoveryAt: canonical.recoveryAt } : {}),
    lock: canonical.lock,
    ...(canonical.delivery ? { delivery: canonical.delivery } : {}),
  }
}

function parseJobOrNull(value: unknown): NotificationJob | null {
  if (value === null || value === undefined)
    return null

  return parseJob(value)
}

function parseJob(value: unknown): NotificationJob {
  if (!isRecord(value))
    throw new Error('Invalid notification job record')

  const status = value.status
  if (typeof value.jobId !== 'string'
    || typeof value.idempotencyKey !== 'string'
    || (value.type !== 'payment-receipt' && value.type !== 'payment-reminder')
    || typeof value.athleteId !== 'string'
    || !notificationStatuses.has(status as NotificationStatus)
    || !Number.isInteger(value.attemptNumber)
    || !Number.isFinite(value.createdAt)
    || !Number.isFinite(value.updatedAt)) {
    throw new Error('Invalid notification job record')
  }

  const lock = value.lock === null || value.lock === undefined
    ? null
    : isRecord(value.lock)
      && typeof value.lock.workerId === 'string'
      && Number.isFinite(value.lock.leaseUntil)
      ? { workerId: value.lock.workerId, leaseUntil: value.lock.leaseUntil }
      : null

  const job: NotificationJob = {
    jobId: value.jobId,
    idempotencyKey: value.idempotencyKey,
    type: value.type,
    athleteId: value.athleteId,
    ...(typeof value.reference === 'string' ? { reference: value.reference } : {}),
    ...(typeof value.providerMessageId === 'string' ? { providerMessageId: value.providerMessageId } : {}),
    status: status as NotificationStatus,
    attemptNumber: value.attemptNumber,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    lock,
    ...(isRecord(value.delivery) && isRecord(value.delivery.attempts)
      ? { delivery: value.delivery as unknown as DeliveryAudit } : {}),
  }

  const expectedRecoveryAt = notificationRecoveryAt(job)
  const storedRecoveryAt = value.recoveryAt
  if (storedRecoveryAt !== undefined
    && (!Number.isSafeInteger(storedRecoveryAt) || storedRecoveryAt < 0))
    throw new Error('Invalid notification job record')
  if (storedRecoveryAt !== (expectedRecoveryAt ?? undefined))
    throw new Error('Invalid notification job recovery time')

  return expectedRecoveryAt === null ? job : { ...job, recoveryAt: expectedRecoveryAt }
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
