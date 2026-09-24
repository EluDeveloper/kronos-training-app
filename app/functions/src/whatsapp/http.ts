import { defineSecret, defineString } from 'firebase-functions/params'
import { onRequest } from 'firebase-functions/v2/https'
import { notificationFunctionRuntime } from '../runtime-options.js'
import { emitOperationalEvent, webhookTelemetryEvent } from '../operations/telemetry.js'
import { RealtimeDatabaseNotificationJobStore } from '../notifications/realtime-job-store.js'
import type { NotificationJobStore } from '../notifications/jobs.js'
import { RealtimeWebhookEventStore } from './realtime-webhook-events.js'
import type { WebhookEventStore } from './webhook.js'
import { parseInboundOptOut } from './inbound-opt-out.js'
import type { LocalOptOutEvent } from './inbound-opt-out.js'
import { RealtimeOptOutStore } from './realtime-opt-out.js'
import { parseStatusInbox } from './status-inbox.js'
import type { StatusInboxEvent } from './status-inbox.js'
import { RealtimeStatusInbox } from './realtime-status-inbox.js'
import {
  processMetaWebhookEvent,
  validateWebhookChallenge,
  verifyMetaWebhookSignature,
} from './webhook.js'
import {
  isValidWebhookAppSecret,
  isValidWebhookVerifyToken,
  resolveWhatsAppWebhookRuntime,
} from './webhook-runtime.js'
import type { WhatsAppWebhookConfig } from './webhook-runtime.js'

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024
const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;\s*charset=utf-8)?$/i

const workerMode = defineString('KRONOS_NOTIFICATION_WORKER_MODE', { default: 'disabled' })
const graphApiVersion = defineString('KRONOS_WHATSAPP_GRAPH_API_VERSION', { default: '' })
const phoneNumberId = defineString('KRONOS_WHATSAPP_PHONE_NUMBER_ID', { default: '' })
const businessAccountId = defineString('KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID', { default: '' })
const webhookVerifyToken = defineSecret('WHATSAPP_WEBHOOK_VERIFY_TOKEN')
const whatsappAppSecret = defineSecret('WHATSAPP_APP_SECRET')

interface WebhookRequest {
  method: string
  rawBody?: Uint8Array
  body?: unknown
  query: Record<string, unknown>
  header(name: string): string | undefined
}

interface WebhookResponse {
  status(code: number): WebhookResponse
  json(body: unknown): void
  send(body: unknown): void
}

interface StatusInboxBoundary {
  enqueue(event: StatusInboxEvent, now?: number): Promise<'stored' | 'expired'>
  reconcile(eventKey: string, now?: number): Promise<'pending' | 'completed' | 'expired' | 'missing'>
}

interface OptOutBoundary {
  process(event: LocalOptOutEvent): Promise<'applied' | 'ignored' | 'duplicate' | 'retry-required'>
}

export interface WhatsAppWebhookDependencies {
  environment?: NodeJS.ProcessEnv
  readVerifyToken?: () => string
  readAppSecret?: () => string
  createStatusInbox?: (config: WhatsAppWebhookConfig) => StatusInboxBoundary
  createOptOutStore?: (config: WhatsAppWebhookConfig) => OptOutBoundary
  createLegacyEventStore?: () => WebhookEventStore
  createLegacyJobStore?: () => NotificationJobStore
  now?: () => number
}

