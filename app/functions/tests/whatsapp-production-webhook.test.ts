/* eslint-disable import/extensions, camelcase -- Synthetic provider wire-format fixtures use Meta field names. */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import {
  isValidWebhookConfig,
  resolveWhatsAppWebhookRuntime,
} from '../src/whatsapp/webhook-runtime.ts'
import { handleWhatsAppWebhook, whatsappWebhook } from '../src/whatsapp/http.ts'
import { RealtimeOptOutStore } from '../src/whatsapp/realtime-opt-out.ts'
import { RealtimeStatusInbox } from '../src/whatsapp/realtime-status-inbox.ts'
import { inboxScope, parseStatusInbox } from '../src/whatsapp/status-inbox.ts'
import type { getNotificationDatabase } from '../src/notifications/realtime-job-store.ts'
import {
  onNotificationProviderStatusWritten,
  syncNotificationStatusInbox,
} from '../src/whatsapp/local-status-inbox.ts'

const localBase = {
  KRONOS_NOTIFICATION_WORKER_MODE: 'fake',
  GCLOUD_PROJECT: 'demo-kronos-training',
  FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000',
}

const metaBase = {
  KRONOS_NOTIFICATION_WORKER_MODE: 'meta',
  GCLOUD_PROJECT: 'kronos-training-fd5e5',
  KRONOS_WHATSAPP_GRAPH_API_VERSION: 'v23.0',
  KRONOS_WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
  KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321098765',
}

test('webhook runtime is disabled by default and for incomplete production configuration', () => {
  assert.deepEqual(resolveWhatsAppWebhookRuntime({}), {
    mode: 'disabled',
    reason: 'MODE_DISABLED',
  })

  for (const overrides of [
    { KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID: '' },
    { KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID: 'qa-business' },
    { KRONOS_WHATSAPP_PHONE_NUMBER_ID: 'qa-number' },
    { FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:9000' },
  ]) {
    assert.deepEqual(resolveWhatsAppWebhookRuntime({ ...metaBase, ...overrides }), {
      mode: 'disabled',
      reason: 'INVALID_RUNTIME',
    })
  }
})

test('production webhook runtime uses the validated WABA and sender number', () => {
  assert.deepEqual(resolveWhatsAppWebhookRuntime(metaBase), {
    mode: 'meta',
    config: {
      accountId: '987654321098765',
      phoneNumberId: '123456789012345',
    },
    optOutEnabled: true,
    statusEnabled: true,
    legacyStatusEnabled: false,
  })
  assert.equal(isValidWebhookConfig(metaBase), false)
  assert.equal(isValidWebhookConfig({
    accountId: metaBase.KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID,
    phoneNumberId: metaBase.KRONOS_WHATSAPP_PHONE_NUMBER_ID,
  }), true)
  assert.equal(isValidWebhookConfig({ accountId: 'qa-business', phoneNumberId: '123456789' }), false)
})

test('local fake remains limited to demo and loopback, with optional scoped pipelines', () => {
  assert.deepEqual(resolveWhatsAppWebhookRuntime(localBase), {
    mode: 'local-fake',
    config: null,
    optOutEnabled: false,
    statusEnabled: false,
    legacyStatusEnabled: true,
  })

  const scoped = {
    ...localBase,
    KRONOS_WHATSAPP_OPT_OUT_MODE: 'local',
    KRONOS_WHATSAPP_STATUS_INBOX_MODE: 'local',
    KRONOS_WHATSAPP_QA_ACCOUNT_ID: 'qa-business',
    KRONOS_WHATSAPP_QA_NUMBER_ID: 'qa-number',
  }

  assert.deepEqual(resolveWhatsAppWebhookRuntime(scoped), {
    mode: 'local-fake',
    config: { accountId: 'qa-business', phoneNumberId: 'qa-number' },
    optOutEnabled: true,
    statusEnabled: true,
    legacyStatusEnabled: true,
  })

  for (const environment of [
    { ...scoped, GCLOUD_PROJECT: 'kronos-training-fd5e5' },
    { ...scoped, FIREBASE_DATABASE_EMULATOR_HOST: 'example.com:9000' },
    { ...scoped, KRONOS_WHATSAPP_QA_ACCOUNT_ID: '987654321' },
    { ...scoped, KRONOS_WHATSAPP_QA_NUMBER_ID: '' },
  ]) {
    assert.equal(resolveWhatsAppWebhookRuntime(environment).mode, 'disabled')
  }
})

test('HTTP exits before secrets and stores when runtime is disabled', async () => {
  let secretReads = 0
  let storeCreations = 0

  const dependencies = {
    environment: {},
    readVerifyToken: () => { secretReads += 1

      return 'must-not-be-read' },
    readAppSecret: () => { secretReads += 1

      return 'must-not-be-read' },
    createStatusInbox: () => { storeCreations += 1
      throw new Error('must not create status inbox') },
    createOptOutStore: () => { storeCreations += 1
      throw new Error('must not create opt-out store') },
  }

  assert.deepEqual(await invoke({ method: 'POST' }, dependencies), {
    code: 503,
    body: { status: 'webhook-disabled' },
  })
  assert.deepEqual(await invoke({ method: 'DELETE' }, dependencies), {
    code: 405,
    body: { status: 'method-not-allowed' },
  })
  assert.equal(secretReads, 0)
  assert.equal(storeCreations, 0)
})

test('GET reads only the verify token and returns an exact bounded challenge', async () => {
  let verifyReads = 0
  let appSecretReads = 0

  const result = await invoke({
    method: 'GET',
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'synthetic-verify-token',
      'hub.challenge': 'challenge-123',
    },
  }, {
    environment: metaBase,
    readVerifyToken: () => { verifyReads += 1

      return 'synthetic-verify-token' },
    readAppSecret: () => { appSecretReads += 1

      return 'must-not-be-read' },
  })

  assert.deepEqual(result, { code: 200, body: 'challenge-123' })
  assert.equal(verifyReads, 1)
  assert.equal(appSecretReads, 0)
})

