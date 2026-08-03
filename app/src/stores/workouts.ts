import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { workoutsService, type NewWorkout } from '@/services/workouts.service'
import type { Workout } from '@/types/domain'

export const useWorkoutsStore = defineStore('workouts', () => {
  const items = ref<Workout[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  const sorted = computed(() => [...items.value].sort((a, b) => a.date.localeCompare(b.date)))

  function subscribe() {
    if (stop)
      return
    loading.value = true
    stop = workoutsService.subscribe(value => {
      items.value = value
      loading.value = false
    }, subscriptionError => {
      error.value = subscriptionError.message
      loading.value = false
    })
  }

  const save = (workout: NewWorkout) => workoutsService.save(workout)
  const remove = (date: string) => workoutsService.delete(date)
  const dispose = () => { stop?.(); stop = null }

  return { items, sorted, loading, error, subscribe, save, remove, dispose }
})
