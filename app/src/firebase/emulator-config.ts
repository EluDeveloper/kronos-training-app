import type { FirebaseOptions } from 'firebase/app'

export const FIREBASE_EMULATOR_PROJECT_ID = 'demo-kronos-training'

// The Firebase CLI RTDB emulator namespace is the project ID. Keep this aligned
// with local QA helpers that seed authorizedDevices in the same emulator DB.
export const FIREBASE_EMULATOR_DATABASE_INSTANCE = FIREBASE_EMULATOR_PROJECT_ID
export const FIREBASE_AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
export const FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1'
export const FIREBASE_DATABASE_EMULATOR_PORT = 9000

export function isFirebaseEmulatorMode(value: string | undefined) {
  return value?.trim().toLocaleLowerCase('en-US') === 'true'
}

export function createEmulatorFirebaseOptions(): FirebaseOptions {
  return {
    apiKey: 'demo-api-key',
    authDomain: `${FIREBASE_EMULATOR_PROJECT_ID}.firebaseapp.com`,
    databaseURL: `http://${FIREBASE_DATABASE_EMULATOR_HOST}:${FIREBASE_DATABASE_EMULATOR_PORT}?ns=${FIREBASE_EMULATOR_DATABASE_INSTANCE}`,
    projectId: FIREBASE_EMULATOR_PROJECT_ID,
    storageBucket: `${FIREBASE_EMULATOR_PROJECT_ID}.appspot.com`,
    messagingSenderId: '000000000000',
    appId: 'demo-app-id',
  }
}
