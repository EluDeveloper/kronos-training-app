import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertLocalEmulatorUrl,
  authorizeLocalDevice,
  buildAuthorizedDeviceRecord,
  buildLocalAuthorizationUrl,
  normalizeDeviceUid,
} from '../scripts/authorize-local-device.mjs'

test('normaliza y valida un UID de dispositivo anónimo', () => {
  assert.equal(normalizeDeviceUid('  anonymous-device_123  '), 'anonymous-device_123')
  assert.throws(() => normalizeDeviceUid('uid con espacios'), /UID de dispositivo inválido/)
})

test('construye un registro local habilitado y trazable', () => {
  assert.deepEqual(buildAuthorizedDeviceRecord('device-1', 1_700_000_000_000), {
    enabled: true,
    label: 'Chrome QA local',
    createdAt: 1_700_000_000_000,
    lastSeenAt: 1_700_000_000_000,
  })
})

test('construye la ruta del emulador con el proyecto demo', () => {
  const url = buildLocalAuthorizationUrl('device-1')

  assert.equal(url.origin, 'http://127.0.0.1:9000')
  assert.equal(url.pathname, '/v1/authorizedDevices/device-1.json')
  assert.equal(url.searchParams.get('ns'), 'demo-kronos-training')
})

test('rechaza cualquier endpoint que no sea el emulador de loopback', () => {
  assert.throws(() => assertLocalEmulatorUrl('https://kronos-training-fd5e5-default-rtdb.firebaseio.com'), /emulador local/)
  assert.throws(() => assertLocalEmulatorUrl('http://localhost:9000'), /emulador local/)
  assert.throws(() => assertLocalEmulatorUrl('http://127.0.0.1:9001'), /emulador local/)
  assert.throws(() => assertLocalEmulatorUrl('http://127.0.0.1:9000/production.json'), /emulador local/)
})

test('autoriza el UID mediante una sola escritura PUT al emulador', async () => {
  const calls = []

  const result = await authorizeLocalDevice('device-1', {
    now: 1_700_000_000_000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })

      return { ok: true, status: 200 }
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url.origin, 'http://127.0.0.1:9000')
  assert.equal(calls[0].url.pathname, '/v1/authorizedDevices/device-1.json')
  assert.equal(calls[0].options.method, 'PUT')

  assert.deepEqual(JSON.parse(calls[0].options.body), result.record)
  assert.equal(result.uid, 'device-1')
})

test('no hace peticiones si el UID es inválido', async () => {
  let requestCount = 0

  await assert.rejects(
    authorizeLocalDevice('uid con espacios', {
      fetchImpl: async () => {
        requestCount += 1

        return { ok: true, status: 200 }
      },
    }),
    /UID de dispositivo inválido/,
  )

  assert.equal(requestCount, 0)
})

test('reporta un error acotado cuando el emulador rechaza la escritura', async () => {
  await assert.rejects(
    authorizeLocalDevice('device-1', {
      fetchImpl: async () => ({ ok: false, status: 403 }),
    }),
    /emulador local respondió HTTP 403/,
  )
})
