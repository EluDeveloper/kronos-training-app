import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { paymentsService, type ComplimentaryPeriodInput, type MembershipInstallmentInput } from '@/services/payments.service'
import type { Payment, Sale } from '@/types/domain'

export const usePaymentsStore = defineStore('payments', () => {
  const items = ref<Payment[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  const paid = computed(() => items.value.filter(item => item.status === 'paid'))

  function subscribe() {
    if (stop)
      return
    loading.value = true
    stop = paymentsService.subscribe(value => {
      items.value = value
      loading.value = false
    }, subscriptionError => {
      error.value = subscriptionError.message
      loading.value = false
    })
  }

  const applyInstallment = (input: MembershipInstallmentInput, storeSales: Sale[] = []) => paymentsService.applyInstallment(input, storeSales)
  const applyComplimentaryPeriod = (input: ComplimentaryPeriodInput) => paymentsService.applyComplimentaryPeriod(input)
  const dispose = () => { stop?.(); stop = null }

  return { items, paid, loading, error, subscribe, applyInstallment, applyComplimentaryPeriod, dispose }
})
