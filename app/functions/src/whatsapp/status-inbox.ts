import { createHash } from 'node:crypto'
import { isRetryableProviderError, type ProviderWebhookStatus } from './webhook.js'

export const statusInboxRetentionMs = 30 * 86400 * 1000
export interface StatusInboxConfig { accountId: string; phoneNumberId: string }
export interface StatusInboxRecord {
  providerMessageId: string
  messageKey: string
  providerStatus: ProviderWebhookStatus
  retryable: boolean
  eventAt: number
  receivedAt: number
  expiresAt: number
  processingStatus: 'pending' | 'completed'
}
export interface StatusInboxEvent { eventKey: string; record: StatusInboxRecord }
export type StatusInboxParseResult = { status: 'invalid' | 'no-statuses' } | { status: 'valid'; events: StatusInboxEvent[] }

export const inboxHash = (...parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
export const inboxScope = (config: StatusInboxConfig) => inboxHash(config.accountId, config.phoneNumberId)
export const validProviderMessageId = (id: unknown): id is string => typeof id === 'string' && /^wamid[.-][\w+/=.-]{1,500}$/.test(id)

// This parser only receives the JSON decoded from authenticated original bytes.
export function parseStatusInbox(payload: unknown, config: StatusInboxConfig, receivedAt: number, bodyBytes: number): StatusInboxParseResult {
  const root = objectRecord(payload)
  const invalid = { status: 'invalid' as const }
  if (root?.object !== 'whatsapp_business_account' || !Array.isArray(root.entry) || root.entry.length > 100
    || !Number.isSafeInteger(receivedAt) || receivedAt < 0 || !Number.isSafeInteger(receivedAt + statusInboxRetentionMs)
    || !Number.isSafeInteger(bodyBytes) || bodyBytes < 0 || bodyBytes > 65536)
    return invalid
  const events: StatusInboxEvent[] = []
  const classifications = new Map<string, boolean>()
  const scope = inboxScope(config)
  let changesCount = 0
  let statusCount = 0
  let messageCount = 0
  let hasStatuses = false
  for (const rawEntry of root.entry) {
    const entry = objectRecord(rawEntry)
    if (entry?.id !== config.accountId || !Array.isArray(entry.changes))
      return invalid
    changesCount += entry.changes.length
    if (changesCount > 100)
      return invalid
    for (const rawChange of entry.changes) {
      const change = objectRecord(rawChange)
      const value = objectRecord(change?.value)
      if (change?.field !== 'messages' || !value || objectRecord(value.metadata)?.phone_number_id !== config.phoneNumberId)
        return invalid
      if (Object.hasOwn(value, 'messages')) {
        if (!Array.isArray(value.messages))
          return invalid
        messageCount += value.messages.length
        if (messageCount > 100)
          return invalid
      }
      if (!Object.hasOwn(value, 'statuses'))
        continue
      hasStatuses = true
      if (!Array.isArray(value.statuses))
        return invalid
      statusCount += value.statuses.length
      if (statusCount > 100)
        return invalid
      for (const rawStatus of value.statuses) {
        const item = objectRecord(rawStatus)
        if (!validProviderMessageId(item?.id) || typeof item?.status !== 'string' || !['sent', 'delivered', 'read', 'failed'].includes(item.status)
          || typeof item?.timestamp !== 'string' || !/^\d{1,13}$/.test(item.timestamp))
          return invalid
        const eventAt = Number(item.timestamp) * 1000
        if (!Number.isSafeInteger(eventAt) || eventAt > receivedAt)
          return invalid
        if (receivedAt - eventAt >= statusInboxRetentionMs)
          continue
        const providerStatus = item.status as ProviderWebhookStatus
        const eventKey = inboxHash(scope, item.id, providerStatus, eventAt)
        const retryable = providerStatus === 'failed' && isRetryableProviderError(item.errors)
        if (classifications.has(eventKey)) {
          if (classifications.get(eventKey) !== retryable)
            return invalid
          continue
        }
        classifications.set(eventKey, retryable)

        events.push({
          eventKey,
          record: {
            providerMessageId: item.id, messageKey: inboxHash(scope, item.id), providerStatus,
            retryable,
            eventAt, receivedAt, expiresAt: eventAt + statusInboxRetentionMs, processingStatus: 'pending',
          },
        })
      }
    }
  }

  return hasStatuses ? { status: 'valid', events } : { status: 'no-statuses' }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
