import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FIREBASE_AUTH_EMULATOR_URL,
  FIREBASE_DATABASE_EMULATOR_HOST,
  FIREBASE_DATABASE_EMULATOR_PORT,
  FIREBASE_EMULATOR_DATABASE_INSTANCE,
  FIREBASE_EMULATOR_PROJECT_ID,
  createEmulatorFirebaseOptions,
  isFirebaseEmulatorMode,
} from '../src/firebase/emulator-config'

test('only enables emulator mode with an explicit true value', () => {
  assert.equal(isFirebaseEmulatorMode('true'), true)
  assert.equal(isFirebaseEmulatorMode(' TRUE '), true)
  assert.equal(isFirebaseEmulatorMode('false'), false)
  assert.equal(isFirebaseEmulatorMode(undefined), false)
})

test('uses a fixed demo project and loopback endpoints', () => {
  const options = createEmulatorFirebaseOptions()

  assert.equal(FIREBASE_EMULATOR_PROJECT_ID, 'demo-kronos-training')
  assert.equal(FIREBASE_EMULATOR_DATABASE_INSTANCE, 'demo-kronos-training')
  assert.equal(FIREBASE_AUTH_EMULATOR_URL, 'http://127.0.0.1:9099')
  assert.equal(FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1')
  assert.equal(FIREBASE_DATABASE_EMULATOR_PORT, 9000)
  assert.equal(options.projectId, FIREBASE_EMULATOR_PROJECT_ID)
  assert.equal(options.databaseURL, 'http://127.0.0.1:9000?ns=demo-kronos-training')
  assert.equal(options.apiKey, 'demo-api-key')
  assert.equal(options.appId, 'demo-app-id')
})
