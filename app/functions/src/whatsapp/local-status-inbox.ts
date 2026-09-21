import { defineString } from 'firebase-functions/params'
import { onValueWritten } from 'firebase-functions/v2/database'
import { getNotificationDatabase } from '../notifications/realtime-job-store.js'
import { getLocalStatusInboxConfig } from './local-status-inbox-config.js'
import { RealtimeStatusInbox } from './realtime-status-inbox.js'
import { validProviderMessageId } from './status-inbox.js'
import { isValidWebhookConfig, resolveWhatsAppWebhookRuntime } from './webhook-runtime.js'
import type { WhatsAppWebhookConfig } from './webhook-runtime.js'

const workerMode = defineString('KRONOS_NOTIFICATION_WORKER_MODE', { default: 'disabled' })
const graphApiVersion = defineString('KRONOS_WHATSAPP_GRAPH_API_VERSION', { default: '' })
const phoneNumberId = defineString('KRONOS_WHATSAPP_PHONE_NUMBER_ID', { default: '' })
const businessAccountId = defineString('KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID', { default: '' })
const MAX_STATUS_RECOVERY_PAGES = 4

interface StatusInboxRecoveryBoundary {
  page(input: { afterKey?: string; messageId?: string }): Promise<{
    events: Array<{ eventKey: string }>
    nextCursor: string | null
  }>
  reconcile(eventKey: string, now?: number): Promise<'pending' | 'completed' | 'expired' | 'missing'>
}

export interface StatusInboxSyncDependencies {
  readProviderMessageId?: (jobId: string) => Promise<unknown>
  createInbox?: (config: WhatsAppWebhookConfig) => StatusInboxRecoveryBoundary
  now?: () => number
}

// An explicit recovery runner, not an automatic scheduler. The caller owns the cursor.
export async function runLocalStatusInboxBatch(input: { afterKey?: string; messageId?: string; now?: () => number } = {}) {
  const config = getLocalStatusInboxConfig()
  if (!config)
    return { status: 'disabled' as const, processed: 0, pending: 0, nextCursor: null }
  const inbox = new RealtimeStatusInbox(undefined, config)
  const page = await inbox.page(input)
  let pending = 0
  for (const event of page.events) {
    if (await inbox.reconcile(event.eventKey, (input.now ?? Date.now)()) === 'pending')
      pending++
  }

  return { status: 'processed' as const, processed: page.events.length, pending, nextCursor: page.nextCursor }
}

export async function syncLocalStatusInbox(jobId: string, now: () => number = Date.now) {
  const config = getLocalStatusInboxConfig()
  if (!config)
    return { status: 'disabled' as const, processed: 0 }

  return syncNotificationStatusInbox(jobId, config, { now })
}

export async function syncNotificationStatusInbox(
  jobId: string,
  config: WhatsAppWebhookConfig,
  dependencies: StatusInboxSyncDependencies = {},
) {
  if (!isValidWebhookConfig(config))
    throw new Error('Invalid status inbox configuration')
  if (!/^job-[a-f0-9]{32}$/.test(jobId))
    throw new Error('Invalid notification job id')

  const providerMessageId = await (dependencies.readProviderMessageId ?? readProviderMessageId)(jobId)
  if (!validProviderMessageId(providerMessageId))
    return { status: 'ignored' as const, processed: 0 }

  const inbox = (dependencies.createInbox ?? (scope => new RealtimeStatusInbox(undefined, scope)))(config)
  let afterKey: string | undefined
  let processed = 0

  for (let pageNumber = 0; pageNumber < MAX_STATUS_RECOVERY_PAGES; pageNumber++) {
    const page = await inbox.page({ messageId: providerMessageId, afterKey })

    for (const event of page.events)
      await inbox.reconcile(event.eventKey, (dependencies.now ?? Date.now)())

    processed += page.events.length
    afterKey = page.nextCursor ?? undefined
    if (!afterKey)
      break
  }

  return { status: 'processed' as const, processed }
}

export const onNotificationProviderStatusWritten = onValueWritten({ ref: 'v1/notificationJobs/{jobId}', retry: true }, async event => {
  const runtime = resolveWhatsAppWebhookRuntime(readStatusInboxRuntimeEnvironment())
  if (runtime.mode === 'disabled' || !runtime.statusEnabled || !runtime.config)
    return
  const previous = event.data.before
  const current = event.data.after
  if (previous.child('providerMessageId').val() === current.child('providerMessageId').val()
    && previous.child('status').val() === current.child('status').val())
    return

  // Snapshot fields only filter irrelevant events; the consumer re-reads current data.
  await syncNotificationStatusInbox(event.params.jobId, runtime.config)
})

async function readProviderMessageId(jobId: string): Promise<unknown> {
  const latest = (await getNotificationDatabase().ref('v1/notificationJobs/' + jobId).get()).val()

  return latest?.providerMessageId
}

function readStatusInboxRuntimeEnvironment(): NodeJS.ProcessEnv {
  return {
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    GCP_PROJECT: process.env.GCP_PROJECT,
    FIREBASE_DATABASE_EMULATOR_HOST: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
    KRONOS_NOTIFICATION_WORKER_MODE: workerMode.value(),
    KRONOS_WHATSAPP_GRAPH_API_VERSION: graphApiVersion.value(),
    KRONOS_WHATSAPP_PHONE_NUMBER_ID: phoneNumberId.value(),
    KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID: businessAccountId.value(),
    KRONOS_WHATSAPP_STATUS_INBOX_MODE: process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE,
    KRONOS_WHATSAPP_QA_ACCOUNT_ID: process.env.KRONOS_WHATSAPP_QA_ACCOUNT_ID,
    KRONOS_WHATSAPP_QA_NUMBER_ID: process.env.KRONOS_WHATSAPP_QA_NUMBER_ID,
  }
}
