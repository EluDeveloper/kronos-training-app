import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const LOCAL_EMULATOR_DATABASE_ORIGIN = 'http://127.0.0.1:9000'
export const LOCAL_EMULATOR_PROJECT_ID = 'demo-kronos-training'
export const LOCAL_DEVICE_LABEL = 'Chrome QA local'

const DEVICE_UID_PATTERN = /^[\w-]{1,128}$/u

export function normalizeDeviceUid(value) {
  if (typeof value !== 'string')
    throw new Error('El UID de dispositivo inválido debe ser texto.')

  const uid = value.trim()

  if (!DEVICE_UID_PATTERN.test(uid))
    throw new Error('UID de dispositivo inválido. Usa el UID mostrado por Kronos, sin espacios.')

  return uid
}

export function assertLocalEmulatorUrl(rawUrl) {
  let url

  try {
    url = new URL(rawUrl)
  }
  catch {
    throw new Error('El destino debe ser el emulador local de Realtime Database.')
  }

  const isLoopbackEmulator = url.protocol === 'http:'
    && url.hostname === '127.0.0.1'
    && url.port === '9000'
    && !url.username
    && !url.password
    && url.pathname === '/'

  if (!isLoopbackEmulator)
    throw new Error('El destino debe ser el emulador local de Realtime Database.')

  return url
}

export function buildAuthorizedDeviceRecord(uid, now = Date.now()) {
  normalizeDeviceUid(uid)

  if (!Number.isFinite(now) || now < 0)
    throw new Error('La fecha del registro local no es válida.')

  return {
    enabled: true,
    label: LOCAL_DEVICE_LABEL,
    createdAt: now,
    lastSeenAt: now,
  }
}

export function buildLocalAuthorizationUrl(uid) {
  const normalizedUid = normalizeDeviceUid(uid)
  const baseUrl = assertLocalEmulatorUrl(`${LOCAL_EMULATOR_DATABASE_ORIGIN}/`)

  baseUrl.pathname = `/v1/authorizedDevices/${encodeURIComponent(normalizedUid)}.json`
  baseUrl.searchParams.set('ns', LOCAL_EMULATOR_PROJECT_ID)

  return baseUrl
}

export async function authorizeLocalDevice(uid, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const normalizedUid = normalizeDeviceUid(uid)
  const url = buildLocalAuthorizationUrl(normalizedUid)
  const record = buildAuthorizedDeviceRecord(normalizedUid, now)

  if (typeof fetchImpl !== 'function')
    throw new Error('No hay un cliente HTTP disponible para el emulador local.')

  let response

  try {
    response = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    })
  }
  catch {
    throw new Error('No se pudo contactar el emulador local de Realtime Database.')
  }

  if (!response?.ok)
    throw new Error(`El emulador local respondió HTTP ${response?.status ?? 'desconocido'}.`)

  return { uid: normalizedUid, record, url }
}

async function runCli() {
  const args = process.argv.slice(2)

  if (args.length !== 1)
    throw new Error('Uso: npm run qa:authorize-device -- <uid>')

  const result = await authorizeLocalDevice(args[0])

  console.log(`Dispositivo ${result.uid} autorizado en el emulador local.`)
}

const currentModulePath = fileURLToPath(import.meta.url)
const invokedModulePath = process.argv[1] ? path.resolve(process.argv[1]) : null

if (invokedModulePath === currentModulePath)
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : 'No se pudo autorizar el dispositivo local.')
    process.exitCode = 1
  })
