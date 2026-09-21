import type { NotificationJobStore, CreateNotificationJobResult } from './jobs.js'
import type { PaymentAppliedEvent } from './payment-events.js'

export async function enqueuePaymentNotification(
  event: PaymentAppliedEvent,
  jobs: NotificationJobStore,
  now: number,
): Promise<CreateNotificationJobResult | null> {
  const athleteId = event.athleteId?.trim()
  if (!athleteId)
    return null

  return jobs.createIfAbsent({
    idempotencyKey: event.correlationKey,
    type: 'payment-receipt',
    athleteId,
    reference: event.referenceId,
  }, now)
}
