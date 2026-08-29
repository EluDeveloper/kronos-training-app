import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { createEmulatorFirebaseOptions, isFirebaseEmulatorMode } from './emulator-config'

const env = import.meta.env
export const useFirebaseEmulators = isFirebaseEmulatorMode(env.VITE_FIREBASE_USE_EMULATORS)

export const firebaseOptions: FirebaseOptions = useFirebaseEmulators
  ? createEmulatorFirebaseOptions()
  : {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }

const requiredConfiguration: Array<[keyof FirebaseOptions, string | undefined]> = useFirebaseEmulators
  ? []
  : [
    ['apiKey', env.VITE_FIREBASE_API_KEY],
    ['authDomain', env.VITE_FIREBASE_AUTH_DOMAIN],
    ['databaseURL', env.VITE_FIREBASE_DATABASE_URL],
    ['projectId', env.VITE_FIREBASE_PROJECT_ID],
    ['appId', env.VITE_FIREBASE_APP_ID],
  ]

export const missingFirebaseConfiguration = requiredConfiguration
  .filter(([, value]) => !value?.trim())
  .map(([key]) => String(key))

export const isFirebaseConfigured = missingFirebaseConfiguration.length === 0

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseOptions)
  : null

if (firebaseApp && !useFirebaseEmulators && env.VITE_FIREBASE_APPCHECK_SITE_KEY && typeof window !== 'undefined') {
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_FIREBASE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}
