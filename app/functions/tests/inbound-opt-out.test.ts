/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import { getLocalOptOutConfig, parseInboundOptOut } from '../src/whatsapp/inbound-opt-out.ts'

const now = Date.UTC(2026, 8, 9)
const config = { accountId: 'qa-business', phoneNumberId: 'qa-number' }

const environment = {
  KRONOS_WHATSAPP_OPT_OUT_MODE: 'local', KRONOS_NOTIFICATION_WORKER_MODE: 'fake',
  GCLOUD_PROJECT: 'demo-kronos-training', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9010',
  KRONOS_WHATSAPP_QA_ACCOUNT_ID: config.accountId, KRONOS_WHATSAPP_QA_NUMBER_ID: config.phoneNumberId,
}

const message = (overrides = {}) => ({
  id: 'wamid.qa.1', from: '520000000001', timestamp: String(now / 1000), type: 'text', text: { body: 'BAJA' }, ...overrides,
})

const payload = (messages: unknown = [message()], accountId = config.accountId, phoneNumberId = config.phoneNumberId) => ({
  object: 'whatsapp_business_account', entry: [{ id: accountId, changes: [{ field: 'messages', value: {
    // eslint-disable-next-line camelcase -- Preserve the inbound wire contract.
    metadata: { phone_number_id: phoneNumberId }, messages,
  } }] }],
})

const parse = (value: unknown, bytes = 1000) => parseInboundOptOut(value, config, now, bytes)

test('opt-out guard requires explicit local fake demo loopback and fictitious receiver IDs', () => {
  assert.deepEqual(getLocalOptOutConfig(environment), config)
  assert.equal(getLocalOptOutConfig({}), null)
  for (const overrides of [
    { KRONOS_WHATSAPP_OPT_OUT_MODE: '' },
    { KRONOS_NOTIFICATION_WORKER_MODE: 'real' },
    { GCLOUD_PROJECT: 'production' },
    { FIREBASE_DATABASE_EMULATOR_HOST: 'localhost.evil:9010' },
    { FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:0' },
    { FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:65536' },
    { KRONOS_WHATSAPP_QA_ACCOUNT_ID: 'real-account' },
    { KRONOS_WHATSAPP_QA_NUMBER_ID: '' },
  ]) assert.equal(getLocalOptOutConfig({ ...environment, ...overrides }), null)
})

test('valid local messages produce stable private keys scoped to account and receiver', () => {
  const result = parse(payload())

  assert.equal(result.status, 'valid')
  if (result.status !== 'valid') throw new Error('Expected valid fixture')
  assert.equal(result.events.length, 1)
  assert.match(result.events[0].eventKey, /^[a-f0-9]{64}$/)
  assert.equal(result.events[0].senderPhone, '520000000001')
  assert.equal(result.events[0].eventAt, now)
  assert.equal(result.events[0].keyword, 'BAJA')
  assert.deepEqual(parse(payload()), result)
  assert.notDeepEqual(parse(payload([message({ id: 'wamid.qa.2' })])), result)
})

test('wrong receiver, identity, timestamp and malformed batch reject the whole opt-out batch', () => {
  for (const value of [
    payload(undefined, 'qa-other'),
    payload(undefined, undefined, 'qa-other'),
    payload({}),
    payload([message(), message({ from: '+520000000001' })]),
    payload([message({ id: '../bad' })]),
    payload([message({ timestamp: now / 1000 })]),
    payload([message({ timestamp: 'NaN' })]),
    payload([message({ timestamp: String(now / 1000 + 1) })]),
    payload([message({ text: null })]),
  ]) assert.equal(parse(value).status, 'invalid')
})

test('ambiguous text, media and expired messages do not generate a withdrawal', () => {
  for (const item of [
    message({ text: { body: 'NO QUIERO DARME DE BAJA' } }),
    message({ text: { body: 'ALTA' } }),
    message({ type: 'image', text: undefined }),
    message({ text: { body: 'STOP!' } }),
    message({ timestamp: String(now / 1000 - 30 * 86400 - 1) }),
  ]) assert.deepEqual(parse(payload([item])), { status: 'valid', events: [] })
})

test('enforces 64 KiB and 100 message caps only on inbound batches', () => {
  assert.equal(parse(payload(), 65536).status, 'valid')
  assert.equal(parse(payload(), 65537).status, 'invalid')
  assert.equal(parse(payload(Array.from({ length: 100 }, () => message()))).status, 'valid')
  assert.equal(parse(payload(Array.from({ length: 101 }, () => message()))).status, 'invalid')
  assert.deepEqual(parse({ object: 'whatsapp_business_account', entry: [] }, 65537), { status: 'no-messages' })
  assert.deepEqual(parse(null), { status: 'no-messages' })
})
