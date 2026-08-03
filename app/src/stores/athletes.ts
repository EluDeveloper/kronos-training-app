import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { athletesService, type NewAthlete } from '@/services/athletes.service'
import type { Athlete } from '@/types/domain'

export const useAthletesStore = defineStore('athletes', () => {
  const items = ref<Athlete[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  const active = computed(() => items.value.filter(item => item.status === 'active'))
  const sorted = computed(() => [...items.value].sort((a, b) => a.profile.name.localeCompare(b.profile.name, 'es')))

  function subscribe() {
    if (stop)
      return
    loading.value = true
    try {
      stop = athletesService.subscribe(value => {
        items.value = value
        loading.value = false
      }, subscriptionError => {
        error.value = subscriptionError.message
        loading.value = false
      })
    }
    catch (subscriptionError) {
      error.value = subscriptionError instanceof Error ? subscriptionError.message : 'No fue posible leer atletas.'
      loading.value = false
    }
  }

  const create = (athlete: NewAthlete) => athletesService.create(athlete)
  const update = (id: string, athlete: Partial<NewAthlete>) => athletesService.update(id, athlete)
  const setStatus = (id: string, status: Athlete['status'], reason?: string) => athletesService.setStatus(id, status, reason)
  const dispose = () => { stop?.(); stop = null }

  return { items, active, sorted, loading, error, subscribe, create, update, setStatus, dispose }
})
