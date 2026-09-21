/* eslint-disable import/extensions, camelcase -- Node tests and provider wire-format fixtures. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { decideProviderStatus, type NotificationJob } from '../src/notifications/jobs.ts'
import { parseStatusInbox, statusInboxRetentionMs } from '../src/whatsapp/status-inbox.ts'

const config = { accountId: 'qa-business', phoneNumberId: 'qa-number' }
const now = Date.UTC(2026, 8, 9)

const job: NotificationJob = {
  jobId: 'job-' + 'a'.repeat(32), idempotencyKey: 'sale-initial:qa-inbox',
  athleteId: 'qa-inbox-athlete', type: 'payment-receipt', status: 'accepted',
  providerMessageId: 'wamid.qa.early', attemptNumber: 1, createdAt: now, updatedAt: now, lock: null,
}

test('provider status waits for correlation and accepted state, then advances without changing attempts', () => {
  for (const current of [null,
    { ...job, providerMessageId: 'wamid.qa.other' },
    { ...job, status: 'queued' as const },
    { ...job, status: 'processing' as const }])
    assert.equal(decideProviderStatus(current, 'wamid.qa.early', 'delivered', now).completed, false)
  const next = decideProviderStatus(job, 'wamid.qa.early', 'delivered', now + 1000)

  assert.equal(next.completed, true)
  assert.deepEqual(next.job, { ...job, status: 'delivered', updatedAt: now + 1000 })
})
test('late status never regresses read and unknown requires an exact known message id', () => {
  const read = { ...job, status: 'read' as const, updatedAt: now + 5000 }

  assert.deepEqual(decideProviderStatus(read, 'wamid.qa.early', 'sent', now), { completed: true, job: read })
  assert.equal(decideProviderStatus({ ...job, status: 'unknown' }, 'wamid.qa.early', 'read', now).job?.status, 'read')
  assert.equal(decideProviderStatus({ ...job, status: 'unknown', providerMessageId: undefined }, 'wamid.qa.early', 'read', now).completed, false)
})
function payload(statuses: unknown[] = [{ id: 'wamid.qa.early', status: 'delivered', timestamp: String(now / 1000) }]) {
  return { object: 'whatsapp_business_account', entry: [{ id: config.accountId, changes: [{
    field: 'messages', value: { metadata: { phone_number_id: config.phoneNumberId }, statuses },
  }] }] }
}
function parse(body: unknown, at = now, size = 1000) {
  return parseStatusInbox(body, config, at, size)
}
test('inbox retains only minimal canonical data with stable scoped keys and a fixed expiry', () => {
  const body = payload([{ id: 'wamid.qa.early', status: 'read', timestamp: String(now / 1000),
    recipient_id: '520000000008', errors: [{ message: 'must never persist' }] }])

  const first = parse(body)
  const later = parse(body, now + 10000)

  assert.equal(first.status, 'valid')
  assert.equal(later.status, 'valid')
  if (first.status !== 'valid' || later.status !== 'valid') throw new Error('Expected valid')
  assert.match(first.events[0]!.eventKey, /^[a-f0-9]{64}$/)
  assert.equal(first.events[0]!.eventKey, later.events[0]!.eventKey)
  assert.equal(first.events[0]!.record.expiresAt, now + statusInboxRetentionMs)
  assert.equal(later.events[0]!.record.expiresAt, first.events[0]!.record.expiresAt)
  assert.deepEqual(Object.keys(first.events[0]!.record).sort(),
    ['providerMessageId', 'messageKey', 'providerStatus', 'retryable', 'eventAt', 'receivedAt', 'expiresAt', 'processingStatus'].sort())
  assert.equal(JSON.stringify(first).includes('520000000008'), false)
  assert.equal(JSON.stringify(first).includes('must never persist'), false)
})
test('inbox rejects wrong envelope, account, receiver and an invalid item anywhere in a batch', () => {
  for (const body of [null,
    {},
    { ...payload(), object: 'other' },
    { ...payload(), entry: [{ ...payload().entry[0], id: 'qa-other' }] },
    payload([{ id: 'wamid.qa.early', status: 'delivered', timestamp: String(now / 1000) }, { status: 'read' }]),
    payload([{ id: 'wamid.qa.early', status: ['read'], timestamp: String(now / 1000) }])])
    assert.equal(parse(body).status, 'invalid')
  const wrong = payload()

  wrong.entry[0]!.changes[0]!.value.metadata.phone_number_id = 'qa-other'
  assert.equal(parse(wrong).status, 'invalid')
})
test('inbox bounds messages, nesting, size, identifiers and integer timestamps', () => {
  assert.equal(parse(payload(), now, 65537).status, 'invalid')
  assert.equal(parse({ ...payload(), entry: Array(101).fill(payload().entry[0]) }).status, 'invalid')
  assert.equal(parse(payload(Array(101).fill({ id: 'wamid.qa.a', status: 'sent', timestamp: String(now / 1000) }))).status, 'invalid')
  for (const timestamp of ['NaN', '-1', '1.5', String(now / 1000 + 1), '9999999999999'])
    assert.equal(parse(payload([{ id: 'wamid.qa.a', status: 'sent', timestamp }])).status, 'invalid')
  for (const id of ['bad/id', 'wamid.' + 'a'.repeat(501)])
    assert.equal(parse(payload([{ id, status: 'sent', timestamp: String(now / 1000) }])).status, 'invalid')
})
test('expired events are accepted without retention or application', () => {
  const result = parse(payload(), now + statusInboxRetentionMs)

  assert.deepEqual(result, { status: 'valid', events: [] })
})
test('inbox preserves existing failure classification without raw provider errors', () => {
  const result = parse(payload([{ id: 'wamid.qa.a', status: 'failed', timestamp: String(now / 1000),
    errors: [{ code: 'temporary', message: 'private' }] }]))

  assert.equal(result.status, 'valid')
  if (result.status !== 'valid') throw new Error('Expected valid')
  assert.equal(result.events[0]!.record.retryable, true)
})
test('message-only envelopes are validated but routed independently from statuses', () => {
  const body = payload()
  const value = body.entry[0]!.changes[0]!.value as Record<string, unknown>

  delete value.statuses
  value.messages = [{ type: 'text' }]
  assert.deepEqual(parse(body), { status: 'no-statuses' })
  body.entry[0]!.id = 'qa-other'
  assert.equal(parse(body).status, 'invalid')
})
