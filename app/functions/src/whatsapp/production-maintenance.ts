import { defineString } from 'firebase-functions/params'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import {
  emitOperationalEvent,
  type OperationalEvent,
  type OperationalTelemetry,
} from '../operations/telemetry.js'
import { RealtimeOptOutStore } from './realtime-opt-out.js'
import { RealtimeStatusInbox } from './realtime-status-inbox.js'
import { RealtimeWebhookEventStore } from './realtime-webhook-events.js'
import { resolveWhatsAppWebhookRuntime, type WhatsAppWebhookConfig } from './webhook-runtime.js'

const maintenanceMode = defineString('KRONOS_WHATSAPP_MAINTENANCE_MODE', { default: 'disabled' })
const workerMode = defineString('KRONOS_NOTIFICATION_WORKER_MODE', { default: 'disabled' })
const graphApiVersion = defineString('KRONOS_WHATSAPP_GRAPH_API_VERSION', { default: '' })
const phoneNumberId = defineString('KRONOS_WHATSAPP_PHONE_NUMBER_ID', { default: '' })
const businessAccountId = defineString('KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID', { default: '' })

interface StatusMaintenanceBoundary {
  page(input: { afterKey?: string }): Promise<{
    events: Array<{ eventKey: string }>
    nextCursor: string | null
  }>
  reconcile(eventKey: string, now?: number): Promise<'pending' | 'completed' | 'expired' | 'missing'>
  cleanup(now: number): Promise<number>
}

interface CleanupBoundary {
  cleanup(now: number): Promise<number>
}

export interface WhatsAppProductionMaintenanceDependencies {
  environment?: () => NodeJS.ProcessEnv
  now?: () => number
  telemetry?: OperationalTelemetry
  createStatusInbox?: (config: WhatsAppWebhookConfig) => StatusMaintenanceBoundary
  createOptOutStore?: (config: WhatsAppWebhookConfig) => CleanupBoundary
  createWebhookEventStore?: () => CleanupBoundary
}

export type WhatsAppProductionMaintenanceResult =
  | { status: 'disabled'; reason: 'MODE_DISABLED' | 'INVALID_RUNTIME' }
  | {
    status: 'processed'
    visited: number
    pending: number
    completed: number
    expired: number
    missing: number
    deletedStatus: number
    deletedOptOut: number
    deletedWebhook: number
    durationMs: number
    hasMorePages: boolean
  }

export function createWhatsAppProductionMaintenance(
  dependencies: WhatsAppProductionMaintenanceDependencies = {},
): () => Promise<WhatsAppProductionMaintenanceResult> {
  const environment = dependencies.environment ?? (() => process.env)
  const now = dependencies.now ?? Date.now
  const telemetry = dependencies.telemetry ?? (event => emitOperationalEvent(event))
  let afterKey: string | undefined
  let identity: string | undefined
  let running = false

  return async () => {
    const resolved = resolveMaintenance(environment())
    if (resolved.status === 'disabled') {
      telemetry({ code: 'whatsapp_maintenance_disabled', reason: resolved.reason })

      return resolved
    }

    if (running) {
      telemetry({ code: 'whatsapp_maintenance_failed', stage: 'initialization' })
      throw new Error('WhatsApp maintenance already running')
    }

    const currentIdentity = JSON.stringify([resolved.config.accountId, resolved.config.phoneNumberId])
    if (identity !== currentIdentity) {
      identity = currentIdentity
      afterKey = undefined
    }

    running = true
    let stage: Extract<OperationalEvent, { code: 'whatsapp_maintenance_failed' }>['stage'] = 'initialization'
    try {
      const startedAt = now()

      assertTime(startedAt)

      const inbox = (dependencies.createStatusInbox
        ?? (config => new RealtimeStatusInbox(undefined, config)))(resolved.config)

      const optOut = (dependencies.createOptOutStore
        ?? (config => new RealtimeOptOutStore(undefined, config)))(resolved.config)

      const webhookEvents = (dependencies.createWebhookEventStore
        ?? (() => new RealtimeWebhookEventStore()))()

      stage = 'status-page'

      const page = await inbox.page({ afterKey })

      assertPage(page)

      const counts = { pending: 0, completed: 0, expired: 0, missing: 0 }

      stage = 'status-reconcile'
      for (const event of page.events)
        counts[await inbox.reconcile(event.eventKey, startedAt)]++

      afterKey = page.nextCursor ?? undefined

      const assertIdentity = () => {
        if (maintenanceIdentity(environment()) !== currentIdentity)
          throw new Error('WhatsApp maintenance identity changed')
      }

      stage = 'status-cleanup'
      assertIdentity()

      const deletedStatus = await inbox.cleanup(startedAt)

      stage = 'opt-out-cleanup'
      assertIdentity()

      const deletedOptOut = await optOut.cleanup(startedAt)

      stage = 'webhook-cleanup'
      assertIdentity()

      const deletedWebhook = await webhookEvents.cleanup(startedAt)
      for (const deleted of [deletedStatus, deletedOptOut, deletedWebhook])
        if (!Number.isSafeInteger(deleted) || deleted < 0 || deleted > 50)
          throw new Error('Invalid WhatsApp maintenance cleanup result')

      const finishedAt = now()

      assertTime(finishedAt)

      const result = {
        status: 'processed' as const,
        visited: page.events.length,
        ...counts,
        deletedStatus,
        deletedOptOut,
        deletedWebhook,
        durationMs: Math.max(0, finishedAt - startedAt),
        hasMorePages: page.nextCursor !== null,
      }

      telemetry({ code: 'whatsapp_maintenance_completed', ...withoutStatus(result) })

      return result
    } catch (error) {
      telemetry({ code: 'whatsapp_maintenance_failed', stage })
      throw error
    } finally {
      running = false
    }
  }
}

