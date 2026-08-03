import type { Skill } from '@/types/domain'
import { createEntity, subscribeCollection, updateEntity, type ErrorHandler } from './realtime.service'

export const skillsService = {
  subscribe: (onChange: (items: Skill[]) => void, onError: ErrorHandler) => subscribeCollection<Skill>('skills', onChange, onError),
  create: (name: string) => createEntity('skills', { name, status: 'active' }),
  update: (id: string, data: Partial<Omit<Skill, 'id'>>) => updateEntity(`skills/${id}`, data as Record<string, unknown>),
}
