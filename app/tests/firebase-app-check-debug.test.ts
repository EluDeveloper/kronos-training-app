import assert from 'node:assert/strict'
import test from 'node:test'
import { configureAppCheckDebugToken } from '../src/firebase/app-check-debug'

test('habilita la generación de un debug token sólo en desarrollo local explícito', () => {
  const target: { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string } = {}

  assert.equal(configureAppCheckDebugToken({ isDevelopment: true, useEmulators: false, configuredValue: 'true', target }), true)
  assert.equal(target.FIREBASE_APPCHECK_DEBUG_TOKEN, true)
})

test('acepta un token ya registrado sin revelarlo y permanece deshabilitado por defecto', () => {
  const registeredTarget: { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string } = {}
  const disabledTarget: { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string } = {}

  assert.equal(configureAppCheckDebugToken({ isDevelopment: true, useEmulators: false, configuredValue: 'token-privado', target: registeredTarget }), true)
  assert.equal(registeredTarget.FIREBASE_APPCHECK_DEBUG_TOKEN, 'token-privado')
  assert.equal(configureAppCheckDebugToken({ isDevelopment: false, useEmulators: false, configuredValue: 'true', target: disabledTarget }), false)
  assert.equal(configureAppCheckDebugToken({ isDevelopment: true, useEmulators: true, configuredValue: 'true', target: disabledTarget }), false)
  assert.equal(configureAppCheckDebugToken({ isDevelopment: true, useEmulators: false, configuredValue: '', target: disabledTarget }), false)
  assert.equal(disabledTarget.FIREBASE_APPCHECK_DEBUG_TOKEN, undefined)
})