test('POST rejects malformed transport before secrets and authenticates raw bytes before JSON', async t => {
  const appSecret = 'synthetic-app-secret-for-tests'
  let appSecretReads = 0
  let storeCreations = 0

  const baseDependencies = {
    environment: metaBase,
    readAppSecret: () => { appSecretReads += 1

      return appSecret },
    createStatusInbox: () => { storeCreations += 1
      throw new Error('must not create status inbox') },
    createOptOutStore: () => { storeCreations += 1
      throw new Error('must not create opt-out store') },
  }

  await t.test('content type', async () => {
    assert.equal((await invoke({
      method: 'POST',
      rawBody: Buffer.from('{}'),
      headers: { 'content-type': 'text/plain' },
    }, baseDependencies)).code, 400)
  })

  await t.test('body limit', async () => {
    assert.equal((await invoke({
      method: 'POST',
      rawBody: Buffer.alloc(65_537, 32),
      headers: { 'content-type': 'application/json' },
    }, baseDependencies)).code, 400)
  })

  assert.equal(appSecretReads, 0)
  assert.equal(storeCreations, 0)

  const payload = statusPayload()
  const rawBody = Buffer.from(JSON.stringify(payload))

  await t.test('invalid signature', async () => {
    assert.equal((await invoke({
      method: 'POST', rawBody,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' },
    }, baseDependencies)).code, 401)
  })
  assert.equal(storeCreations, 0)

  await t.test('authenticated raw body', async () => {
    const enqueued: unknown[] = []

    const result = await invoke({
      method: 'POST', rawBody, body: { poisoned: true },
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-hub-signature-256': sign(rawBody, appSecret),
      },
    }, {
      ...baseDependencies,
      now: () => 1_789_128_000_000,
      createStatusInbox: config => {
        storeCreations += 1
        assert.deepEqual(config, {
          accountId: '987654321098765',
          phoneNumberId: '123456789012345',
        })

        return {
          enqueue: async event => { enqueued.push(event)

            return 'stored' as const },
          reconcile: async () => 'pending' as const,
        }
      },
    })

    assert.deepEqual(result, { code: 200, body: { status: 'processed' } })
    assert.equal(enqueued.length, 1)
  })

  await t.test('wrong account fails before stores', async () => {
    const wrongAccount = statusPayload()

    wrongAccount.entry[0]!.id = '111111111111111'

    const wrongRawBody = Buffer.from(JSON.stringify(wrongAccount))
    const previousCreations = storeCreations

    assert.equal((await invoke({
      method: 'POST', rawBody: wrongRawBody,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sign(wrongRawBody, appSecret),
      },
    }, baseDependencies)).code, 400)
    assert.equal(storeCreations, previousCreations)
  })
})

