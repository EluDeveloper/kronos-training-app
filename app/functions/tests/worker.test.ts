/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryNotificationJobStore } from '../src/notifications/jobs.ts'
import { processNotificationJob, type NotificationDataSource } from '../src/notifications/worker.ts'
import { FakeWhatsAppProvider } from '../src/whatsapp/client.ts'
import { buildOptOutPatch } from '../src/whatsapp/opt-out.ts'

const document = {
  kind: 'receipt' as const, title: 'RECIBO' as const, folio: 'MEM-QA-001',
  customerName: 'Atleta QA', issuedAt: '2026-09-08T15:00:00Z', concept: 'Mensualidad',
  lines: [{ description: 'Mensualidad', amount: 500 }], total: 500, amountPaid: 500,
  balance: 0, isProofOfPayment: true as const,
}

async function setup() {
  const jobs = new InMemoryNotificationJobStore()

  const { job } = await jobs.createIfAbsent({
    idempotencyKey: 'membership:qa:2026-09:one', type: 'payment-receipt', athleteId: 'qa', reference: 'one',
  }, 1000)

  const data: NotificationDataSource = {
    readEligibility: async () => ({ eligible: true, recipient: '+520000000000' }),
    readDocument: async () => document,
  }

  const provider = new FakeWhatsAppProvider({ response: { outcome: 'accepted', messageId: 'wamid.qa.1' } })
  const input = { jobId: job.jobId, jobs, data, provider, now: () => 1001, workerId: 'qa-worker' }

  return { jobs, job, data, provider, input }
}

test('worker connects a queued receipt to PDF, fake submission and private audit', async () => {
  const { input, jobs, job, provider } = await setup()

  await processNotificationJob(input)

  const saved = await jobs.getById(job.jobId)

  assert.equal(saved?.status, 'accepted')
  assert.equal(saved?.providerMessageId, 'wamid.qa.1')
  assert.equal(saved?.delivery?.attempts['attempt-1'].outcome, 'accepted')
  assert.equal(saved?.delivery?.attempts['attempt-1'].metadata?.folio, document.folio)
  assert.equal(provider.submittedRequests.length, 1)
  assert.ok(provider.submittedRequests[0].document.bytes.length > 100)
  assert.equal(JSON.stringify(saved).includes('+520000000000'), false)
  assert.equal(JSON.stringify(saved).includes('Atleta QA'), false)
  assert.equal(JSON.stringify(saved).includes('Uint8Array'), false)
})

test('concurrent workers and a repeated trigger submit exactly once', async () => {
  const { input, provider } = await setup()

  await Promise.all([
    processNotificationJob(input),
    processNotificationJob({ ...input, workerId: 'qa-second' }),
  ])
  await processNotificationJob(input)

  assert.equal(provider.submittedRequests.length, 1)
})

test('opt-out suppresses the job before reading personal document data', async () => {
  const { input, jobs, job, data, provider } = await setup()

  data.readEligibility = async () => ({ eligible: false, reason: 'opted-out' })
  data.readDocument = async () => { throw new Error('Document must not be read') }
  await processNotificationJob(input)

  assert.equal((await jobs.getById(job.jobId))?.status, 'suppressed')
  assert.equal((await jobs.getById(job.jobId))?.delivery?.attempts['attempt-1'].errorCode, 'OPTED_OUT')
  assert.equal(provider.submittedRequests.length, 0)
})

