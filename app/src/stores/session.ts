import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { ensureAnonymousUser } from '@/firebase/auth'
import { isFirebaseConfigured, missingFirebaseConfiguration } from '@/firebase/config'
import { subscribeToConnection, subscribeToDeviceAuthorization } from '@/firebase/database'

export type SessionStatus = 'booting' | 'configuration-missing' | 'authorizing' | 'pending' | 'authorized' | 'error'

export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>('booting')
  const uid = ref<string | null>(null)
  const deviceLabel = ref<string | null>(null)
  const connected = ref(false)
  const error = ref<string | null>(null)
  const missingConfiguration = readonly(ref(missingFirebaseConfiguration))

  let stopAuthorization: Unsubscribe | null = null
  let stopConnection: Unsubscribe | null = null

  const isReady = computed(() => status.value === 'authorized')

  async function initialize() {
    dispose()
    error.value = null

    if (!isFirebaseConfigured) {
      status.value = 'configuration-missing'

      return
    }

    try {
      status.value = 'authorizing'
      const user = await ensureAnonymousUser()

      if (!user)
        throw new Error('No fue posible iniciar la sesión del dispositivo.')

      uid.value = user.uid
      stopConnection = subscribeToConnection(value => {
        connected.value = value
      })
      stopAuthorization = subscribeToDeviceAuthorization(
        user.uid,
        device => {
          deviceLabel.value = device?.label ?? null
          status.value = device?.enabled === true ? 'authorized' : 'pending'
        },
        authorizationError => {
          error.value = authorizationError.message
          status.value = 'error'
        },
      )
    }
    catch (initializationError) {
      error.value = initializationError instanceof Error
        ? initializationError.message
        : 'No fue posible conectar este dispositivo.'
      status.value = 'error'
    }
  }

  function dispose() {
    stopAuthorization?.()
    stopConnection?.()
    stopAuthorization = null
    stopConnection = null
  }

  return {
    status,
    uid,
    deviceLabel,
    connected,
    error,
    missingConfiguration,
    isReady,
    initialize,
    dispose,
  }
})