test('production status inbox persists under the injected scope without local environment flags', async () => {
  const config = {
    accountId: metaBase.KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID,
    phoneNumberId: metaBase.KRONOS_WHATSAPP_PHONE_NUMBER_ID,
  }

  const payload = statusPayload()
  const parsed = parseStatusInbox(payload, config, 1_789_128_000_000, 1_000)

  assert.equal(parsed.status, 'valid')
  if (parsed.status !== 'valid')
    throw new Error('Invalid production status fixture')

  let usedPath = ''
  let stored: unknown = null
  const snapshot = (value: unknown) => ({ val: () => value, exists: () => value !== null })

  const reference = {
    child: () => reference,
    transaction: async (update: (current: unknown) => unknown) => {
      const next = update(stored)
      if (next !== undefined)
        stored = next

      return { committed: next !== undefined, snapshot: snapshot(stored) }
    },
  }

  const database = {
    ref: (path: string) => { usedPath = path

      return reference },
  } as unknown as ReturnType<typeof getNotificationDatabase>

  const inbox = new RealtimeStatusInbox(() => database, config)

  assert.equal(await inbox.enqueue(parsed.events[0]!, 1_789_128_000_000), 'stored')
  assert.equal(usedPath, `v1/notificationStatusInbox/${inboxScope(config)}`)
  assert.deepEqual(stored, parsed.events[0]!.record)
})

test('production opt-out store uses an injected scope while preserving transactional withdrawal', async () => {
  const config = {
    accountId: metaBase.KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID,
    phoneNumberId: metaBase.KRONOS_WHATSAPP_PHONE_NUMBER_ID,
  }

  const event = {
    eventKey: 'a'.repeat(64),
    senderPhone: '520000000001',
    eventAt: 1_000,
    receivedAt: 2_000,
    keyword: 'BAJA' as const,
  }

  let consent: Record<string, unknown> = {
    athleteId: 'production-opt-out',
    receiptStatus: 'opted-in',
    reminderStatus: 'opted-in',
    consentedAt: 0,
    consentedPhoneE164: event.senderPhone,
  }
  let marker: unknown = null
  const snapshot = (value: unknown) => ({ val: () => value, exists: () => value !== null })

  const markerReference = {
    get: async () => snapshot(marker),
    transaction: async (update: (current: unknown) => unknown) => {
      const next = update(marker)
      if (next !== undefined)
        marker = next

      return { committed: next !== undefined, snapshot: snapshot(marker) }
    },
  }

  const match = {
    numChildren: () => 1,
    forEach: (callback: (child: { key: string }) => void) => callback({ key: 'production-opt-out' }),
  }

  const query = {
    orderByChild: () => query,
    equalTo: () => query,
    limitToFirst: () => query,
    get: async () => match,
  }

  const preferenceReference = {
    transaction: async (update: (current: unknown) => unknown) => {
      const next = update(consent)
      if (next !== undefined)
        consent = next as Record<string, unknown>

      return { committed: next !== undefined, snapshot: snapshot(consent) }
    },
  }

  const database = {
    ref: (path: string) => path.includes('/notificationOptOutEvents/')
      ? markerReference
      : path.endsWith('/notificationPreferences')
        ? query
        : preferenceReference,
  } as unknown as ReturnType<typeof getNotificationDatabase>

  const store = new RealtimeOptOutStore(() => database, config)

  assert.equal(await store.process(event), 'applied')
  assert.equal(consent.receiptStatus, 'opted-out')
  assert.equal(consent.reminderStatus, 'opted-out')
  assert.equal((marker as { status: string }).status, 'completed')
})

test('production mixed webhook validates everything before applying status and BAJA', async () => {
  const appSecret = 'synthetic-app-secret-for-tests'
  const payload = statusPayload()
  const value = payload.entry[0]!.changes[0]!.value as Record<string, unknown>

  value.messages = [{
    id: 'wamid.production.optout.1',
    from: '520000000001',
    timestamp: '1789128000',
    type: 'text',
    text: { body: 'BAJA' },
  }]

  const handled = { status: 0, optOut: 0 }

  const dependencies: Parameters<typeof handleWhatsAppWebhook>[2] = {
    environment: metaBase,
    readAppSecret: () => appSecret,
    now: () => 1_789_128_000_000,
    createStatusInbox: () => ({
      enqueue: async () => { handled.status += 1

        return 'stored' },
      reconcile: async () => 'completed',
    }),
    createOptOutStore: () => ({
      process: async () => { handled.optOut += 1

        return 'applied' },
    }),
  }

  const rawBody = Buffer.from(JSON.stringify(payload))

  assert.deepEqual(await invoke({
    method: 'POST', rawBody,
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': sign(rawBody, appSecret),
    },
  }, dependencies), { code: 200, body: { status: 'processed' } })
  assert.deepEqual(handled, { status: 1, optOut: 1 })

  const invalid = structuredClone(payload)
  const invalidValue = invalid.entry[0]!.changes[0]!.value as Record<string, unknown>

  invalidValue.statuses = [{
    id: 'wamid.production.invalid',
    status: 'read',
    timestamp: '9999999999999',
  }]

  const invalidRawBody = Buffer.from(JSON.stringify(invalid))

  assert.deepEqual(await invoke({
    method: 'POST', rawBody: invalidRawBody,
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': sign(invalidRawBody, appSecret),
    },
  }, dependencies), { code: 400, body: { status: 'invalid-payload' } })
  assert.deepEqual(handled, { status: 1, optOut: 1 })
})

