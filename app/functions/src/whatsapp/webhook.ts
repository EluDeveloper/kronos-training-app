import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  canTransitionNotificationStatus,
  type NotificationJobStore,
} from '../notifications/jobs.js'

export type ProviderWebhookStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface ParsedMetaWebhookEvent {
  eventId: string
  providerMessageId: string
  status: ProviderWebhookStatus
  retryable: boolean
}

export interface WebhookEventStore {
  isProcessed(eventId: string): Promise<boolean>
  markProcessed(eventId: string, receivedAt: number): Promise<boolean>
}

type WebhookEventResult =
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: 'unknown-message' | 'stale-status' | 'status-unchanged' }
  | { status: 'applied'; jobStatus: 'sent' | 'delivered' | 'read' | 'retryable-failed' | 'terminal-failed' }

export type WebhookProcessingResult =
  | { status: 'invalid-payload' }
  | { status: 'processed'; results: WebhookEventResult[] }
  | WebhookEventResult

export function verifyMetaWebhookSignature(
  body: string | Uint8Array,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  const signature = signatureHeader?.trim() ?? ''
  if (!appSecret || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false

  const expectedDigest = createHmac('sha256', appSecret).update(body).digest()
  const actualDigest = Buffer.from(signature.slice('sha256='.length), 'hex')

  return actualDigest.length === expectedDigest.length && timingSafeEqual(actualDigest, expectedDigest)
}

export function validateWebhookChallenge(
  input: { mode?: unknown; verifyToken?: unknown; challenge?: unknown },
  expectedToken: string,
): string | null {
  if (input.mode !== 'subscribe' || typeof input.verifyToken !== 'string' || input.verifyToken !== expectedToken)
    return null
  if (typeof input.challenge !== 'string' || !input.challenge || input.challenge.length > 512 || /[\r\n]/.test(input.challenge))
    return null

  return input.challenge
}

export function parseMetaWebhookEvents(payload: unknown): ParsedMetaWebhookEvent[] {
  const parsed: ParsedMetaWebhookEvent[] = []
  const root = asRecord(payload)
  if (root?.object !== 'whatsapp_business_account')
    return parsed

  const entries = Array.isArray(root.entry) ? root.entry : []
  for (const entry of entries) {
    const entryRecord = asRecord(entry)
    const changes = Array.isArray(entryRecord?.changes) ? entryRecord.changes : []
    for (const change of changes) {
      const changeRecord = asRecord(change)
      if (changeRecord?.field !== 'messages')
        continue
      const value = asRecord(changeRecord.value)
      const statuses = Array.isArray(value?.statuses) ? value.statuses : []
      for (const status of statuses) {
        const statusRecord = asRecord(status)
        const providerMessageId = text(statusRecord?.id)
        const rawProviderStatus = text(statusRecord?.status)
        const providerStatus = rawProviderStatus?.toLocaleLowerCase('en-US') ?? null
        if (!providerMessageId || !isProviderWebhookStatus(providerStatus))
          continue
        const eventTimestamp = text(statusRecord?.timestamp)

        parsed.push({
          eventId: eventTimestamp
            ? `${providerMessageId}:${providerStatus}:${eventTimestamp}`
            : `${providerMessageId}:${providerStatus}`,
          providerMessageId,
          status: providerStatus,
          retryable: providerStatus === 'failed' && isRetryableProviderError(statusRecord?.errors),
        })
      }
    }
  }

  return parsed
}

export class InMemoryWebhookEventStore implements WebhookEventStore {
  private readonly eventIds = new Map<string, number>()

  async isProcessed(eventId: string): Promise<boolean> {
    return this.eventIds.has(eventId)
  }

  async markProcessed(eventId: string, receivedAt: number): Promise<boolean> {
    if (!eventId.trim() || !Number.isFinite(receivedAt))
      throw new Error('Invalid webhook event')
    if (this.eventIds.has(eventId))
      return false
    this.eventIds.set(eventId, receivedAt)

    return true
  }
}

export async function processMetaWebhookEvent(
  payload: unknown,
  events: WebhookEventStore,
  jobs: NotificationJobStore,
  receivedAt: number,
): Promise<WebhookProcessingResult> {
  if (!Number.isFinite(receivedAt))
    return { status: 'invalid-payload' }

  const parsed = parseMetaWebhookEvents(payload)
  if (!parsed.length)
    return { status: 'invalid-payload' }

  const results: WebhookEventResult[] = []
  for (const event of parsed)
    results.push(await processParsedEvent(event, events, jobs, receivedAt))

  return results.length === 1 ? results[0] : { status: 'processed', results }
}

async function processParsedEvent(
  event: ParsedMetaWebhookEvent,
  events: WebhookEventStore,
  jobs: NotificationJobStore,
  receivedAt: number,
): Promise<WebhookEventResult> {
  if (await events.isProcessed(event.eventId))
    return { status: 'duplicate' }

  const job = await jobs.getByProviderMessageId(event.providerMessageId)
  if (!job)
    return { status: 'ignored', reason: 'unknown-message' }

  const nextStatus = providerStatusToJobStatus(event.status, event.retryable)
  let result: WebhookEventResult
  if (job.status === nextStatus) {
    result = { status: 'ignored', reason: 'status-unchanged' }
  } else if (!canTransitionNotificationStatus(job.status, nextStatus)) {
    result = { status: 'ignored', reason: 'stale-status' }
  } else {
    try {
      await jobs.transition(job.jobId, nextStatus, receivedAt)
      result = { status: 'applied', jobStatus: nextStatus }
    } catch (error) {
      // A concurrent webhook may have advanced the job after our read.
      const latest = await jobs.getById(job.jobId)
      if (!latest || (latest.status !== nextStatus && canTransitionNotificationStatus(latest.status, nextStatus)))
        throw error
      result = { status: 'ignored', reason: latest.status === nextStatus ? 'status-unchanged' : 'stale-status' }
    }
  }

  // Persist deduplication only after the monotonic status write succeeds.
  // Replays after a crash are safe because repeating that write is a no-op.
  return await events.markProcessed(event.eventId, receivedAt) ? result : { status: 'duplicate' }
}

function providerStatusToJobStatus(status: ProviderWebhookStatus, retryable: boolean) {
  if (status === 'failed')
    return retryable ? 'retryable-failed' as const : 'terminal-failed' as const

  return status
}

function isProviderWebhookStatus(value: string | null): value is ProviderWebhookStatus {
  return value === 'sent' || value === 'delivered' || value === 'read' || value === 'failed'
}

export function isRetryableProviderError(value: unknown): boolean {
  const errors = Array.isArray(value) ? value : []

  return errors.some(error => {
    const record = asRecord(error)
    const code = text(record?.code)?.toLocaleLowerCase('en-US')

    return code === 'rate_limit' || code === 'rate_limited' || code === 'temporary' || code === 'service_unavailable'
  })
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
