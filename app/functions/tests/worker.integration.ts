/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase, RealtimeDatabaseNotificationJobStore } from '../src/notifications/realtime-job-store.ts'
import { processMembershipPaymentWrite, processSaleWrite } from '../src/notifications/triggers.ts'
import { processLocalNotificationJob, runLocalNotificationBatch } from '../src/notifications/local-worker.ts'
import { RealtimeWebhookEventStore } from '../src/whatsapp/realtime-webhook-events.ts'
import { processMetaWebhookEvent } from '../src/whatsapp/webhook.ts'
import { runReminderSweep, RealtimeDatabaseReminderDataSource } from '../src/notifications/reminders.ts'
import { processNotificationJob } from '../src/notifications/worker.ts'
import { RealtimeNotificationDataSource } from '../src/notifications/realtime-notification-data.ts'
import { FakeWhatsAppProvider } from '../src/whatsapp/client.ts'

const now = Date.parse('2026-09-09T15:00:00.000Z')
const qaRollout = { mode: 'qa' as const, athleteId: 'qa' }

const payment = { status: 'pending', totalAmount: 500, balance: 300, installments: {
  one: { id: 'one', amountApplied: 200, balanceAfter: 300, appliedAt: '2026-09-09T15:00:00.000Z' },
} }

const sale = { athleteId: 'qa', status: 'paid', total: 100, payments: {
  combined: { amountApplied: 100, membershipPeriod: '2026-09', membershipInstallmentId: 'one', appliedAt: '2026-09-09T15:00:00.000Z' },
} }

const preference = { athleteId: 'qa', receiptStatus: 'opted-in', reminderStatus: 'opted-in', consentedPhoneE164: '520000000000' }

before(() => {
  assert.match(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '', /^(?:127\.0\.0\.1|localhost):\d+$/)
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
  process.env.KRONOS_NOTIFICATION_WORKER_MODE = 'fake'
  process.env.KRONOS_NOTIFICATION_ROLLOUT_MODE = 'qa'
  process.env.KRONOS_NOTIFICATION_QA_ATHLETE_ID = 'qa'
})

beforeEach(async () => {
  await getNotificationDatabase().ref('v1').set({
    athletes: { qa: { status: 'active', profile: { name: 'Atleta QA', phone: '0000000000' }, membership: { agreedAmount: 500, paymentDay: 9 } } },
    notificationPreferences: { qa: preference },
    payments: { qa: { '2026-09': payment } },
    sales: { sale },
  })
})

after(async () => {
  delete process.env.KRONOS_NOTIFICATION_WORKER_MODE
  delete process.env.KRONOS_NOTIFICATION_ROLLOUT_MODE
  delete process.env.KRONOS_NOTIFICATION_QA_ATHLETE_ID
  if (process.env.GCLOUD_PROJECT === 'demo-kronos-training'
    && /^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? ''))
    await deleteApp(getNotificationDatabase().app)
})

test('RTDB combined payment passes through queue, PDF, fake delivery, audit and webhook', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const membership = await processMembershipPaymentWrite({ athleteId: 'qa', period: '2026-09', before: null, after: payment }, jobs, now, qaRollout)
  const combined = await processSaleWrite({ saleId: 'sale', before: { status: 'credit' }, after: sale }, jobs, now, qaRollout)

  assert.equal(membership[0].job.jobId, combined[0].job.jobId)

  const jobId = membership[0].job.jobId

  await Promise.all([processLocalNotificationJob(jobId, () => now), processLocalNotificationJob(jobId, () => now)])

  const sent = await jobs.getById(jobId)

  assert.equal(sent?.status, 'accepted')
  assert.equal(sent?.attemptNumber, 1)
  assert.equal(Object.keys(sent!.delivery!.attempts).length, 1)
  assert.ok((sent?.delivery?.attempts['attempt-1'].metadata?.documentBytes ?? 0) > 100)
  assert.equal(JSON.stringify(sent).includes('520000000000'), false)
  assert.equal(JSON.stringify(sent).includes('Atleta QA'), false)

  await processMetaWebhookEvent({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    statuses: [{ id: sent!.providerMessageId, status: 'read' }],
  } }] }] }, new RealtimeWebhookEventStore(), jobs, now + 1000)

  const delivered = await jobs.getById(jobId)

  assert.equal(delivered?.status, 'read')
  assert.deepEqual(delivered?.delivery, sent?.delivery)
  assert.deepEqual((await getNotificationDatabase().ref('v1/payments/qa/2026-09').get()).val(), payment)
  assert.deepEqual((await getNotificationDatabase().ref('v1/sales/sale').get()).val(), sale)
})

