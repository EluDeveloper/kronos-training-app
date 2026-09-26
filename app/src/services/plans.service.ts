import type { MembershipPlan, PlanPromotion } from '@/types/domain'
import { createEntity, subscribeCollection, updateEntity, type ErrorHandler } from './realtime.service'
import { validatePlanPromotion } from '@/utils/plan-promotions'

export type NewPlan = Omit<MembershipPlan, 'id' | 'createdAt' | 'updatedAt'>
export type NewPlanPromotion = Omit<PlanPromotion, 'id' | 'createdAt' | 'updatedAt'>

export const plansService = {
  subscribe: (onChange: (items: MembershipPlan[]) => void, onError: ErrorHandler) => subscribeCollection<MembershipPlan>('plans', onChange, onError),
  create: (plan: NewPlan) => createEntity('plans', plan as unknown as Record<string, unknown>),
  update: (id: string, plan: Partial<NewPlan>) => updateEntity(`plans/${id}`, plan as Record<string, unknown>),
  subscribePromotions: (onChange: (items: PlanPromotion[]) => void, onError: ErrorHandler) => subscribeCollection<PlanPromotion>('planPromotions', onChange, onError),
  createPromotion: (promotion: NewPlanPromotion) => {
    validatePlanPromotion({ ...promotion, id: 'validation', createdAt: 0, updatedAt: 0 })

    return createEntity('planPromotions', promotion as unknown as Record<string, unknown>)
  },
  updatePromotion: (id: string, promotion: Partial<NewPlanPromotion>) => updateEntity(`planPromotions/${id}`, promotion as Record<string, unknown>),
}
