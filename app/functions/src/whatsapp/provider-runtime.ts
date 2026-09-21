import {
  createFakeWhatsAppProvider,
  MetaWhatsAppProvider,
} from './client.js'
import type { WhatsAppProvider } from './client.js'
import {
  isValidMetaAccessToken,
  isValidMetaGraphApiVersion,
  isValidMetaPhoneNumberId,
  MetaGraphApiTransport,
} from './meta-graph-api-transport.js'
import type { MetaGraphApiFetch } from './meta-graph-api-transport.js'

export type NotificationProviderRuntime =
  | { mode: 'disabled'; reason: 'MODE_DISABLED' | 'INVALID_RUNTIME' }
  | { mode: 'local-fake' }
  | { mode: 'meta'; apiVersion: string; phoneNumberId: string }

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
const LOOPBACK_EMULATOR_PATTERN = /^(?:127\.0\.0\.1|localhost):(\d{1,5})$/
const JOB_ID_PATTERN = /^job-[a-f\d]{32}$/

export function resolveNotificationProviderRuntime(
  environment: RuntimeEnvironment,
): NotificationProviderRuntime {
  const requestedMode = environment.KRONOS_NOTIFICATION_WORKER_MODE ?? ''

  if (requestedMode === '' || requestedMode === 'disabled')
    return { mode: 'disabled', reason: 'MODE_DISABLED' }

  if (requestedMode === 'fake') {
    return isValidLocalRuntime(environment)
      ? { mode: 'local-fake' }
      : { mode: 'disabled', reason: 'INVALID_RUNTIME' }
  }

  if (requestedMode === 'meta') {
    const projectId = environment.GCLOUD_PROJECT || environment.GCP_PROJECT || ''
    const apiVersion = environment.KRONOS_WHATSAPP_GRAPH_API_VERSION
    const phoneNumberId = environment.KRONOS_WHATSAPP_PHONE_NUMBER_ID

    if (isValidProductionProject(projectId)
      && !environment.FIREBASE_DATABASE_EMULATOR_HOST?.trim()
      && isValidMetaGraphApiVersion(apiVersion)
      && isValidMetaPhoneNumberId(phoneNumberId)) {
      return { mode: 'meta', apiVersion, phoneNumberId }
    }
  }

  return { mode: 'disabled', reason: 'INVALID_RUNTIME' }
}

export function createNotificationRuntimeProvider(input: {
  runtime: NotificationProviderRuntime
  jobId: string
  readAccessToken?: () => string
  fetch?: MetaGraphApiFetch
}): WhatsAppProvider | null {
  if (input.runtime.mode === 'disabled')
    return null

  if (input.runtime.mode === 'local-fake') {
    if (!JOB_ID_PATTERN.test(input.jobId))
      return null

    return createFakeWhatsAppProvider({
      outcome: 'accepted',
      messageId: `wamid.fake.${input.jobId}`,
    })
  }

  if (!isValidMetaGraphApiVersion(input.runtime.apiVersion)
    || !isValidMetaPhoneNumberId(input.runtime.phoneNumberId)
    || typeof input.readAccessToken !== 'function') {
    return null
  }

  let accessToken: string
  try {
    accessToken = input.readAccessToken()
  } catch {
    return null
  }

  if (!isValidMetaAccessToken(accessToken))
    return null

  const transport = new MetaGraphApiTransport({
    apiVersion: input.runtime.apiVersion,
    ...(input.fetch ? { fetch: input.fetch } : {}),
  })

  return new MetaWhatsAppProvider({
    enabled: true,
    accessToken,
    phoneNumberId: input.runtime.phoneNumberId,
    transport,
  })
}

function isValidLocalRuntime(environment: RuntimeEnvironment): boolean {
  if (environment.GCLOUD_PROJECT !== 'demo-kronos-training')
    return false

  const match = LOOPBACK_EMULATOR_PATTERN.exec(
    environment.FIREBASE_DATABASE_EMULATOR_HOST ?? '',
  )

  const port = Number(match?.[1])

  return Number.isInteger(port) && port >= 1 && port <= 65_535
}

function isValidProductionProject(projectId: string): boolean {
  return PROJECT_ID_PATTERN.test(projectId) && !projectId.startsWith('demo-')
}
