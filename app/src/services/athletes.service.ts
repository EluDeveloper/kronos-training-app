import type { Athlete } from '@/types/domain'
import { createEntity, subscribeCollection, updateEntity, type ErrorHandler } from './realtime.service'

export type NewAthlete = Omit<Athlete, 'id' | 'createdAt' | 'updatedAt'>

export const athletesService = {
  subscribe: (onChange: (items: Athlete[]) => void, onError: ErrorHandler) => subscribeCollection<Athlete>('athletes', onChange, onError),
  create: (athlete: NewAthlete) => createEntity('athletes', athlete as unknown as Record<string, unknown>),
  update: (id: string, athlete: Partial<NewAthlete>) => updateEntity(`athletes/${id}`, athlete as Record<string, unknown>),
  setStatus(id: string, status: Athlete['status'], inactiveReason?: string) {
    return updateEntity(`athletes/${id}`, {
      status,
      inactiveAt: status === 'inactive' ? new Date().toISOString().slice(0, 10) : null,
      inactiveReason: status === 'inactive' ? inactiveReason ?? null : null,
    })
  },
}
