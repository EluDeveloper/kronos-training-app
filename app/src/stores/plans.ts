import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { plansService, type NewPlan, type NewPlanPromotion } from '@/services/plans.service'
import type { MembershipPlan, PlanPromotion } from '@/types/domain'

export const usePlansStore = defineStore('plans', () => {
  const items = ref<MembershipPlan[]>([])
  const promotions = ref<PlanPromotion[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null
  let promotionStop: Unsubscribe | null = null

  const active = computed(() => items.value.filter(item => item.status === 'active'))

  function subscribe() {
    if (stop)
      return
    loading.value = true
    stop = plansService.subscribe(value => {
      items.value = value
      loading.value = false
    }, subscriptionError => {
      error.value = subscriptionError.message
      loading.value = false
    })
    promotionStop = plansService.subscribePromotions(value => { promotions.value = value.sort((a, b) => b.validFrom.localeCompare(a.validFrom)) }, subscriptionError => { error.value = subscriptionError.message })
  }

  const create = (plan: NewPlan) => plansService.create(plan)
  const update = (id: string, plan: Partial<NewPlan>) => plansService.update(id, plan)
  const createPromotion = (promotion: NewPlanPromotion) => plansService.createPromotion(promotion)
  const updatePromotion = (id: string, promotion: Partial<NewPlanPromotion>) => plansService.updatePromotion(id, promotion)
  const dispose = () => { stop?.(); promotionStop?.(); stop = null; promotionStop = null }

  return { items, active, promotions, loading, error, subscribe, create, update, createPromotion, updatePromotion, dispose }
})
