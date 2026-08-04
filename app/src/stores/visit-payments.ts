import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { visitPaymentsService, type NewVisitPayment } from '@/services/visit-payments.service'
import type { VisitPayment } from '@/types/domain'

export const useVisitPaymentsStore = defineStore('visit-payments', () => {
  const items = ref<VisitPayment[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  function subscribe() {
    if (stop)
      return
    loading.value = true
    stop = visitPaymentsService.subscribe(value => {
      items.value = value
      loading.value = false
    }, subscriptionError => {
      error.value = subscriptionError.message
      loading.value = false
    })
  }

  const create = (payment: NewVisitPayment) => visitPaymentsService.create(payment)
  const dispose = () => { stop?.(); stop = null }

  return { items, loading, error, subscribe, create, dispose }
})
