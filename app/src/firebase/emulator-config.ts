import type { FirebaseOptions } from 'firebase/app'

export const FIREBASE_EMULATOR_PROJECT_ID = 'demo-kronos-training'
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
    databaseURL: `http://${FIREBASE_DATABASE_EMULATOR_HOST}:${FIREBASE_DATABASE_EMULATOR_PORT}?ns=${FIREBASE_EMULATOR_PROJECT_ID}`,
    projectId: FIREBASE_EMULATOR_PROJECT_ID,
    storageBucket: `${FIREBASE_EMULATOR_PROJECT_ID}.appspot.com`,
    messagingSenderId: '000000000000',
    appId: 'demo-app-id',
  }
}
