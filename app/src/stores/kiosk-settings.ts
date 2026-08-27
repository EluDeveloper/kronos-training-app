import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { kioskSettingsService, type KioskSettingsInput } from '@/services/kiosk-settings.service'
import type { KioskSettings } from '@/types/domain'

export const useKioskSettingsStore = defineStore('kiosk-settings', () => {
  const settings = ref<KioskSettings | null>(null)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  function subscribe() {
    if (stop)
      return

    loading.value = true
    loaded.value = false
    error.value = null
    stop = kioskSettingsService.subscribe(value => {
      settings.value = value
      loading.value = false
      loaded.value = true
    }, subscriptionError => {
      settings.value = null
      error.value = subscriptionError.message
      loading.value = false
      loaded.value = true
    })
  }

  const save = (input: KioskSettingsInput, updatedBy: string) => kioskSettingsService.save(input, updatedBy)

  function dispose() {
    stop?.()
    stop = null
  }

  return { settings, loading, loaded, error, subscribe, save, dispose }
})
