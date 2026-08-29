import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { notificationPreferencesService } from '@/services/notification-preferences.service'
import type { NotificationConsent } from '@/utils/payment-notification'

export const useNotificationPreferencesStore = defineStore('notification-preferences', () => {
  const athleteId = ref<string | null>(null)
  const item = ref<NotificationConsent | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  function clear() {
    stop?.()
    stop = null
    athleteId.value = null
    item.value = null
    loading.value = false
    saving.value = false
    error.value = null
  }

  function subscribe(id: string) {
    clear()
    athleteId.value = id
    loading.value = true

    try {
      stop = notificationPreferencesService.subscribe(id, preference => {
        item.value = preference
        loading.value = false
      }, subscriptionError => {
        error.value = subscriptionError.message
        loading.value = false
      })
    }
    catch (subscriptionError) {
      error.value = subscriptionError instanceof Error ? subscriptionError.message : 'No fue posible leer las preferencias de WhatsApp.'
      loading.value = false
    }
  }

  async function save(preference: NotificationConsent) {
    if (!athleteId.value || preference.athleteId !== athleteId.value)
      throw new Error('La preferencia no corresponde al atleta seleccionado.')

    saving.value = true
    error.value = null
    try {
      await notificationPreferencesService.save(preference)
      item.value = preference
    }
    catch (saveError) {
      error.value = saveError instanceof Error ? saveError.message : 'No fue posible guardar las preferencias de WhatsApp.'
      throw saveError
    }
    finally {
      saving.value = false
    }
  }

  return { athleteId, item, loading, saving, error, subscribe, save, clear }
})
