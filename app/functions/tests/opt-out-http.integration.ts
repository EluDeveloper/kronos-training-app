/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { after, before, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase, RealtimeDatabaseNotificationJobStore } from '../src/notifications/realtime-job-store.ts'
import { whatsappWebhook } from '../src/whatsapp/http.ts'
import { parseInboundOptOut } from '../src/whatsapp/inbound-opt-out.ts'
import { processNotificationJob } from '../src/notifications/worker.ts'
import { RealtimeNotificationDataSource } from '../src/notifications/realtime-notification-data.ts'
import { FakeWhatsAppProvider } from '../src/whatsapp/client.ts'
import { processMembershipPaymentWrite } from '../src/notifications/triggers.ts'

const now = Date.UTC(2026, 8, 9)
const secret = 'qa-only-synthetic-not-for-production'
const config = { accountId: 'qa-business', phoneNumberId: 'qa-number' }
const id = 'qa-optout-http'
const db = () => getNotificationDatabase()
const jobs = new RealtimeDatabaseNotificationJobStore()
const ownedJobs = new Set<string>()
const ownedEvents = new Set<string>()
const ownedStatusEvents = new Set<string>()

const payload = (body = 'BAJA', overrides = {}) => ({ object: 'whatsapp_business_account', entry: [{ id: config.accountId, changes: [{ field: 'messages', value: {
  // eslint-disable-next-line camelcase -- Preserve the inbound wire contract.
  metadata: { phone_number_id: config.phoneNumberId }, messages: [{ id: `wamid.qa.${body.replaceAll(' ', '_')}`, from: '520000000007', timestamp: String(now / 1000), type: 'text', text: { body }, ...overrides }],
} }] }] })

const payment = { status: 'pending', totalAmount: 500, balance: 300, installments: {
  one: { id: 'one', amountApplied: 200, balanceAfter: 300, appliedAt: new Date(now).toISOString() },
} }

// Exercise the actual onRequest handler; a separate smoke test covers Functions HTTP transport.
async function request(value: unknown, signature?: string, method = 'POST') {
  const rawBody = Buffer.from(JSON.stringify(value))
  const hash = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const parsed = parseInboundOptOut(value, config, Date.now(), rawBody.length)
  if (parsed.status === 'valid') for (const item of parsed.events) ownedEvents.add(item.eventKey)
  const result = { code: 0, body: null as unknown }

  const response = { status(code: number) { result.code = code

    return this }, json(body: unknown) { result.body = body }, send(body: unknown) { result.body = body } }

  await whatsappWebhook({ method, body: value, rawBody, headers: {}, query: {}, header: (name: string) => {
    if (name === 'content-type') return 'application/json'

    return name === 'x-hub-signature-256' ? signature ?? hash : undefined
  } } as unknown as Parameters<typeof whatsappWebhook>[0], response as unknown as Parameters<typeof whatsappWebhook>[1])

  return result
}
async function consent() {
  await db().ref(`v1/notificationPreferences/${id}`).set({ athleteId: id, receiptStatus: 'opted-in', reminderStatus: 'opted-in',
    consentedPhoneE164: '520000000007', consentedAt: now - 10000, createdAt: now - 10000, updatedAt: now - 10000,
    consentSource: 'staff', recordedBy: 'qa-operator', updatedBy: 'qa-operator' })
}
before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  process.env.KRONOS_NOTIFICATION_WORKER_MODE = 'fake'
  process.env.KRONOS_WHATSAPP_OPT_OUT_MODE = 'local'
  process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = 'local'
  process.env.KRONOS_WHATSAPP_QA_ACCOUNT_ID = config.accountId
  process.env.KRONOS_WHATSAPP_QA_NUMBER_ID = config.phoneNumberId
  process.env.WHATSAPP_APP_SECRET = secret
  await db().ref(`v1/athletes/${id}`).set({ status: 'active', profile: { name: 'QA opt-out HTTP', phone: '0000000007' }, membership: { agreedAmount: 500, paymentDay: 9 } })
  await db().ref(`v1/payments/${id}/2026-09`).set(payment)
  await consent()
})
after(async () => {
  for (const path of [`v1/athletes/${id}`,
    `v1/payments/${id}`,
    `v1/notificationPreferences/${id}`,
    ...Array.from(ownedJobs, key => `v1/notificationJobs/${key}`),
    ...Array.from(ownedEvents, key => `v1/notificationOptOutEvents/${key}`),
    ...Array.from(ownedStatusEvents, key => `v1/notificationWebhookEvents/${key}`)])
    await db().ref(path).remove()
  delete process.env.KRONOS_NOTIFICATION_WORKER_MODE
  delete process.env.KRONOS_WHATSAPP_OPT_OUT_MODE
  delete process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE
  delete process.env.KRONOS_WHATSAPP_QA_ACCOUNT_ID
  delete process.env.KRONOS_WHATSAPP_QA_NUMBER_ID
  delete process.env.WHATSAPP_APP_SECRET
  await deleteApp(db().app)
})

