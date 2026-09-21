import { getNotificationDatabase, RealtimeDatabaseNotificationJobStore } from '../notifications/realtime-job-store.js'
import { getLocalStatusInboxConfig } from './local-status-inbox-config.js'
import { inboxHash, inboxScope, statusInboxRetentionMs, validProviderMessageId, type StatusInboxEvent, type StatusInboxRecord } from './status-inbox.js'
import { isValidWebhookConfig, type WhatsAppWebhookConfig } from './webhook-runtime.js'

export class RealtimeStatusInbox {
  constructor(
    private readonly database = getNotificationDatabase,
    private readonly config?: WhatsAppWebhookConfig,
  ) {}

  async reconcile(eventKey: string, now = Date.now()): Promise<'pending' | 'completed' | 'expired' | 'missing'> {
    const scope = this.resolveScope()

    assertTime(now)
    if (!/^[a-f0-9]{64}$/.test(eventKey))
      throw new Error('Invalid inbox key')
    const database = this.database()
    const ref = database.ref(inboxPath(scope)).child(eventKey)

    // Reading a completed marker from the optimistic cache is not confirmation.
    const confirmed = await ref.transaction(current => current)
    if (!confirmed.committed)
      throw new Error('Inbox read confirmation failed')
    if (!confirmed.snapshot.exists())
      return 'missing'
    const record: StatusInboxRecord = confirmed.snapshot.val()

    assertEvent({ eventKey, record }, scope)
    if (record.expiresAt <= now)
      return 'expired'
    if (record.processingStatus === 'completed')
      return 'completed'

    const matches = await database.ref('v1/notificationJobs').orderByChild('providerMessageId')
      .equalTo(record.providerMessageId).limitToFirst(2).get()

    if (matches.numChildren() !== 1)
      return 'pending'
    let jobId = ''
    matches.forEach(child => { jobId = child.key!

      return false })

    const status = record.providerStatus === 'failed'
      ? record.retryable ? 'retryable-failed' : 'terminal-failed' : record.providerStatus

    const applied = await new RealtimeDatabaseNotificationJobStore().confirmProviderStatus(jobId, record.providerMessageId, status, now)
    if (!applied)
      return 'pending'

    const result = await ref.transaction(current => {
      if (current === null)
        return null
      if (!matchesStoredEvent(current, { eventKey, record }, scope))
        return undefined

      return current.processingStatus === 'completed' ? current : { ...current, processingStatus: 'completed' }
    })

    if (!result.committed)
      throw new Error('Inbox completion failed')

    return result.snapshot.exists() ? 'completed' : 'missing'
  }

  async enqueue(event: StatusInboxEvent, now = Date.now()): Promise<'stored' | 'expired'> {
    const scope = this.resolveScope()

    assertTime(now)
    assertEvent(event, scope)
    if (event.record.receivedAt > now)
      throw new Error('Invalid inbox time')
    if (event.record.expiresAt <= now)
      return 'expired'
    const ref = this.database().ref(inboxPath(scope)).child(event.eventKey)

    const result = await ref.transaction(current => {
      if (current === null)
        return event.record
      if (!matchesStoredEvent(current, event, scope))
        return undefined

      return current
    })

    if (!result.committed)
      throw new Error('Conflict in inbox event')

    return 'stored'
  }

  async page(input: { afterKey?: string; messageId?: string } = {}) {
    const scope = this.resolveScope()
    if ((input.afterKey && !/^[a-f0-9]{64}$/.test(input.afterKey))
      || (input.messageId !== undefined && !validProviderMessageId(input.messageId)))
      throw new Error('Invalid inbox cursor')
    const root = this.database().ref(inboxPath(scope))
    const messageKey = input.messageId ? inboxHash(scope, input.messageId) : null
    let query = messageKey ? root.orderByChild('messageKey').endAt(messageKey) : root.orderByKey()
    query = input.afterKey ? (messageKey ? query.startAfter(messageKey, input.afterKey) : query.startAfter(input.afterKey))
      : messageKey ? query.startAt(messageKey) : query

    const snapshot = await query.limitToFirst(25).get()
    const events: StatusInboxEvent[] = []

    snapshot.forEach(child => {
      const event = { eventKey: child.key!, record: child.val() }

      assertEvent(event, scope)
      events.push(event)

      return false
    })

    return { events, nextCursor: events.length === 25 ? events.at(-1)!.eventKey : null }
  }

  async cleanup(now: number): Promise<number> {
    const scope = this.resolveScope()

    assertTime(now)

    const root = this.database().ref(inboxPath(scope))
    const snapshot = await root.orderByChild('expiresAt').startAt(0).endAt(now).limitToFirst(50).get()
    const keys: string[] = []

    snapshot.forEach(child => { if (/^[a-f0-9]{64}$/.test(child.key!)) keys.push(child.key!)

      return false })
    let removed = 0
    for (const key of keys) {
      const result = await root.child(key).transaction(current =>
        current === null || (Number.isSafeInteger(current.expiresAt) && current.expiresAt >= 0 && current.expiresAt <= now)
          ? null : undefined)

      if (result.committed && !result.snapshot.exists())
        removed++
    }

    return removed
  }

  private resolveScope(): string {
    const config = this.config ?? getLocalStatusInboxConfig()
    if (!isValidWebhookConfig(config))
      throw new Error('Status inbox is disabled')

    return inboxScope(config)
  }
}

function inboxPath(scope: string) { return 'v1/notificationStatusInbox/' + scope }
function assertTime(now: number) {
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error('Invalid inbox time')
}
function sameEvent(a: StatusInboxRecord, b: StatusInboxRecord) {
  return a.providerMessageId === b.providerMessageId && a.messageKey === b.messageKey
    && a.providerStatus === b.providerStatus && a.retryable === b.retryable
    && a.eventAt === b.eventAt && a.expiresAt === b.expiresAt
}

// Firebase can invoke update callbacks asynchronously on conflicts. Abort here
// and reject after the transaction, rather than throwing outside its Promise.
function matchesStoredEvent(current: StatusInboxRecord, event: StatusInboxEvent, scope: string): boolean {
  try {
    assertEvent({ eventKey: event.eventKey, record: current }, scope)

    return sameEvent(current, event.record)
  } catch {
    return false
  }
}
function assertEvent(event: StatusInboxEvent, scope: string) {
  const record = event?.record
  if (!record || !validProviderMessageId(record.providerMessageId)
    || !['sent', 'delivered', 'read', 'failed'].includes(record.providerStatus)
    || typeof record.retryable !== 'boolean' || (record.providerStatus !== 'failed' && record.retryable)
    || !Number.isSafeInteger(record.eventAt) || record.eventAt < 0 || record.eventAt % 1000 !== 0
    || !Number.isSafeInteger(record.receivedAt) || record.receivedAt < record.eventAt
    || !Number.isSafeInteger(record.expiresAt) || record.expiresAt !== record.eventAt + statusInboxRetentionMs
    || record.receivedAt >= record.expiresAt || !['pending', 'completed'].includes(record.processingStatus)
    || record.messageKey !== inboxHash(scope, record.providerMessageId)
    || event.eventKey !== inboxHash(scope, record.providerMessageId, record.providerStatus, record.eventAt)
    || Object.keys(record).length !== 8)
    throw new Error('Invalid inbox event')
}
