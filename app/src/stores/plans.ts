import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { plansService, type NewPlan } from '@/services/plans.service'
import type { MembershipPlan } from '@/types/domain'

export const usePlansStore = defineStore('plans', () => {
  const items = ref<MembershipPlan[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

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
  }

  const create = (plan: NewPlan) => plansService.create(plan)
  const update = (id: string, plan: Partial<NewPlan>) => plansService.update(id, plan)
  const dispose = () => { stop?.(); stop = null }

  return { items, active, loading, error, subscribe, create, update, dispose }
})
