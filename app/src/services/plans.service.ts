import type { MembershipPlan } from '@/types/domain'
import { createEntity, subscribeCollection, updateEntity, type ErrorHandler } from './realtime.service'

export type NewPlan = Omit<MembershipPlan, 'id' | 'createdAt' | 'updatedAt'>

export const plansService = {
  subscribe: (onChange: (items: MembershipPlan[]) => void, onError: ErrorHandler) => subscribeCollection<MembershipPlan>('plans', onChange, onError),
  create: (plan: NewPlan) => createEntity('plans', plan as unknown as Record<string, unknown>),
  update: (id: string, plan: Partial<NewPlan>) => updateEntity(`plans/${id}`, plan as Record<string, unknown>),
}