test('missing branch secret fails closed before persistence', async () => {
  let storeCreations = 0
  const rawBody = Buffer.from(JSON.stringify(statusPayload()))

  const result = await invoke({
    method: 'POST', rawBody,
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': sign(rawBody, 'unavailable-secret-value'),
    },
  }, {
    environment: metaBase,
    readAppSecret: () => '',
    createStatusInbox: () => { storeCreations += 1
      throw new Error('must not create status inbox') },
    createOptOutStore: () => { storeCreations += 1
      throw new Error('must not create opt-out store') },
  })

  assert.deepEqual(result, { code: 503, body: { status: 'webhook-disabled' } })
  assert.equal(storeCreations, 0)
})

test('deployed webhook exposes one endpoint with only its two secret bindings', () => {
  const endpoint = (whatsappWebhook as unknown as {
    __endpoint: { secretEnvironmentVariables?: Array<{ key: string }>; platform?: string }
  }).__endpoint

  assert.deepEqual(endpoint.secretEnvironmentVariables?.map(secret => secret.key).sort(), [
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  ])
  assert.equal(endpoint.platform, 'gcfv2')
})

test('production status recovery replays an early inbox event after message correlation', async () => {
  const config = {
    accountId: metaBase.KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID,
    phoneNumberId: metaBase.KRONOS_WHATSAPP_PHONE_NUMBER_ID,
  }

  const calls: Array<Record<string, unknown>> = []
  let page = 0

  const result = await syncNotificationStatusInbox('job-' + 'a'.repeat(32), config, {
    readProviderMessageId: async () => 'wamid.production.early.1',
    createInbox: receivedConfig => {
      assert.deepEqual(receivedConfig, config)

      return {
        page: async input => {
          calls.push(input)
          page += 1

          return page === 1
            ? { events: [{ eventKey: 'b'.repeat(64) }], nextCursor: 'b'.repeat(64) }
            : { events: [], nextCursor: null }
        },
        reconcile: async eventKey => { calls.push({ eventKey })

          return 'completed' as const },
      }
    },
    now: () => 1_789_128_000_000,
  })

  assert.deepEqual(result, { status: 'processed', processed: 1 })
  assert.deepEqual(calls, [
    { messageId: 'wamid.production.early.1', afterKey: undefined },
    { eventKey: 'b'.repeat(64) },
    { messageId: 'wamid.production.early.1', afterKey: 'b'.repeat(64) },
  ])
})

test('status recovery keeps one retrying RTDB trigger and no secret bindings', () => {
  const endpoint = (onNotificationProviderStatusWritten as unknown as {
    __endpoint: {
      secretEnvironmentVariables?: Array<{ key: string }>
      eventTrigger?: {
        eventType?: string
        eventFilterPathPatterns?: Record<string, string>
        retry?: boolean
      }
    }
  }).__endpoint

  assert.deepEqual(endpoint.secretEnvironmentVariables ?? [], [])
  assert.equal(endpoint.eventTrigger?.eventType, 'google.firebase.database.ref.v1.written')
  assert.equal(endpoint.eventTrigger?.eventFilterPathPatterns?.ref, 'v1/notificationJobs/{jobId}')
  assert.equal(endpoint.eventTrigger?.retry, true)
})

function statusPayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: '987654321098765',
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: '123456789012345' },
          statuses: [{
            id: 'wamid.production.webhook.1',
            status: 'delivered',
            timestamp: '1789128000',
          }],
        },
      }],
    }],
  }
}

function sign(body: Uint8Array, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

async function invoke(
  input: {
    method: string
    rawBody?: Uint8Array
    body?: unknown
    query?: Record<string, unknown>
    headers?: Record<string, string>
  },
  dependencies: Parameters<typeof handleWhatsAppWebhook>[2],
) {
  const result = { code: 0, body: null as unknown }

  const response = {
    status(code: number) { result.code = code

      return this },
    json(body: unknown) { result.body = body },
    send(body: unknown) { result.body = body },
  }

  await handleWhatsAppWebhook({
    method: input.method,
    rawBody: input.rawBody,
    body: input.body,
    query: input.query ?? {},
    header: name => input.headers?.[name.toLowerCase()],
  }, response, dependencies)

  return result
}
