import { createHash } from 'node:crypto'
import type { NotificationJob, NotificationJobStore } from './jobs.js'
import type { DeliveryResult } from './delivery-state.js'
import { planNotificationRetry } from './retry-policy.js'
import { createPaymentNotificationPdf, type BackendPaymentNotificationDocument } from '../pdf/payment-receipts.js'
import { buildPaymentReceiptTemplateRequest, buildPaymentReminderTemplateRequest } from '../whatsapp/templates.js'
import type { ProviderResponse, SendTemplateInput, WhatsAppProvider } from '../whatsapp/client.js'

export type NotificationEligibility =
  | { eligible: true; recipient: string }
  | { eligible: false; reason: 'no-consent' | 'opted-out' | 'phone-changed' | 'invalid-phone' | 'athlete-inactive' | 'consent-mismatch' }

export interface NotificationDataSource {
  readEligibility(job: NotificationJob): Promise<NotificationEligibility>
  readDocument(job: NotificationJob, now: number): Promise<BackendPaymentNotificationDocument | null>
}

export interface NotificationWorkerInput {
  jobId: string
  workerId: string
  jobs: NotificationJobStore
  data: NotificationDataSource
  provider: WhatsAppProvider
  now: () => number
}

export async function processNotificationJob(input: NotificationWorkerInput): Promise<{
  status: 'skipped' | 'busy' | 'deferred' | 'finished'
  job?: NotificationJob
}> {
  const original = await input.jobs.getById(input.jobId)
  if (!original || !['queued', 'processing', 'retryable-failed'].includes(original.status))
    return { status: 'skipped' }
  if (original.status === 'processing' && original.lock && original.lock.leaseUntil > input.now())
    return { status: 'busy' }

  const retry = original.status === 'retryable-failed' ? planNotificationRetry(original, input.now()) : null
  if (retry?.retry && retry.retryAt > input.now())
    return { status: 'deferred' }

  const job = await input.jobs.acquireLease(input.jobId, input.workerId, input.now(), 60_000, original)
  if (!job)
    return { status: 'busy' }

  const finish = async (result: DeliveryResult) => ({
    status: 'finished' as const,
    job: await input.jobs.finishDelivery(job.jobId, input.workerId, input.now(), result),
  })

  if (retry && !retry.retry)
    return finish({ status: 'terminal-failed', outcome: 'not-submitted', errorCode: 'RETRY_EXHAUSTED' })
  if (job.delivery?.attempts[`attempt-${job.attemptNumber}`]?.outcome === 'dispatching')
    return finish({ status: 'unknown', outcome: 'unknown', errorCode: 'DISPATCH_INTERRUPTED' })

  let request: SendTemplateInput
  let document: BackendPaymentNotificationDocument
  try {
    const eligible = await input.data.readEligibility(job)
    if (!eligible.eligible)
      return finish(suppressed(eligible.reason))
    const loaded = await input.data.readDocument(job, input.now())
    if (!loaded)
      return finish({ status: 'suppressed', outcome: 'suppressed', errorCode: 'NO_ELIGIBLE_DOCUMENT' })
    document = loaded

    const pdf = createPaymentNotificationPdf(document)

    request = document.kind === 'receipt'
      ? buildPaymentReceiptTemplateRequest({
        to: eligible.recipient, customerName: document.customerName, document: pdf,
        concept: document.concept, amountPaid: document.amountPaid,
      })
      : buildPaymentReminderTemplateRequest({
        to: eligible.recipient, customerName: document.customerName, document: pdf,
        dueDate: document.dueDate, balance: document.balance,
      })

    const current = await input.data.readEligibility(job)
    if (!current.eligible)
      return finish(suppressed(current.reason))
    if (current.recipient !== eligible.recipient)
      return finish(suppressed('phone-changed'))
  } catch {
    return finish({ status: 'retryable-failed', outcome: 'not-submitted', errorCode: 'PREPARATION_FAILED' })
  }

  const reserved = await input.jobs.startDispatch(job.jobId, input.workerId, input.now(), {
    folio: document.folio,
    templateName: request.templateName,
    locale: request.locale,
    documentSha256: request.document.sha256,
    documentBytes: request.document.bytes.length,
    recipientHash: createHash('sha256').update(request.to).digest('hex'),
    recipientLast4: request.to.slice(-4),
  })

  if (!reserved)
    return { status: 'busy' }

  let response: ProviderResponse
  try {
    response = await input.provider.sendTemplate(request)
  } catch {
    response = { outcome: 'unknown' }
  }

  // Do not catch a persistence failure here: the durable dispatch marker must
  // remain uncertain until a recovery or webhook can reconcile it.
  return finish(classifyResponse(response))
}

function suppressed(reason: Exclude<NotificationEligibility, { eligible: true }>['reason']): DeliveryResult {
  return { status: 'suppressed', outcome: 'suppressed', errorCode: reason.replace(/-/g, '_').toUpperCase() }
}

function classifyResponse(response: ProviderResponse): DeliveryResult {
  if (response.outcome === 'accepted' && response.messageId
    && /^wamid[.-][\w+/=.-]{1,500}$/.test(response.messageId)) {
    return { status: 'accepted', outcome: 'accepted', messageId: response.messageId }
  }
  if (response.outcome !== 'not-submitted' && response.outcome !== 'rejected')
    return { status: 'unknown', outcome: 'unknown', errorCode: 'PROVIDER_UNKNOWN' }

  const temporary = ['RATE_LIMIT', 'RATE_LIMITED', 'TEMPORARY', 'SERVICE_UNAVAILABLE'].includes(response.errorCode ?? '')
  const disabled = ['REAL_PROVIDER_DISABLED', 'FAKE_PROVIDER_DISABLED'].includes(response.errorCode ?? '')

  return {
    status: disabled ? 'suppressed' : temporary ? 'retryable-failed' : 'terminal-failed',
    outcome: response.outcome,
    errorCode: disabled ? 'PROVIDER_DISABLED' : temporary ? 'PROVIDER_TEMPORARY' : 'PROVIDER_REJECTED',
  }
}