test('RTDB opt-out after enqueue suppresses the job and preserves financial data', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const result = await processMembershipPaymentWrite({ athleteId: 'qa', period: '2026-09', before: null, after: payment }, jobs, now, qaRollout)

  await getNotificationDatabase().ref('v1/notificationPreferences/qa/receiptStatus').set('opted-out')
  await processLocalNotificationJob(result[0].job.jobId, () => now)

  const job = await jobs.getById(result[0].job.jobId)

  assert.equal(job?.status, 'suppressed')
  assert.equal(job?.providerMessageId, undefined)
  assert.equal(job?.delivery?.attempts['attempt-1'].errorCode, 'OPTED_OUT')
  assert.deepEqual((await getNotificationDatabase().ref('v1/payments/qa/2026-09').get()).val(), payment)
})

test('RTDB phone changes invalidate the queued consent', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const result = await processMembershipPaymentWrite({ athleteId: 'qa', period: '2026-09', before: null, after: payment }, jobs, now, qaRollout)

  await getNotificationDatabase().ref('v1/athletes/qa/profile/phone').set('0000000001')
  await runLocalNotificationBatch({ now: () => now })

  assert.equal((await jobs.getById(result[0].job.jobId))?.delivery?.attempts['attempt-1'].errorCode, 'PHONE_CHANGED')
})

test('RTDB scheduler and batch runner complete one informational reminder for the day', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const snapshot = await new RealtimeDatabaseReminderDataSource().read()
  const sweep = await runReminderSweep({ jobs, snapshot, now, rollout: qaRollout })

  await runReminderSweep({ jobs, snapshot, now, rollout: qaRollout })
  await runLocalNotificationBatch({ now: () => now })

  const job = await jobs.getById(sweep.enqueued[0].job.jobId)

  assert.equal((await getNotificationDatabase().ref('v1/notificationJobs').get()).numChildren(), 1)
  assert.equal(job?.status, 'accepted')
  assert.equal(job?.delivery?.attempts['attempt-1'].metadata?.templateName, 'payment_reminder_pdf_v1')
})

test('RTDB retains both attempts and respects retry backoff across worker instances', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const [created] = await processMembershipPaymentWrite({ athleteId: 'qa', period: '2026-09', before: null, after: payment }, jobs, now, qaRollout)
  const rejected = new FakeWhatsAppProvider({ response: { outcome: 'rejected', errorCode: 'RATE_LIMITED' } })

  await processNotificationJob({ jobId: created.job.jobId, jobs, data: new RealtimeNotificationDataSource(),
    provider: rejected, workerId: 'qa-rejected', now: () => now })
  await processLocalNotificationJob(created.job.jobId, () => now + 30_000)
  assert.equal((await jobs.getById(created.job.jobId))?.status, 'retryable-failed')
  await processLocalNotificationJob(created.job.jobId, () => now + 60_001)

  const saved = await jobs.getById(created.job.jobId)

  assert.equal(saved?.status, 'accepted')
  assert.equal(saved?.attemptNumber, 2)
  assert.deepEqual(Object.keys(saved!.delivery!.attempts), ['attempt-1', 'attempt-2'])
  assert.equal(saved?.delivery?.attempts['attempt-1'].outcome, 'rejected')
  assert.equal(saved?.delivery?.attempts['attempt-2'].outcome, 'accepted')
})

test('RTDB atomically rejects a lease based on an outdated retry snapshot', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const [created] = await processMembershipPaymentWrite({ athleteId: 'qa', period: '2026-09', before: null, after: payment }, jobs, now, qaRollout)
  const rejected = new FakeWhatsAppProvider({ response: { outcome: 'rejected', errorCode: 'RATE_LIMITED' } })
  const accepted = new FakeWhatsAppProvider({ response: { outcome: 'accepted', messageId: 'wamid.qa.must-not-send' } })
  const input = { jobId: created.job.jobId, jobs, data: new RealtimeNotificationDataSource(), provider: rejected, workerId: 'qa-first', now: () => now }

  await processNotificationJob(input)

  const stale = await jobs.getById(created.job.jobId)

  await processNotificationJob({ ...input, workerId: 'qa-second', now: () => now + 60_001 })

  const readCurrent = jobs.getById.bind(jobs)

  jobs.getById = async () => stale
  await processNotificationJob({ ...input, workerId: 'qa-stale', now: () => now + 60_001, provider: accepted })

  assert.equal(accepted.submittedRequests.length, 0)
  assert.equal((await readCurrent(created.job.jobId))?.attemptNumber, 2)
  assert.equal((await readCurrent(created.job.jobId))?.status, 'retryable-failed')
})
