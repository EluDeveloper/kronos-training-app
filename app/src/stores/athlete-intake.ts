import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { athleteIntakeService } from '@/services/athlete-intake.service'
import type { AthleteIntake } from '@/types/domain'
import type { AthleteIntakePayload } from '@/utils/athlete-intake'

export const useAthleteIntakeStore = defineStore('athlete-intake', () => {
  const current = ref<AthleteIntake | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null
  let currentAthleteId: string | null = null
  let loadedAthleteId: string | null = null

  function clear() {
    stop?.()
    stop = null
    currentAthleteId = null
    loadedAthleteId = null
    current.value = null
    loading.value = false
    error.value = null
  }

  function subscribe(athleteId: string, onChange?: (value: AthleteIntake | null) => void) {
    if (stop && currentAthleteId === athleteId)
      return

    clear()
    currentAthleteId = athleteId
    loading.value = true

    try {
      stop = athleteIntakeService.subscribe(athleteId, value => {
        current.value = value
        loadedAthleteId = athleteId
        loading.value = false
        onChange?.(value)
      }, subscriptionError => {
        error.value = subscriptionError.message
        loadedAthleteId = athleteId
        loading.value = false
        onChange?.(null)
      })
    }
    catch (subscriptionError) {
      error.value = subscriptionError instanceof Error ? subscriptionError.message : 'No fue posible leer los datos de admisión.'
      loadedAthleteId = athleteId
      loading.value = false
      onChange?.(null)
    }
  }

  async function save(intake: AthleteIntakePayload) {
    if (loadedAthleteId === intake.athleteId && current.value)
      await athleteIntakeService.update(intake.athleteId, intake)
    else
      await athleteIntakeService.create(intake)
  }

  const dispose = clear

  return { current, loading, error, subscribe, save, clear, dispose }
})