test('HTTP rejects invalid signature and malformed receiver before preference writes', async () => {
  const originalConsent = (await db().ref(`v1/notificationPreferences/${id}`).get()).val()

  assert.equal((await request(payload(), 'sha256=invalid')).code, 401)
  assert.equal((await request(payload('BAJA', { from: '+520000000007' }))).code, 400)
  assert.equal((await request(payload(), undefined, 'DELETE')).code, 405)
  assert.deepEqual((await db().ref(`v1/notificationPreferences/${id}`).get()).val(), originalConsent)
})

test('signed local opt-out suppresses receipt and reminder with no fake calls and unchanged money', async () => {
  const response = await request(payload())

  assert.equal(response.code, 200)
  assert.equal((await db().ref(`v1/notificationPreferences/${id}/receiptStatus`).get()).val(), 'opted-out')
  for (const type of ['payment-receipt', 'payment-reminder'] as const) {
    const queued = await jobs.createIfAbsent({ idempotencyKey: `qa-optout-${type}`, type, athleteId: id, reference: 'membership:2026-09:one' }, now)

    ownedJobs.add(queued.job.jobId)

    const provider = new FakeWhatsAppProvider({ response: { outcome: 'accepted', messageId: 'wamid.fake.qa' } })

    await processNotificationJob({ jobId: queued.job.jobId, workerId: 'qa-optout-worker', jobs,
      data: new RealtimeNotificationDataSource(), provider, now: () => now })
    assert.equal((await jobs.getById(queued.job.jobId))?.status, 'suppressed')
    assert.equal(provider.submittedRequests.length, 0)
  }
  assert.deepEqual((await db().ref(`v1/payments/${id}/2026-09`).get()).val(), payment)
})

test('ambiguous text is acknowledged without withdrawing consent; disabled mode preserves legacy behavior', async () => {
  await consent()
  assert.equal((await request(payload('NO QUIERO DARME DE BAJA'))).code, 200)
  assert.equal((await db().ref(`v1/notificationPreferences/${id}/receiptStatus`).get()).val(), 'opted-in')

  const queued = (await processMembershipPaymentWrite(
    { athleteId: id, period: '2026-09', before: null, after: payment },
    jobs,
    now,
    { mode: 'qa', athleteId: id },
  ))[0]

  ownedJobs.add(queued.job.jobId)

  const provider = new FakeWhatsAppProvider({ response: { outcome: 'accepted', messageId: 'wamid.fake.control' } })

  await processNotificationJob({ jobId: queued.job.jobId, workerId: 'qa-control', jobs,
    data: new RealtimeNotificationDataSource(), provider, now: () => now })
  assert.equal(provider.submittedRequests.length, 1)
  assert.equal((await jobs.getById(queued.job.jobId))?.status, 'accepted')
  process.env.KRONOS_WHATSAPP_OPT_OUT_MODE = ''
  assert.equal((await request(payload('STOP'))).code, 400)
  assert.equal((await db().ref(`v1/notificationPreferences/${id}/receiptStatus`).get()).val(), 'opted-in')
  process.env.KRONOS_WHATSAPP_OPT_OUT_MODE = 'local'
})

test('mixed status and opt-out envelope advances delivery and tolerates its duplicate', async () => {
  const queued = await jobs.createIfAbsent({ idempotencyKey: 'qa-optout-mixed', type: 'payment-receipt', athleteId: id, reference: 'qa-mixed' }, now)

  ownedJobs.add(queued.job.jobId)
  await jobs.acquireLease(queued.job.jobId, 'qa-mixed-worker', now, 60000)
  await jobs.setProviderMessageId(queued.job.jobId, 'wamid.fake.mixed', now)
  await jobs.transition(queued.job.jobId, 'accepted', now)

  const mixed = payload('CANCELAR')
  const value = mixed.entry[0].changes[0].value as Record<string, unknown>

  value.statuses = [{ id: 'wamid.fake.mixed', status: 'read', timestamp: String(now / 1000) }]
  ownedStatusEvents.add(createHash('sha256').update(`wamid.fake.mixed:read:${now / 1000}`).digest('hex'))
  assert.equal((await request(mixed)).code, 200)
  assert.equal((await jobs.getById(queued.job.jobId))?.status, 'read')
  assert.equal((await db().ref(`v1/notificationPreferences/${id}/receiptStatus`).get()).val(), 'opted-out')
  assert.equal((await request(mixed)).code, 200)
  assert.equal((await jobs.getById(queued.job.jobId))?.status, 'read')
})

test('unorderable consent produces a generic retry error, never a false success', async () => {
  await consent()
  await db().ref(`v1/notificationPreferences/${id}/consentedAt`).set('invalid-date')

  const result = await request(payload('NO RECIBIR'))

  assert.deepEqual(result, { code: 500, body: { status: 'temporary-error' } })
  assert.equal((await db().ref(`v1/notificationPreferences/${id}/receiptStatus`).get()).val(), 'opted-in')
})
