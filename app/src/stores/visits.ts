import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { visitsService, type NewVisit } from '@/services/visits.service'
import type { Visit } from '@/types/domain'

export const useVisitsStore = defineStore('visits', () => {
  const items = ref<Visit[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  function subscribe() {
    if (stop)
      return
    loading.value = true
    stop = visitsService.subscribe(value => {
      items.value = value
      loading.value = false
    }, subscriptionError => {
      error.value = subscriptionError.message
      loading.value = false
    })
  }

  const create = (visit: NewVisit) => visitsService.create(visit)
  const remove = (visit: Visit) => visitsService.delete(visit)
  const dispose = () => { stop?.(); stop = null }

  return { items, loading, error, subscribe, create, remove, dispose }
})
