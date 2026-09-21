/* eslint-disable import/extensions, camelcase -- Synthetic wire-format fixtures use provider field names. */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, before, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase, RealtimeDatabaseNotificationJobStore } from '../src/notifications/realtime-job-store.ts'
import { whatsappWebhook } from '../src/whatsapp/http.ts'
import { inboxScope, parseStatusInbox } from '../src/whatsapp/status-inbox.ts'
import { RealtimeStatusInbox } from '../src/whatsapp/realtime-status-inbox.ts'
import { parseInboundOptOut } from '../src/whatsapp/inbound-opt-out.ts'

const now = Date.UTC(2026, 8, 9)
const config = { accountId: 'qa-inbox-http', phoneNumberId: 'qa-number' }
const secret = 'qa-only-synthetic-not-for-production'
const id = 'qa-inbox-http-athlete'
const owned = new Set<string>()
const ownedJobs = new Set<string>()
const marks = new Set<string>()
const db = () => getNotificationDatabase()
const root = () => db().ref('v1/notificationStatusInbox/' + inboxScope(config))

const preference = { athleteId: id, receiptStatus: 'opted-in', reminderStatus: 'opted-in',
  consentedPhoneE164: '520000000009', consentedAt: now - 1000, createdAt: now - 1000, updatedAt: now - 1000,
  consentSource: 'staff', recordedBy: 'qa-staff', updatedBy: 'qa-staff' }