export async function handleWhatsAppWebhook(
  request: WebhookRequest,
  response: WebhookResponse,
  dependencies: WhatsAppWebhookDependencies = {},
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.status(405).json({ status: 'method-not-allowed' })

    return
  }

  const runtime = resolveWhatsAppWebhookRuntime(dependencies.environment ?? process.env)
  if (runtime.mode === 'disabled') {
    response.status(request.method === 'GET' ? 403 : 503).json({ status: 'webhook-disabled' })

    return
  }

  if (request.method === 'GET') {
    const verifyToken = readSecret(
      dependencies.readVerifyToken ?? (() => webhookVerifyToken.value()),
      isValidWebhookVerifyToken,
    )

    const challenge = verifyToken
      ? validateWebhookChallenge({
        mode: request.query['hub.mode'],
        verifyToken: request.query['hub.verify_token'],
        challenge: request.query['hub.challenge'],
      }, verifyToken)
      : null

    if (challenge === null) {
      response.status(403).json({ status: 'invalid-challenge' })

      return
    }
    response.status(200).send(challenge)

    return
  }

  const rawBody = request.rawBody
  if (!(rawBody instanceof Uint8Array)
    || rawBody.byteLength === 0
    || rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES
    || !JSON_CONTENT_TYPE_PATTERN.test(request.header('content-type')?.trim() ?? '')) {
    response.status(400).json({ status: 'invalid-payload' })

    return
  }

  const appSecret = readSecret(
    dependencies.readAppSecret ?? (() => whatsappAppSecret.value()),
    isValidWebhookAppSecret,
  )

  if (!appSecret) {
    response.status(503).json({ status: 'webhook-disabled' })

    return
  }

  if (!verifyMetaWebhookSignature(
    rawBody,
    request.header('x-hub-signature-256'),
    appSecret,
  )) {
    response.status(401).json({ status: 'invalid-signature' })

    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)) as unknown
  } catch {
    response.status(400).json({ status: 'invalid-payload' })

    return
  }

  const receivedAt = (dependencies.now ?? Date.now)()
  if (!Number.isSafeInteger(receivedAt) || receivedAt < 0) {
    response.status(500).json({ status: 'temporary-error' })

    return
  }

  const config = runtime.config

  const inbound = runtime.optOutEnabled && config
    ? parseInboundOptOut(payload, config, receivedAt, rawBody.byteLength)
    : { status: 'no-messages' as const }

  const statuses = runtime.statusEnabled && config
    ? parseStatusInbox(payload, config, receivedAt, rawBody.byteLength)
    : { status: 'no-statuses' as const }

  // Validate every enabled part before a mixed batch can mutate consent or state.
  if (inbound.status === 'invalid' || statuses.status === 'invalid') {
    response.status(400).json({ status: 'invalid-payload' })

    return
  }

  try {
    if (inbound.status === 'valid' && config) {
      const store = (dependencies.createOptOutStore ?? (scope => new RealtimeOptOutStore(undefined, scope)))(config)
      for (const event of inbound.events) {
        if (await store.process(event) === 'retry-required') {
          response.status(500).json({ status: 'temporary-error' })

          return
        }
      }
    }

    if (statuses.status === 'valid' && config) {
      const inbox = (dependencies.createStatusInbox ?? (scope => new RealtimeStatusInbox(undefined, scope)))(config)
      for (const event of statuses.events) {
        await inbox.enqueue(event, receivedAt)
        await inbox.reconcile(event.eventKey, receivedAt)
      }
      response.status(200).json({ status: 'processed' })

      return
    }

    if (inbound.status === 'valid') {
      response.status(200).json({ status: 'processed' })

      return
    }

    if (runtime.legacyStatusEnabled) {
      const result = await processMetaWebhookEvent(
        payload,
        (dependencies.createLegacyEventStore ?? (() => new RealtimeWebhookEventStore()))(),
        (dependencies.createLegacyJobStore ?? (() => new RealtimeDatabaseNotificationJobStore()))(),
        receivedAt,
      )

      response.status(result.status === 'invalid-payload' ? 400 : 200).json({ status: result.status })

      return
    }

    response.status(400).json({ status: 'invalid-payload' })
  } catch {
    response.status(500).json({ status: 'temporary-error' })
  }
}

export const whatsappWebhook = onRequest({
  ...notificationFunctionRuntime,
  secrets: [webhookVerifyToken, whatsappAppSecret],
}, async (request, response) => {
  const startedAt = Date.now()
  try {
    await handleWhatsAppWebhook(request, response, {
      environment: readFunctionWebhookEnvironment(),
      readVerifyToken: () => webhookVerifyToken.value(),
      readAppSecret: () => whatsappAppSecret.value(),
    })
  } finally {
    emitOperationalEvent(webhookTelemetryEvent(
      request.method,
      response.statusCode,
      Math.max(0, Date.now() - startedAt),
    ))
  }
})

function readSecret(
  reader: () => string,
  validator: (value: unknown) => value is string,
): string | null {
  try {
    const value = reader()

    return validator(value) ? value : null
  } catch {
    return null
  }
}

function readFunctionWebhookEnvironment(): NodeJS.ProcessEnv {
  return {
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    GCP_PROJECT: process.env.GCP_PROJECT,
    FIREBASE_DATABASE_EMULATOR_HOST: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
    KRONOS_NOTIFICATION_WORKER_MODE: workerMode.value(),
    KRONOS_WHATSAPP_GRAPH_API_VERSION: graphApiVersion.value(),
    KRONOS_WHATSAPP_PHONE_NUMBER_ID: phoneNumberId.value(),
    KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID: businessAccountId.value(),
    KRONOS_WHATSAPP_OPT_OUT_MODE: process.env.KRONOS_WHATSAPP_OPT_OUT_MODE,
    KRONOS_WHATSAPP_STATUS_INBOX_MODE: process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE,
    KRONOS_WHATSAPP_QA_ACCOUNT_ID: process.env.KRONOS_WHATSAPP_QA_ACCOUNT_ID,
    KRONOS_WHATSAPP_QA_NUMBER_ID: process.env.KRONOS_WHATSAPP_QA_NUMBER_ID,
  }
}
