import type { Athlete } from '@/types/domain'
import { get, push, ref, update } from 'firebase/database'
import { businessPath, createEntity, requireDatabase, subscribeCollection, updateEntity, type ErrorHandler } from './realtime.service'
import { buildAthleteTransition, type AthleteTransitionCommand } from '@/utils/athlete-lifecycle'

export type NewAthlete = Omit<Athlete, 'id' | 'createdAt' | 'updatedAt'>

export const athletesService = {
  subscribe: (onChange: (items: Athlete[]) => void, onError: ErrorHandler) => subscribeCollection<Athlete>('athletes', onChange, onError),
  create: (athlete: NewAthlete) => createEntity('athletes', athlete as unknown as Record<string, unknown>),
  update: (id: string, athlete: Partial<NewAthlete>) => updateEntity(`athletes/${id}`, athlete as Record<string, unknown>),
  async transitionStatus(id: string, command: Omit<AthleteTransitionCommand, 'id'>, actorUid: string) {
    const database = requireDatabase()
    const athleteSnapshot = await get(ref(database, businessPath(`athletes/${id}`)))
    if (!athleteSnapshot.exists())
      throw new Error('El atleta dejó de existir. Actualiza e intenta nuevamente.')

    const athlete = athleteSnapshot.val() as Athlete
    const eventId = push(ref(database, businessPath(`athletes/${id}/lifecycleEvents`))).key
    if (!eventId)
      throw new Error('No fue posible generar el evento de estado.')

    const transition = buildAthleteTransition(athlete.status, { ...command, id: eventId }, actorUid, Date.now(), id)

    const updates: Record<string, unknown> = {
      [`athletes/${id}/status`]: transition.patch.status,
      [`athletes/${id}/pausedAt`]: transition.patch.pausedAt,
      [`athletes/${id}/expectedReturnDate`]: transition.patch.expectedReturnDate,
      [`athletes/${id}/inactiveAt`]: transition.patch.inactiveAt,
      [`athletes/${id}/inactiveReason`]: transition.patch.inactiveReason,
      [`athletes/${id}/updatedAt`]: transition.patch.updatedAt,
      [`athletes/${id}/lastLifecycleEventId`]: eventId,
      [`athletes/${id}/lifecycleEvents/${eventId}`]: transition.event,
    }

    await update(ref(database, businessPath('')), updates)

    return transition
  },
}
