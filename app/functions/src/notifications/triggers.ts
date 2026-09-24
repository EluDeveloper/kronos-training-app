import { defineString } from 'firebase-functions/params'
import { onValueWritten } from 'firebase-functions/v2/database'
import { notificationFunctionRuntime } from '../runtime-options.js'
import type { CreateNotificationJobResult, NotificationJobStore } from './jobs.js'
import { enqueuePaymentNotification } from './enqueue.js'
import { detectMembershipPaymentEvents, detectSalePaymentEvents } from './payment-events.js'
import { RealtimeDatabaseNotificationJobStore } from './realtime-job-store.js'
import {
  isNotificationAthleteAllowed,
  resolveNotificationRollout,
  type NotificationRollout,
} from './rollout.js'

const rolloutMode = defineString('KRONOS_NOTIFICATION_ROLLOUT_MODE', { default: 'disabled' })
const qaAthleteId = defineString('KRONOS_NOTIFICATION_QA_ATHLETE_ID', { default: '' })

export interface MembershipPaymentWrite {
  athleteId: string
  period: string
  before: unknown
  after: unknown
}

export interface SaleWrite {
  saleId: string
  before: unknown
  after: unknown
}

export async function processMembershipPaymentWrite(
  input: MembershipPaymentWrite,
  jobs: NotificationJobStore,
  now: number,
  rollout: NotificationRollout = resolveNotificationRollout({}),
): Promise<CreateNotificationJobResult[]> {
  const events = detectMembershipPaymentEvents(input)

  return enqueueEvents(events, jobs, now, rollout)
}

export async function processSaleWrite(
  input: SaleWrite,
  jobs: NotificationJobStore,
  now: number,
  rollout: NotificationRollout = resolveNotificationRollout({}),
): Promise<CreateNotificationJobResult[]> {
  const events = detectSalePaymentEvents(input)

  return enqueueEvents(events, jobs, now, rollout)
}

export const onMembershipPaymentWritten = onValueWritten(
  { ...notificationFunctionRuntime, ref: 'v1/payments/{athleteId}/{period}' },
  async event => processMembershipPaymentWrite({
    athleteId: event.params.athleteId,
    period: event.params.period,
    before: event.data.before.val(),
    after: event.data.after.val(),
  }, new RealtimeDatabaseNotificationJobStore(), eventTime(event.time), readFunctionRollout()),
)

export const onSaleWritten = onValueWritten(
  { ...notificationFunctionRuntime, ref: 'v1/sales/{saleId}' },
  async event => processSaleWrite({
    saleId: event.params.saleId,
    before: event.data.before.val(),
    after: event.data.after.val(),
  }, new RealtimeDatabaseNotificationJobStore(), eventTime(event.time), readFunctionRollout()),
)

function enqueueEvents(
  events: ReturnType<typeof detectMembershipPaymentEvents>,
  jobs: NotificationJobStore,
  now: number,
  rollout: NotificationRollout,
): Promise<CreateNotificationJobResult[]> {
  return Promise.all(events
    .filter(event => event.athleteId !== null
      && isNotificationAthleteAllowed(rollout, event.athleteId))
    .map(event => enqueuePaymentNotification(event, jobs, now)))
    .then(results => results.filter((result): result is CreateNotificationJobResult => result !== null))
}

function readFunctionRollout(): NotificationRollout {
  return resolveNotificationRollout({
    KRONOS_NOTIFICATION_ROLLOUT_MODE: rolloutMode.value(),
    KRONOS_NOTIFICATION_QA_ATHLETE_ID: qaAthleteId.value(),
  })
}

function eventTime(timestamp: string | undefined): number {
  const parsed = timestamp ? Date.parse(timestamp) : NaN

  return Number.isFinite(parsed) ? parsed : Date.now()
}