const runScheduledMaintenance = createWhatsAppProductionMaintenance({
  environment: readFunctionMaintenanceEnvironment,
})

export const onWhatsAppMaintenanceScheduled = onSchedule({
  schedule: '*/5 * * * *',
  timeZone: 'UTC',
  timeoutSeconds: 540,
  maxInstances: 1,
  concurrency: 1,
}, async () => {
  await runScheduledMaintenance()
})

function resolveMaintenance(environment: NodeJS.ProcessEnv):
  | { status: 'disabled'; reason: 'MODE_DISABLED' | 'INVALID_RUNTIME' }
  | { status: 'enabled'; config: WhatsAppWebhookConfig } {
  const mode = environment.KRONOS_WHATSAPP_MAINTENANCE_MODE ?? ''
  if (mode === '' || mode === 'disabled')
    return { status: 'disabled', reason: 'MODE_DISABLED' }
  if (mode !== 'scheduled')
    return { status: 'disabled', reason: 'INVALID_RUNTIME' }

  const runtime = resolveWhatsAppWebhookRuntime(environment)

  return runtime.mode === 'meta' && runtime.statusEnabled && runtime.optOutEnabled
    ? { status: 'enabled', config: runtime.config }
    : { status: 'disabled', reason: 'INVALID_RUNTIME' }
}

function maintenanceIdentity(environment: NodeJS.ProcessEnv): string | null {
  const resolved = resolveMaintenance(environment)

  return resolved.status === 'enabled'
    ? JSON.stringify([resolved.config.accountId, resolved.config.phoneNumberId])
    : null
}

function assertPage(page: Awaited<ReturnType<StatusMaintenanceBoundary['page']>>): void {
  if (!Array.isArray(page.events) || page.events.length > 25
    || page.events.some(event => !/^[a-f0-9]{64}$/.test(event?.eventKey))
    || new Set(page.events.map(event => event.eventKey)).size !== page.events.length
    || (page.nextCursor !== null && !/^[a-f0-9]{64}$/.test(page.nextCursor)))
    throw new Error('Invalid WhatsApp maintenance page')
}

function assertTime(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid WhatsApp maintenance time')
}

function withoutStatus(result: Extract<WhatsAppProductionMaintenanceResult, { status: 'processed' }>) {
  const { status: _, ...event } = result

  return event
}

function readFunctionMaintenanceEnvironment(): NodeJS.ProcessEnv {
  return {
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    GCP_PROJECT: process.env.GCP_PROJECT,
    FIREBASE_DATABASE_EMULATOR_HOST: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
    KRONOS_WHATSAPP_MAINTENANCE_MODE: maintenanceMode.value(),
    KRONOS_NOTIFICATION_WORKER_MODE: workerMode.value(),
    KRONOS_WHATSAPP_GRAPH_API_VERSION: graphApiVersion.value(),
    KRONOS_WHATSAPP_PHONE_NUMBER_ID: phoneNumberId.value(),
    KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID: businessAccountId.value(),
  }
}