function payload(suffix: string, extra = {}) {
  return { object: 'whatsapp_business_account', entry: [{ id: config.accountId, changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: config.phoneNumberId }, statuses: [
      { id: 'wamid.qa.' + suffix, status: 'delivered', timestamp: String(now / 1000) },
    ], ...extra,
  } }] }] }
}
function baja() {
  return [{ id: 'wamid.qa.inbox-baja', from: '520000000009', type: 'text', timestamp: String(now / 1000), text: { body: 'BAJA' } }]
}
async function request(body: unknown, options: { signature?: string; parsedBody?: unknown } = {}) {
  const rawBody = Buffer.from(JSON.stringify(body))
  const signature = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
  const parsed = parseStatusInbox(body, config, Date.now(), rawBody.length)
  if (parsed.status === 'valid') for (const item of parsed.events) owned.add(item.eventKey)
  const optout = parseInboundOptOut(body, config, Date.now(), rawBody.length)
  if (optout.status === 'valid') for (const item of optout.events) marks.add(item.eventKey)
  const result = { code: 0, body: null as unknown }

  const response = {
    status(code: number) { result.code = code

      return this },
    json(value: unknown) { result.body = value }, send(value: unknown) { result.body = value },
  }

  await whatsappWebhook({ method: 'POST', rawBody, body: options.parsedBody ?? body, query: {},
    header: (name: string) => name === 'content-type' ? 'application/json' : options.signature ?? signature } as unknown as Parameters<typeof whatsappWebhook>[0],
  response as unknown as Parameters<typeof whatsappWebhook>[1])

  return result
}
before(async () => {
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
  process.env.KRONOS_NOTIFICATION_WORKER_MODE = 'fake'
  process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = 'local'
  process.env.KRONOS_WHATSAPP_OPT_OUT_MODE = 'local'
  process.env.KRONOS_WHATSAPP_QA_ACCOUNT_ID = config.accountId
  process.env.KRONOS_WHATSAPP_QA_NUMBER_ID = config.phoneNumberId
  process.env.WHATSAPP_APP_SECRET = secret
  await db().ref('v1/notificationPreferences/' + id).set(preference)
})
after(async () => {
  for (const key of ownedJobs) await db().ref('v1/notificationJobs/' + key).remove()
  for (const key of owned) await root().child(key).remove()
  for (const key of marks) await db().ref('v1/notificationOptOutEvents/' + key).remove()
  await db().ref('v1/notificationPreferences/' + id).remove()
  await deleteApp(db().app)
})
test('HTTP persists unknown statuses before acknowledgement, using the authenticated bytes only', async () => {
  const body = payload('http-early')

  assert.deepEqual(await request(body, { parsedBody: { poisoned: true } }), { code: 200, body: { status: 'processed' } })

  const parsed = parseStatusInbox(body, config, Date.now(), 1000)
  if (parsed.status !== 'valid') throw new Error('Invalid fixture')
  const saved = (await root().child(parsed.events[0]!.eventKey).get()).val()

  assert.equal(saved.processingStatus, 'pending')
  assert.equal(saved.providerMessageId, 'wamid.qa.http-early')
})
test('HTTP validates the complete mixed batch before any opt-out or inbox writes', async () => {
  const badStatus = payload('bad-status', { messages: baja(), statuses: [{ id: 'wamid.qa.bad', status: 'read', timestamp: 'future' }] })
  const original = (await root().get()).val()

  assert.equal((await request(badStatus)).code, 400)
  assert.deepEqual((await root().get()).val(), original)
  assert.deepEqual((await db().ref('v1/notificationPreferences/' + id).get()).val(), preference)

  const badBaja = payload('bad-baja', { messages: [{ ...baja()[0], from: 'invalid' }] })

  assert.equal((await request(badBaja)).code, 400)
  assert.deepEqual((await root().get()).val(), original)
  assert.equal((await request(payload('bad-signature'), { signature: 'sha256=invalid' })).code, 401)

  const wrongAccount = payload('wrong-account')

  wrongAccount.entry[0]!.id = 'qa-other'
  assert.equal((await request(wrongAccount)).code, 400)
})
test('persistence failure returns generic 500, never false success', async () => {
  const original = RealtimeStatusInbox.prototype.enqueue

  RealtimeStatusInbox.prototype.enqueue = async () => { throw new Error('private details must not leak') }
  try {
    assert.deepEqual(await request(payload('failed-write')), { code: 500, body: { status: 'temporary-error' } })
  } finally {
    RealtimeStatusInbox.prototype.enqueue = original
  }
})
test('contradictory duplicate statuses reject the whole batch without job, inbox or consent changes', async () => {
  const jobs = new RealtimeDatabaseNotificationJobStore()
  const { job } = await jobs.createIfAbsent({ athleteId: id, type: 'payment-receipt', idempotencyKey: 'qa-inbox-contradiction', reference: 'qa-reference' }, now)

  ownedJobs.add(job.jobId)
  await jobs.acquireLease(job.jobId, 'qa-worker', now, 60000)
  await jobs.setProviderMessageId(job.jobId, 'wamid.qa.contradiction', now)
  await jobs.transition(job.jobId, 'accepted', now)

  const failed = { id: 'wamid.qa.contradiction', status: 'failed', timestamp: String(now / 1000), errors: [] }
  const single = parseStatusInbox(payload('contradiction', { statuses: [failed] }), config, Date.now(), 1000)
  if (single.status !== 'valid') throw new Error('Invalid fixture')
  owned.add(single.events[0]!.eventKey)

  const originalJob = await jobs.getById(job.jobId)
  const originalInbox = (await root().get()).val()
  const originalConsent = (await db().ref('v1/notificationPreferences/' + id).get()).val()
  const body = payload('contradiction', { messages: baja(), statuses: [failed, { ...failed, errors: [{ code: 'temporary' }] }] })

  assert.deepEqual(await request(body), { code: 400, body: { status: 'invalid-payload' } })
  assert.deepEqual(await jobs.getById(job.jobId), originalJob)
  assert.deepEqual((await root().get()).val(), originalInbox)
  assert.deepEqual((await db().ref('v1/notificationPreferences/' + id).get()).val(), originalConsent)
})

test('valid mixed batch applies BAJA and stores the status; disabled inbox keeps legacy behaviour', async () => {
  assert.equal((await request(payload('mixed', { messages: baja() }))).code, 200)
  assert.equal((await db().ref('v1/notificationPreferences/' + id + '/receiptStatus').get()).val(), 'opted-out')

  const original = (await root().get()).val()

  process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = ''
  try {
    assert.deepEqual(await request(payload('disabled')), { code: 200, body: { status: 'ignored' } })
    assert.deepEqual((await root().get()).val(), original)
  } finally {
    process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = 'local'
  }
})
