import { defineSecret, defineString } from 'firebase-functions/params'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { notificationFunctionRuntime } from '../runtime-options.js'
import { emitOperationalEvent, type OperationalTelemetry } from '../operations/telemetry.js'
import { isValidMetaAccessToken } from '../whatsapp/meta-graph-api-transport.js'
import { resolveNotificationProviderRuntime } from '../whatsapp/provider-runtime.js'
import { processNotificationJobWithRuntime } from './local-worker.js'
import { RealtimeDatabaseNotificationJobStore } from './realtime-job-store.js'
import { resolveNotificationRollout } from './rollout.js'

const RECOVERY_BATCH_LIMIT = 25
const RECOVERY_CONCURRENCY = 3
const JOB_ID_PATTERN = /^job-[a-f\d]{32}$/

const recoveryMode = defineString('KRONOS_NOTIFICATION_RECOVERY_MODE', { default: 'disabled' })
const workerMode = defineString('KRONOS_NOTIFICATION_WORKER_MODE', { default: 'disabled' })
const graphApiVersion = defineString('KRONOS_WHATSAPP_GRAPH_API_VERSION', { default: '' })
const phoneNumberId = defineString('KRONOS_WHATSAPP_PHONE_NUMBER_ID', { default: '' })
const rolloutMode = defineString('KRONOS_NOTIFICATION_ROLLOUT_MODE', { default: 'disabled' })
const qaAthleteId = defineString('KRONOS_NOTIFICATION_QA_ATHLETE_ID', { default: '' })
const whatsappAccessToken = defineSecret('WHATSAPP_ACCESS_TOKEN')

type WorkerResult = Awaited<ReturnType<typeof processNotificationJobWithRuntime>>

export interface NotificationRecoveryDependencies {
  environment?: NodeJS.ProcessEnv
  readAccessToken?: () => string
  listDueJobIds?: (now: number, limit: number) => Promise<string[]>
  processJob?: (jobId: string, accessToken: string) => Promise<WorkerResult>
  now?: () => number
  telemetry?: OperationalTelemetry
}

export type NotificationRecoveryResult =
  | {
    status: 'disabled'
    reason: 'MODE_DISABLED' | 'INVALID_RUNTIME' | 'INVALID_SECRET'
    selected: 0
  }
  | {
    status: 'processed'
    selected: number
    finished: number
    deferred: number
    busy: number
    skipped: number
    failed: number
  }

export async function runNotificationRecovery(
  dependencies: NotificationRecoveryDependencies = {},
): Promise<NotificationRecoveryResult> {
  const environment = dependencies.environment ?? process.env
  const telemetry = dependencies.telemetry ?? (event => emitOperationalEvent(event))
  const requestedMode = environment.KRONOS_NOTIFICATION_RECOVERY_MODE ?? ''
  if (requestedMode === '' || requestedMode === 'disabled') {
    telemetry({ code: 'whatsapp_recovery_disabled', reason: 'MODE_DISABLED' })

    return { status: 'disabled', reason: 'MODE_DISABLED', selected: 0 }
  }
  if (requestedMode !== 'scheduled'
    || resolveNotificationProviderRuntime(environment).mode !== 'meta'
    || resolveNotificationRollout(environment).mode !== 'qa') {
    telemetry({ code: 'whatsapp_recovery_disabled', reason: 'INVALID_RUNTIME' })

    return { status: 'disabled', reason: 'INVALID_RUNTIME', selected: 0 }
  }

  const accessToken = readAccessToken(dependencies.readAccessToken ?? (() => whatsappAccessToken.value()))
  if (!accessToken) {
    telemetry({ code: 'whatsapp_recovery_disabled', reason: 'INVALID_SECRET' })

    return { status: 'disabled', reason: 'INVALID_SECRET', selected: 0 }
  }

  const now = (dependencies.now ?? Date.now)()
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error('Invalid notification recovery time')

  const listDueJobIds = dependencies.listDueJobIds
    ?? ((timestamp, limit) => new RealtimeDatabaseNotificationJobStore().listDueRecoveryJobIds(timestamp, limit))

  let jobIds: string[]
  try {
    jobIds = await listDueJobIds(now, RECOVERY_BATCH_LIMIT)
    if (!isValidRecoveryPage(jobIds))
      throw new Error('Invalid notification recovery page')
  } catch (error) {
    telemetry({ code: 'whatsapp_recovery_failed', stage: 'selection' })
    throw error
  }

  const processJob = dependencies.processJob ?? ((jobId, token) =>
    processNotificationJobWithRuntime(jobId, {
      environment,
      readAccessToken: () => token,
    }))

  const counts = { finished: 0, deferred: 0, busy: 0, skipped: 0, failed: 0 }
  for (let offset = 0; offset < jobIds.length; offset += RECOVERY_CONCURRENCY) {
    const outcomes = await Promise.all(jobIds.slice(offset, offset + RECOVERY_CONCURRENCY)
      .map(async jobId => {
        try {
          return (await processJob(jobId, accessToken)).status
        } catch {
          return 'failed' as const
        }
      }))

    for (const outcome of outcomes) {
      if (outcome === 'disabled' || outcome === 'failed')
        counts.failed++
      else
        counts[outcome]++
    }
  }

  const result = { status: 'processed' as const, selected: jobIds.length, ...counts }

  telemetry({ code: 'whatsapp_recovery_completed', selected: result.selected, ...counts })

  return result
}

export const onNotificationRecoveryScheduled = onSchedule({
  ...notificationFunctionRuntime,
  schedule: '*/5 * * * *',
  timeZone: 'UTC',
  timeoutSeconds: 540,
  secrets: [whatsappAccessToken],
}, async () => {
  await runNotificationRecovery({
    environment: readFunctionRecoveryEnvironment(),
    readAccessToken: () => whatsappAccessToken.value(),
  })
})

function readAccessToken(reader: () => string): string | null {
  try {
    const value = reader()

    return isValidMetaAccessToken(value) ? value : null
  } catch {
    return null
  }
}

function isValidRecoveryPage(jobIds: unknown): jobIds is string[] {
  return Array.isArray(jobIds)
    && jobIds.length <= RECOVERY_BATCH_LIMIT
    && jobIds.every(jobId => typeof jobId === 'string' && JOB_ID_PATTERN.test(jobId))
    && new Set(jobIds).size === jobIds.length
}

function readFunctionRecoveryEnvironment(): NodeJS.ProcessEnv {
  return {
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    GCP_PROJECT: process.env.GCP_PROJECT,
    FIREBASE_DATABASE_EMULATOR_HOST: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
    KRONOS_NOTIFICATION_RECOVERY_MODE: recoveryMode.value(),
    KRONOS_NOTIFICATION_WORKER_MODE: workerMode.value(),
    KRONOS_WHATSAPP_GRAPH_API_VERSION: graphApiVersion.value(),
    KRONOS_WHATSAPP_PHONE_NUMBER_ID: phoneNumberId.value(),
    KRONOS_NOTIFICATION_ROLLOUT_MODE: rolloutMode.value(),
    KRONOS_NOTIFICATION_QA_ATHLETE_ID: qaAthleteId.value(),
  }
}
