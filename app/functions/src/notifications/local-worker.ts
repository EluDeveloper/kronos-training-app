import { randomUUID } from 'node:crypto'
import { defineSecret, defineString } from 'firebase-functions/params'
import { onValueCreated } from 'firebase-functions/v2/database'
import {
  createNotificationRuntimeProvider,
  resolveNotificationProviderRuntime,
} from '../whatsapp/provider-runtime.js'
import type { MetaGraphApiFetch } from '../whatsapp/meta-graph-api-transport.js'
import { notificationFunctionRuntime } from '../runtime-options.js'
import { getNotificationDatabase, RealtimeDatabaseNotificationJobStore } from './realtime-job-store.js'
import { RealtimeNotificationDataSource } from './realtime-notification-data.js'
import { processNotificationJob } from './worker.js'
import type { NotificationDataSource } from './worker.js'
import type { NotificationJobStore } from './jobs.js'
import {
  isNotificationAthleteAllowed,
  resolveNotificationRollout,
} from './rollout.js'

const workerMode = defineString('KRONOS_NOTIFICATION_WORKER_MODE', { default: 'disabled' })
const graphApiVersion = defineString('KRONOS_WHATSAPP_GRAPH_API_VERSION', { default: '' })
const phoneNumberId = defineString('KRONOS_WHATSAPP_PHONE_NUMBER_ID', { default: '' })
const rolloutMode = defineString('KRONOS_NOTIFICATION_ROLLOUT_MODE', { default: 'disabled' })
const qaAthleteId = defineString('KRONOS_NOTIFICATION_QA_ATHLETE_ID', { default: '' })
const whatsappAccessToken = defineSecret('WHATSAPP_ACCESS_TOKEN')

export interface NotificationWorkerRuntimeOptions {
  environment?: NodeJS.ProcessEnv
  readAccessToken?: () => string
  fetch?: MetaGraphApiFetch
  createJobStore?: () => NotificationJobStore
  createDataSource?: () => NotificationDataSource
  createWorkerId?: () => string
  now?: () => number
}

export function isLocalNotificationWorkerEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return resolveNotificationProviderRuntime(environment).mode === 'local-fake'
}

export async function processNotificationJobWithRuntime(
  jobId: string,
  options: NotificationWorkerRuntimeOptions = {},
) {
  const environment = options.environment ?? process.env
  const runtime = resolveNotificationProviderRuntime(environment)
  const rollout = resolveNotificationRollout(environment)
  if (runtime.mode === 'disabled' || rollout.mode === 'disabled')
    return { status: 'disabled' as const }
  if (!/^job-[a-f\d]{32}$/.test(jobId))
    throw new Error('Invalid notification job id')

  const jobs = (options.createJobStore ?? (() => new RealtimeDatabaseNotificationJobStore()))()
  const job = await jobs.getById(jobId)
  if (!job || !isNotificationAthleteAllowed(rollout, job.athleteId))
    return { status: 'disabled' as const }

  const provider = createNotificationRuntimeProvider({
    runtime,
    jobId,
    readAccessToken: options.readAccessToken ?? (() => whatsappAccessToken.value()),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })

  if (!provider)
    return { status: 'disabled' as const }

  return processNotificationJob({
    jobId,
    workerId: (options.createWorkerId ?? randomUUID)(),
    now: options.now ?? Date.now,
    jobs,
    data: (options.createDataSource ?? (() => new RealtimeNotificationDataSource()))(),
    provider,
  })
}

export async function processLocalNotificationJob(jobId: string, now: () => number = Date.now) {
  if (!isLocalNotificationWorkerEnabled())
    return { status: 'disabled' as const }

  return processNotificationJobWithRuntime(jobId, {
    environment: process.env,
    now,
  })
}

export const onNotificationJobCreated = onValueCreated({
  ...notificationFunctionRuntime,
  ref: 'v1/notificationJobs/{jobId}',
  secrets: [whatsappAccessToken],
}, async event => processNotificationJobWithRuntime(event.params.jobId, {
  environment: readFunctionRuntimeEnvironment(),
  readAccessToken: () => whatsappAccessToken.value(),
}))

// Explicit local runner for queued jobs, interrupted work and due retries.
// Cursor pagination prevents old terminal jobs from starving newer work.
export async function runLocalNotificationBatch(input: { now?: () => number; afterJobId?: string } = {}) {
  if (!isLocalNotificationWorkerEnabled() || resolveNotificationRollout(process.env).mode !== 'qa')
    return { status: 'disabled' as const, processed: 0, nextCursor: null }
  if (input.afterJobId && !/^job-[a-f\d]{32}$/.test(input.afterJobId))
    throw new Error('Invalid notification cursor')
  const root = getNotificationDatabase().ref('v1/notificationJobs').orderByKey()
  const query = input.afterJobId ? root.startAfter(input.afterJobId) : root
  const snapshot = await query.limitToFirst(25).get()
  const jobIds: string[] = []

  snapshot.forEach(child => { jobIds.push(child.key!)

    return false })
  for (const jobId of jobIds)
    await processLocalNotificationJob(jobId, input.now)

  return { status: 'processed' as const, processed: jobIds.length, nextCursor: jobIds.length === 25 ? jobIds.at(-1)! : null }
}

function readFunctionRuntimeEnvironment(): NodeJS.ProcessEnv {
  return {
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    GCP_PROJECT: process.env.GCP_PROJECT,
    FIREBASE_DATABASE_EMULATOR_HOST: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
    KRONOS_NOTIFICATION_WORKER_MODE: workerMode.value(),
    KRONOS_WHATSAPP_GRAPH_API_VERSION: graphApiVersion.value(),
    KRONOS_WHATSAPP_PHONE_NUMBER_ID: phoneNumberId.value(),
    KRONOS_NOTIFICATION_ROLLOUT_MODE: rolloutMode.value(),
    KRONOS_NOTIFICATION_QA_ATHLETE_ID: qaAthleteId.value(),
  }
}
