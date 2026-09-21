import { getNotificationDatabase } from '../notifications/realtime-job-store.js'
import { getLocalOptOutConfig, optOutRetentionMs, type LocalOptOutEvent } from './inbound-opt-out.js'
import { decideOptOut } from './opt-out-policy.js'
import { recognizeOptOutKeyword } from './opt-out.js'
import { isValidWebhookConfig, type WhatsAppWebhookConfig } from './webhook-runtime.js'

export type OptOutOutcome = 'applied' | 'ignored' | 'duplicate' | 'retry-required'
const eventPath = 'v1/notificationOptOutEvents'
const preferencePath = 'v1/notificationPreferences'

export class RealtimeOptOutStore {
  constructor(
    private readonly database = getNotificationDatabase,
    private readonly config?: WhatsAppWebhookConfig,
  ) {}

  async process(event: LocalOptOutEvent): Promise<OptOutOutcome> {
    this.assertEnabled()
    if (!/^[a-f0-9]{64}$/.test(event.eventKey) || !/^52\d{10}$/.test(event.senderPhone)
      || !Number.isSafeInteger(event.eventAt) || event.eventAt < 0 || event.eventAt % 1000 !== 0
      || !Number.isSafeInteger(event.receivedAt) || event.receivedAt < event.eventAt
      || !recognizeOptOutKeyword(event.keyword))
      throw new Error('Invalid local opt-out event')
    if (event.receivedAt - event.eventAt > optOutRetentionMs)
      return 'ignored'
    const database = this.database()
    const marker = database.ref(`${eventPath}/${event.eventKey}`)
    if ((await marker.get()).val()?.status === 'completed')
      return 'duplicate'
    const matches = await database.ref(preferencePath).orderByChild('consentedPhoneE164').equalTo(event.senderPhone).limitToFirst(51).get()
    if (matches.numChildren() > 50)
      return 'retry-required'

    const start = await marker.transaction(current => current ?? {
      status: 'pending', receivedAt: event.receivedAt, expiresAt: event.receivedAt + optOutRetentionMs,
    })

    const state = start.snapshot.val()
    if (state?.status === 'completed')
      return 'duplicate'
    if (state?.status !== 'pending' || !Number.isSafeInteger(state.receivedAt)
      || state.receivedAt < event.eventAt || state.expiresAt !== state.receivedAt + optOutRetentionMs)
      return 'retry-required'
    const originalEvent = { ...event, receivedAt: state.receivedAt }
    const ids: string[] = []

    matches.forEach(child => { ids.push(child.key!)

      return false })
    let changed = false
    let retryRequired = false
    for (const id of ids) {
      let decisionStatus: string = 'ignored'

      const confirmed = await database.ref(`${preferencePath}/${id}`).transaction(current => {
        const decision = decideOptOut(current, id, originalEvent)

        decisionStatus = decision.status

        // Even a no-op must be acknowledged by the server: the local cache can
        // contain another request's optimistic withdrawal which may still fail.
        return decision.status === 'update' ? decision.value : current
      })

      if (!confirmed.committed)
        return 'retry-required'
      changed ||= decisionStatus === 'update'
      retryRequired ||= decisionStatus === 'retry-required'
    }
    if (retryRequired)
      return 'retry-required'
    await marker.transaction(current => current === null ? null : current.status === 'pending' ? { ...current, status: 'completed' } : undefined)

    return changed ? 'applied' : 'ignored'
  }

  // Explicit local maintenance, not a production TTL or scheduler. At most 50 markers/run.
  async cleanup(now: number): Promise<number> {
    this.assertEnabled()
    if (!Number.isSafeInteger(now) || now < 0)
      throw new Error('Invalid cleanup time')
    const root = this.database().ref(eventPath)
    const snapshot = await root.orderByChild('expiresAt').startAt(0).endAt(now).limitToFirst(50).get()
    const keys: string[] = []

    snapshot.forEach(child => { if (/^[a-f0-9]{64}$/.test(child.key!)) keys.push(child.key!)

      return false })
    let removed = 0
    for (const key of keys) {
      const result = await root.child(key).transaction(current => {
        if (current === null)
          return null

        return Number.isSafeInteger(current.expiresAt) && current.expiresAt <= now ? null : undefined
      })

      if (result.committed && !result.snapshot.exists())
        removed++
    }

    return removed
  }

  private assertEnabled(): void {
    const config = this.config ?? getLocalOptOutConfig()
    if (!isValidWebhookConfig(config))
      throw new Error('Opt-out store is disabled')
  }
}
