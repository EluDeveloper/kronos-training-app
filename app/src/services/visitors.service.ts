import type { VisitorContact } from '@/types/domain'
import { createEntity, subscribeCollection, updateEntity, type ErrorHandler } from './realtime.service'

export type NewVisitorContact = Omit<VisitorContact, 'id' | 'createdAt' | 'updatedAt'>

export const visitorsService = {
  subscribe: (onChange: (items: VisitorContact[]) => void, onError: ErrorHandler) => subscribeCollection<VisitorContact>('visitors', onChange, onError),
  create: (visitor: NewVisitorContact) => createEntity('visitors', visitor as unknown as Record<string, unknown>),
  update: (id: string, visitor: Partial<NewVisitorContact>) => updateEntity(`visitors/${id}`, visitor as Record<string, unknown>),
}
