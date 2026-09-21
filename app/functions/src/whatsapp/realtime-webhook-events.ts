import { createHash } from 'node:crypto'
import { getNotificationDatabase } from '../notifications/realtime-job-store.js'
import type { WebhookEventStore } from './webhook.js'

const eventsPath = 'v1/notificationWebhookEvents'
export const webhookEventRetentionMs = 30 * 24 * 60 * 60_000

export class RealtimeWebhookEventStore implements WebhookEventStore {
  private readonly database = getNotificationDatabase()

  async isProcessed(eventId: string): Promise<boolean> {
    const eventKey = createHash('sha256').update(eventId).digest('hex')

    return (await this.database.ref(`${eventsPath}/${eventKey}`).get()).exists()
  }

  async markProcessed(eventId: string, receivedAt: number): Promise<boolean> {
    if (!eventId.trim() || !Number.isSafeInteger(receivedAt) || receivedAt < 0)
      throw new Error('Invalid webhook event')
    const expiresAt = receivedAt + webhookEventRetentionMs
    if (!Number.isSafeInteger(expiresAt))
      throw new Error('Invalid webhook event')

    const eventKey = createHash('sha256').update(eventId).digest('hex')
    let claimed = false

    const result = await this.database.ref(`${eventsPath}/${eventKey}`).transaction(current => {
      claimed = !current

      return current ?? { receivedAt, expiresAt }
    })

    return claimed && result.committed
  }

  async cleanup(now: number): Promise<number> {
    if (!Number.isSafeInteger(now) || now < 0)
      throw new Error('Invalid cleanup time')

    const root = this.database.ref(eventsPath)
    const snapshot = await root.orderByChild('expiresAt').startAt(0).endAt(now).limitToFirst(50).get()
    const keys: string[] = []

    snapshot.forEach(child => { if (/^[a-f0-9]{64}$/.test(child.key!)) keys.push(child.key!)

      return false })
    let removed = 0
    for (const key of keys) {
      const result = await root.child(key).transaction(current => {
        if (current === null)
          return null
        if (!Number.isSafeInteger(current.receivedAt) || !Number.isSafeInteger(current.expiresAt)
          || current.expiresAt !== current.receivedAt + webhookEventRetentionMs)
          return undefined

        return current.expiresAt <= now ? null : undefined
      })

      if (result.committed && !result.snapshot.exists())
        removed++
    }

    return removed
  }
}
