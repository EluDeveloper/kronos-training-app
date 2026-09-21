import { onValueWritten } from 'firebase-functions/v2/database'
import type { CreateNotificationJobResult, NotificationJobStore } from './jobs.js'
import { enqueuePaymentNotification } from './enqueue.js'
import { detectMembershipPaymentEvents, detectSalePaymentEvents } from './payment-events.js'
import { RealtimeDatabaseNotificationJobStore } from './realtime-job-store.js'

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
): Promise<CreateNotificationJobResult[]> {
  const events = detectMembershipPaymentEvents(input)
  return enqueueEvents(events, jobs, now)
}

export async function processSaleWrite(
  input: SaleWrite,
  jobs: NotificationJobStore,
  now: number,
): Promise<CreateNotificationJobResult[]> {
  const events = detectSalePaymentEvents(input)
  return enqueueEvents(events, jobs, now)
}

export const onMembershipPaymentWritten = onValueWritten(
  'v1/payments/{athleteId}/{period}',
  async event => processMembershipPaymentWrite({
    athleteId: event.params.athleteId,
    period: event.params.period,
    before: event.data.before.val(),
    after: event.data.after.val(),
  }, new RealtimeDatabaseNotificationJobStore(), eventTime(event.time)),
)

export const onSaleWritten = onValueWritten(
  'v1/sales/{saleId}',
  async event => processSaleWrite({
    saleId: event.params.saleId,
    before: event.data.before.val(),
    after: event.data.after.val(),
  }, new RealtimeDatabaseNotificationJobStore(), eventTime(event.time)),
)

function enqueueEvents(
  events: ReturnType<typeof detectMembershipPaymentEvents>,
  jobs: NotificationJobStore,
  now: number,
): Promise<CreateNotificationJobResult[]> {
  return Promise.all(events.map(event => enqueuePaymentNotification(event, jobs, now)))
    .then(results => results.filter((result): result is CreateNotificationJobResult => result !== null))
}

function eventTime(timestamp: string | undefined): number {
  const parsed = timestamp ? Date.parse(timestamp) : NaN
  return Number.isFinite(parsed) ? parsed : Date.now()
}
