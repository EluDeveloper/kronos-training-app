import { get, push, ref, update, type Unsubscribe } from 'firebase/database'
import type { BirthdayGreeting, BirthdayGreetingStatus } from '@/types/domain'
import { businessPath, requireDatabase, subscribeCollection, type ErrorHandler } from './realtime.service'

export const birthdayGreetingsService = {
  subscribe: (onChange: (items: BirthdayGreeting[]) => void, onError: ErrorHandler): Unsubscribe => subscribeCollection<BirthdayGreeting>('birthdayGreetings', onChange, onError),

  async setStatus(athleteId: string, year: number, toStatus: BirthdayGreetingStatus, actorUid: string) {
    const database = requireDatabase()
    const id = `${athleteId}_${year}`
    const greetingSnapshot = await get(ref(database, businessPath(`birthdayGreetings/${id}`)))
    const existing = greetingSnapshot.exists() ? greetingSnapshot.val() as BirthdayGreeting : null
    const eventId = push(ref(database, businessPath(`birthdayGreetingEvents/${id}`))).key
    if (!eventId)
      throw new Error('No fue posible generar el evento de felicitación.')
    const now = Date.now()

    const updates: Record<string, unknown> = {
      [`birthdayGreetings/${id}/id`]: id,
      [`birthdayGreetings/${id}/athleteId`]: athleteId,
      [`birthdayGreetings/${id}/year`]: year,
      [`birthdayGreetings/${id}/status`]: toStatus,
      [`birthdayGreetings/${id}/greetedAt`]: toStatus === 'greeted' ? now : null,
      [`birthdayGreetings/${id}/greetedBy`]: toStatus === 'greeted' ? actorUid : null,
      [`birthdayGreetings/${id}/lastEventId`]: eventId,
      [`birthdayGreetings/${id}/createdAt`]: existing?.createdAt ?? now,
      [`birthdayGreetings/${id}/updatedAt`]: now,
      [`birthdayGreetingEvents/${id}/${eventId}`]: {
        id: eventId, greetingId: id, athleteId, year, fromStatus: existing?.status ?? null, toStatus, createdBy: actorUid, createdAt: now,
      },
    }

    await update(ref(database, businessPath('')), updates)
  },

  async recordCardAction(athleteId: string, year: number, action: 'downloadedAt' | 'sharedAt', actorUid: string, cardVersion: string) {
    const database = requireDatabase()
    const id = `${athleteId}_${year}`
    const now = Date.now()
    const greetingRef = ref(database, businessPath(`birthdayGreetings/${id}`))
    const snapshot = await get(greetingRef)
    const existing = snapshot.exists() ? snapshot.val() as BirthdayGreeting : null

    await update(greetingRef, {
      id, athleteId, year, status: existing?.status ?? 'pending', lastEventId: existing?.lastEventId ?? `card-${actorUid}`,
      cardVersion, [action]: now, createdAt: existing?.createdAt ?? now, updatedAt: now,
    })
  },
}
