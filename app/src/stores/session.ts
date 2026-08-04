import { defineStore } from 'pinia'
import type { User } from 'firebase/auth'
import type { Unsubscribe } from 'firebase/database'
import {
  authErrorMessage,
  changeCurrentPassword,
  configureAuthPersistence,
  firebaseAuth,
  observeAuthState,
  requestPasswordReset,
  signInWithPassword,
  signOutCurrentUser,
  startAnonymousSession,
} from '@/firebase/auth'
import { isFirebaseConfigured, missingFirebaseConfiguration } from '@/firebase/config'
import { subscribeToConnection, subscribeToDeviceAuthorization } from '@/firebase/database'
import { usersService } from '@/services/users.service'
import { firstAllowedRoute, hasModuleAccess, type AccessModule, type AppUser } from '@/types/access'

export type SessionStatus =
  | 'booting'
  | 'configuration-missing'
  | 'authorizing'
  | 'signed-out'
  | 'pending'
  | 'bootstrap-required'
  | 'password-change-required'
  | 'authorized'
  | 'disabled'
  | 'access-denied'
  | 'error'

export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>('booting')
  const uid = ref<string | null>(null)
  const deviceLabel = ref<string | null>(null)
  const connected = ref(false)
  const error = ref<string | null>(null)
  const profile = ref<AppUser | null>(null)
  const authEmail = ref<string | null>(null)
  const missingConfiguration = readonly(ref(missingFirebaseConfiguration))

  let stopAuth: (() => void) | null = null
  let stopProfile: Unsubscribe | null = null
  let stopAuthorization: Unsubscribe | null = null
  let stopAuthConfiguration: Unsubscribe | null = null
  let stopConnection: Unsubscribe | null = null
  let identityVersion = 0

  const isReady = computed(() => status.value === 'authorized')
  const isAdmin = computed(() => profile.value?.role === 'admin' && profile.value.enabled)
  const defaultRoute = computed(() => firstAllowedRoute(profile.value))

  const canAccess = (module: AccessModule) => hasModuleAccess(profile.value, module)

  function stopIdentitySubscriptions() {
    stopProfile?.()
    stopAuthorization?.()
    stopAuthConfiguration?.()
    stopProfile = null
    stopAuthorization = null
    stopAuthConfiguration = null
  }

  function handlePasswordUser(user: User, version: number) {
    status.value = 'authorizing'
    stopProfile = usersService.subscribeProfile(user.uid, value => {
      if (version !== identityVersion)
        return

      profile.value = value
      if (!value) {
        error.value = 'La cuenta existe, pero un Admin todavía no le ha asignado acceso a Kronos.'
        status.value = 'access-denied'
      }
      else if (!value.enabled) {
        error.value = 'Un Admin deshabilitó el acceso de esta cuenta.'
        status.value = 'disabled'
      }
      else {
        error.value = null
        status.value = value.mustChangePassword ? 'password-change-required' : 'authorized'
      }
    }, subscriptionError => {
      if (version !== identityVersion)
        return

      error.value = subscriptionError.message
      status.value = 'error'
    })
  }

  function handleAnonymousUser(user: User, version: number) {
    status.value = 'authorizing'
    let configurationLoaded = false
    let authorizationLoaded = false
    let initialized = false
    let deviceEnabled = false
    let signingOut = false

    const reconcile = () => {
      if (version !== identityVersion || !configurationLoaded)
        return

      if (initialized) {
        if (!signingOut) {
          signingOut = true
          void signOutCurrentUser()
        }

        return
      }

      if (!authorizationLoaded)
        return

      status.value = deviceEnabled ? 'bootstrap-required' : 'pending'
    }

    stopAuthConfiguration = usersService.subscribeAuthConfiguration(configuration => {
      configurationLoaded = true
      initialized = configuration?.initialized === true
      reconcile()
    }, subscriptionError => {
      if (version !== identityVersion)
        return

      error.value = subscriptionError.message
      status.value = 'error'
    })

    stopAuthorization = subscribeToDeviceAuthorization(user.uid, device => {
      authorizationLoaded = true
      deviceEnabled = device?.enabled === true
      deviceLabel.value = device?.label ?? null
      reconcile()
    }, authorizationError => {
      if (version !== identityVersion)
        return

      error.value = authorizationError.message
      status.value = 'error'
    })
  }

  function handleAuthState(user: User | null) {
    identityVersion += 1

    const version = identityVersion

    stopIdentitySubscriptions()
    error.value = null
    profile.value = null
    uid.value = user?.uid ?? null
    authEmail.value = user?.email ?? null
    deviceLabel.value = null

    if (!user) {
      status.value = 'signed-out'

      return
    }

    if (user.isAnonymous)
      handleAnonymousUser(user, version)
    else
      handlePasswordUser(user, version)
  }

  async function initialize() {
    dispose()
    error.value = null

    if (!isFirebaseConfigured) {
      status.value = 'configuration-missing'

      return
    }

    try {
      status.value = 'booting'
      await configureAuthPersistence()
      stopConnection = subscribeToConnection(value => {
        connected.value = value
      })
      stopAuth = observeAuthState(handleAuthState)
    }
    catch (initializationError) {
      error.value = authErrorMessage(initializationError)
      status.value = 'error'
    }
  }

  async function signIn(email: string, password: string) {
    error.value = null
    status.value = 'authorizing'
    try {
      await signInWithPassword(email, password)
    }
    catch (signInError) {
      const message = authErrorMessage(signInError)

      error.value = message
      status.value = 'signed-out'
      throw new Error(message)
    }
  }

  async function beginBootstrap() {
    error.value = null
    status.value = 'authorizing'
    try {
      await startAnonymousSession()
    }
    catch (bootstrapError) {
      const message = authErrorMessage(bootstrapError)

      error.value = message
      status.value = 'signed-out'
      throw new Error(message)
    }
  }

  async function bootstrapAdmin(displayName: string, email: string, password: string) {
    if (!firebaseAuth?.currentUser?.isAnonymous || !uid.value)
      throw new Error('Se necesita un dispositivo autorizado para crear el primer Admin.')

    status.value = 'authorizing'
    try {
      await usersService.bootstrapAdmin({ displayName, email }, password, uid.value)
    }
    catch (bootstrapError) {
      const message = authErrorMessage(bootstrapError)

      error.value = message
      status.value = 'bootstrap-required'
      throw new Error(message)
    }

    await signOutCurrentUser()
    await signIn(email, password)
  }

  async function changePassword(password: string) {
    if (!uid.value)
      throw new Error('No hay una cuenta activa.')

    try {
      await changeCurrentPassword(password)
      await usersService.completePasswordChange(uid.value)
    }
    catch (passwordError) {
      throw new Error(authErrorMessage(passwordError))
    }
  }

  async function sendPasswordReset(email: string) {
    try {
      await requestPasswordReset(email)
    }
    catch (resetError) {
      const code = typeof resetError === 'object' && resetError && 'code' in resetError ? String(resetError.code) : ''
      if (code === 'auth/user-not-found')
        return

      throw new Error(authErrorMessage(resetError))
    }
  }

  async function logout() {
    await signOutCurrentUser()
  }

  function dispose() {
    identityVersion += 1
    stopAuth?.()
    stopConnection?.()
    stopIdentitySubscriptions()
    stopAuth = null
    stopConnection = null
  }

  return {
    status,
    uid,
    deviceLabel,
    connected,
    error,
    profile,
    authEmail,
    missingConfiguration,
    isReady,
    isAdmin,
    defaultRoute,
    canAccess,
    initialize,
    signIn,
    beginBootstrap,
    bootstrapAdmin,
    changePassword,
    sendPasswordReset,
    logout,
    dispose,
  }
})