for (const type of ['payment-receipt', 'payment-reminder'] as const) {
  test('recognized opt-out patch suppresses ' + type + ' in memory without changing payment or history', async () => {
    const jobs = new InMemoryNotificationJobStore()
    const provider = new FakeWhatsAppProvider({ response: { outcome: 'accepted', messageId: 'wamid.qa.optout' } })

    const { job } = await jobs.createIfAbsent({
      idempotencyKey: 'qa-optout:' + type, type, athleteId: 'qa', reference: 'optout-fixture',
    }, 1000)

    const payment = { total: 500, amountPaid: 200, balance: 300, installments: [{ amount: 200 }] }
    const paymentBefore = structuredClone(payment)

    const optedIn = Object.freeze({
      receiptStatus: 'opted-in', reminderStatus: 'opted-in',
      consentedAt: 900, recordedBy: 'qa-staff',
      history: Object.freeze([{ kind: 'consent', at: 900 }]),
    })

    const preferenceBefore = structuredClone(optedIn)
    const patch = buildOptOutPatch(' no   recibir ', 1001)

    assert.ok(patch)

    const preference = { ...optedIn, ...patch }

    const data: NotificationDataSource = {
      readEligibility: async currentJob => {
        const status = currentJob.type === 'payment-receipt' ? preference.receiptStatus : preference.reminderStatus

        return status === 'opted-out'
          ? { eligible: false, reason: 'opted-out' }
          : { eligible: true, recipient: '+520000000000' }
      },
      readDocument: async () => { throw new Error('Opted-out fixture must not read a financial document') },
    }

    await processNotificationJob({ jobId: job.jobId, jobs, data, provider, now: () => 1002, workerId: 'qa-optout' })

    const saved = await jobs.getById(job.jobId)

    assert.equal(saved?.status, 'suppressed')
    assert.equal(saved?.delivery?.attempts['attempt-1'].errorCode, 'OPTED_OUT')
    assert.equal(provider.submittedRequests.length, 0)
    assert.deepEqual(payment, paymentBefore)
    assert.deepEqual(optedIn, preferenceBefore)
    assert.deepEqual(preference.history, preferenceBefore.history)
    assert.equal(preference.consentedAt, preferenceBefore.consentedAt)
    assert.equal(preference.recordedBy, preferenceBefore.recordedBy)
  })
}

test('ambiguous text leaves the in-memory consent eligible and does not suppress a fake receipt', async () => {
  const { input, jobs, job, data, provider } = await setup()
  const optedIn = { receiptStatus: 'opted-in', reminderStatus: 'opted-in' }
  const patch = buildOptOutPatch('NO QUIERO DARME DE BAJA', 1001)

  assert.equal(patch, null)

  const preference = { ...optedIn, ...(patch ?? {}) }

  data.readEligibility = async () => preference.receiptStatus === 'opted-in'
    ? { eligible: true, recipient: '+520000000000' }
    : { eligible: false, reason: 'opted-out' }
  await processNotificationJob(input)

  assert.deepEqual(preference, optedIn)
  assert.equal((await jobs.getById(job.jobId))?.status, 'accepted')
  assert.equal(provider.submittedRequests.length, 1)
})

test('consent is rechecked after document preparation and before dispatch', async () => {
  const { input, jobs, job, data, provider } = await setup()

  data.readDocument = async () => {
    data.readEligibility = async () => ({ eligible: false, reason: 'phone-changed' })

    return document
  }
  await processNotificationJob(input)

  assert.equal((await jobs.getById(job.jobId))?.status, 'suppressed')
  assert.equal(provider.submittedRequests.length, 0)
})

test('unknown submissions do not receive an automatic retry', async () => {
  const { input, jobs, job } = await setup()
  const provider = new FakeWhatsAppProvider({ response: { outcome: 'unknown', errorCode: 'RAW_PRIVATE_DATA' } })

  await processNotificationJob({ ...input, provider })
  await processNotificationJob({ ...input, provider, now: () => 90_000 })

  assert.equal((await jobs.getById(job.jobId))?.status, 'unknown')
  assert.equal(provider.submittedRequests.length, 1)
  assert.equal(JSON.stringify(await jobs.getById(job.jobId)).includes('RAW_PRIVATE_DATA'), false)
})

test('a certain temporary rejection retries only when backoff permits it', async () => {
  const { input, jobs, job, provider } = await setup()
  const rejected = new FakeWhatsAppProvider({ response: { outcome: 'rejected', errorCode: 'RATE_LIMITED' } })

  await processNotificationJob({ ...input, provider: rejected })
  await processNotificationJob({ ...input, now: () => 60_000 })
  assert.equal(provider.submittedRequests.length, 0)
  await processNotificationJob({ ...input, now: () => 61_001 })

  assert.equal(provider.submittedRequests.length, 1)
  assert.equal((await jobs.getById(job.jobId))?.attemptNumber, 2)
  assert.equal(Object.keys((await jobs.getById(job.jobId))!.delivery!.attempts).length, 2)
})

