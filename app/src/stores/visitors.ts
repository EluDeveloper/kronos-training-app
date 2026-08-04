import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { visitorsService, type NewVisitorContact } from '@/services/visitors.service'
import type { VisitorContact } from '@/types/domain'

export const useVisitorsStore = defineStore('visitors', () => {
  const items = ref<VisitorContact[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  const sorted = computed(() => [...items.value].sort((a, b) => a.name.localeCompare(b.name, 'es')))

  function subscribe() {
    if (stop)
      return
    loading.value = true
    stop = visitorsService.subscribe(value => {
      items.value = value
      loading.value = false
    }, subscriptionError => {
      error.value = subscriptionError.message
      loading.value = false
    })
  }

  const create = (visitor: NewVisitorContact) => visitorsService.create(visitor)
  const update = (id: string, visitor: Partial<NewVisitorContact>) => visitorsService.update(id, visitor)
  const dispose = () => { stop?.(); stop = null }

  return { items, sorted, loading, error, subscribe, create, update, dispose }
})