test('a crash after dispatch was reserved becomes unknown instead of resending', async () => {
  const { input, jobs, job, provider } = await setup()

  await jobs.acquireLease(job.jobId, 'crashed-worker', 1000, 100)
  await jobs.startDispatch(job.jobId, 'crashed-worker', 1001, {
    folio: 'MEM-QA-001', templateName: 'payment_receipt_pdf_v1', locale: 'es_MX',
    documentSha256: 'a'.repeat(64), documentBytes: 100,
    recipientHash: 'b'.repeat(64), recipientLast4: '0000',
  })
  await processNotificationJob({ ...input, now: () => 1200 })

  assert.equal((await jobs.getById(job.jobId))?.status, 'unknown')
  assert.equal(provider.submittedRequests.length, 0)
})

test('a stale retry snapshot cannot bypass a newer rejection backoff', async () => {
  const { input, jobs, job, provider } = await setup()
  const rejected = new FakeWhatsAppProvider({ response: { outcome: 'rejected', errorCode: 'RATE_LIMITED' } })

  await processNotificationJob({ ...input, provider: rejected })

  const stale = await jobs.getById(job.jobId)

  await processNotificationJob({ ...input, provider: rejected, now: () => 61_001 })

  const readCurrent = jobs.getById.bind(jobs)

  jobs.getById = async () => stale

  await processNotificationJob({ ...input, now: () => 61_001, workerId: 'stale-reader' })

  assert.equal(provider.submittedRequests.length, 0)
  assert.equal((await readCurrent(job.jobId))?.attemptNumber, 2)
  assert.equal((await readCurrent(job.jobId))?.status, 'retryable-failed')
})

test('failure before dispatch is sanitized and cannot change the financial document', async () => {
  const { input, jobs, job, data, provider } = await setup()

  data.readDocument = async () => { throw new Error('PRIVATE_DOCUMENT_DETAIL') }
  await processNotificationJob(input)

  assert.equal((await jobs.getById(job.jobId))?.status, 'retryable-failed')
  assert.equal(JSON.stringify(await jobs.getById(job.jobId)).includes('PRIVATE_DOCUMENT_DETAIL'), false)
  assert.equal(provider.submittedRequests.length, 0)
  assert.equal(document.amountPaid, 500)
})

test('a late acceptance after lease recovery is retained for webhook reconciliation', async () => {
  const { input, jobs, job, provider } = await setup()

  await jobs.acquireLease(job.jobId, 'slow-worker', 1000, 100)
  await jobs.startDispatch(job.jobId, 'slow-worker', 1001, {
    folio: 'MEM-QA-001', templateName: 'payment_receipt_pdf_v1', locale: 'es_MX',
    documentSha256: 'a'.repeat(64), documentBytes: 100,
    recipientHash: 'b'.repeat(64), recipientLast4: '0000',
  })
  await processNotificationJob({ ...input, now: () => 1200 })
  await jobs.finishDelivery(job.jobId, 'slow-worker', 1300, {
    status: 'accepted', outcome: 'accepted', messageId: 'wamid.qa.late',
  })

  const saved = await jobs.getById(job.jobId)

  assert.equal(saved?.status, 'unknown')
  assert.equal(saved?.providerMessageId, 'wamid.qa.late')
  assert.equal(saved?.delivery?.attempts['attempt-1'].outcome, 'accepted')
  assert.equal(provider.submittedRequests.length, 0)
  await jobs.transition(job.jobId, 'delivered', 1400)
  assert.equal((await jobs.getById(job.jobId))?.status, 'delivered')
})

test('a lease that expires before reserving dispatch cannot send from the stale worker', async () => {
  const { input, data, provider, jobs, job } = await setup()
  let clock = 1001
  data.readDocument = async () => { clock = 62_000

    return document }
  await processNotificationJob({ ...input, now: () => clock })

  assert.equal(provider.submittedRequests.length, 0)
  assert.equal((await jobs.getById(job.jobId))?.delivery, undefined)
})
