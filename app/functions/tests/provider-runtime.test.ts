/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createNotificationRuntimeProvider,
  resolveNotificationProviderRuntime,
} from '../src/whatsapp/provider-runtime.ts'
import type { SendTemplateInput } from '../src/whatsapp/client.ts'

const localEnvironment = {
  KRONOS_NOTIFICATION_WORKER_MODE: 'fake',
  GCLOUD_PROJECT: 'demo-kronos-training',
  FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000',
}

const metaEnvironment = {
  KRONOS_NOTIFICATION_WORKER_MODE: 'meta',
  GCLOUD_PROJECT: 'kronos-training-fd5e5',
  KRONOS_WHATSAPP_GRAPH_API_VERSION: 'v23.0',
  KRONOS_WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
}

test('runtime is disabled by default and rejects unknown modes', () => {
  assert.deepEqual(resolveNotificationProviderRuntime({}), {
    mode: 'disabled',
    reason: 'MODE_DISABLED',
  })
  assert.deepEqual(resolveNotificationProviderRuntime({
    KRONOS_NOTIFICATION_WORKER_MODE: 'disabled',
  }), {
    mode: 'disabled',
    reason: 'MODE_DISABLED',
  })
  assert.deepEqual(resolveNotificationProviderRuntime({
    KRONOS_NOTIFICATION_WORKER_MODE: 'real',
  }), {
    mode: 'disabled',
    reason: 'INVALID_RUNTIME',
  })
})

test('legacy fake mode resolves only for demo project and loopback RTDB emulator', () => {
  assert.deepEqual(resolveNotificationProviderRuntime(localEnvironment), {
    mode: 'local-fake',
  })

  for (const overrides of [
    { GCLOUD_PROJECT: 'kronos-training-fd5e5' },
    { FIREBASE_DATABASE_EMULATOR_HOST: 'example.com:9000' },
    { FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1.example.com:9000' },
    { FIREBASE_DATABASE_EMULATOR_HOST: '' },
  ]) {
    assert.deepEqual(resolveNotificationProviderRuntime({
      ...localEnvironment,
      ...overrides,
    }), {
      mode: 'disabled',
      reason: 'INVALID_RUNTIME',
    })
  }
})

test('meta mode requires a deployed non-demo project and complete validated configuration', () => {
  assert.deepEqual(resolveNotificationProviderRuntime(metaEnvironment), {
    mode: 'meta',
    apiVersion: 'v23.0',
    phoneNumberId: '123456789012345',
  })

  for (const overrides of [
    { GCLOUD_PROJECT: 'demo-kronos-training' },
    { GCLOUD_PROJECT: '' },
    { FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:9000' },
    { KRONOS_WHATSAPP_GRAPH_API_VERSION: 'latest' },
    { KRONOS_WHATSAPP_GRAPH_API_VERSION: '' },
    { KRONOS_WHATSAPP_PHONE_NUMBER_ID: 'phone-id' },
    { KRONOS_WHATSAPP_PHONE_NUMBER_ID: '' },
  ]) {
    assert.deepEqual(resolveNotificationProviderRuntime({
      ...metaEnvironment,
      ...overrides,
    }), {
      mode: 'disabled',
      reason: 'INVALID_RUNTIME',
    })
  }
})

test('disabled and local-fake providers never read a secret or call fetch', async () => {
  let secretReads = 0
  let fetchCalls = 0

  const dependencies = {
    readAccessToken: () => {
      secretReads += 1

      return 'must-not-be-read'
    },
    fetch: async (): Promise<Response> => {
      fetchCalls += 1

      return Response.json({ id: 'must-not-be-used' })
    },
  }

  assert.equal(createNotificationRuntimeProvider({
    runtime: { mode: 'disabled', reason: 'MODE_DISABLED' },
    jobId: 'job-' + 'a'.repeat(32),
    ...dependencies,
  }), null)

  const provider = createNotificationRuntimeProvider({
    runtime: { mode: 'local-fake' },
    jobId: 'job-' + 'a'.repeat(32),
    ...dependencies,
  })

  assert.ok(provider)
  assert.deepEqual(await provider.sendTemplate(createTemplateInput()), {
    outcome: 'accepted',
    messageId: `wamid.fake.job-${'a'.repeat(32)}`,
  })
  assert.equal(secretReads, 0)
  assert.equal(fetchCalls, 0)
})

test('meta provider reads the secret once and uses only the injected transport fetch', async () => {
  let secretReads = 0
  const urls: string[] = []

  const responses = [
    Response.json({ id: '987654321' }),
    Response.json({ messages: [{ id: 'wamid.test-runtime-1' }] }),
  ]

  const provider = createNotificationRuntimeProvider({
    runtime: {
      mode: 'meta',
      apiVersion: 'v23.0',
      phoneNumberId: '123456789012345',
    },
    jobId: 'job-' + 'b'.repeat(32),
    readAccessToken: () => {
      secretReads += 1

      return 'test-token-kept-in-memory'
    },
    fetch: async input => {
      urls.push(String(input))

      return responses.shift()!
    },
  })

  assert.ok(provider)
  assert.deepEqual(await provider.sendTemplate(createTemplateInput()), {
    outcome: 'accepted',
    messageId: 'wamid.test-runtime-1',
  })
  assert.equal(secretReads, 1)
  assert.deepEqual(urls, [
    'https://graph.facebook.com/v23.0/123456789012345/media',
    'https://graph.facebook.com/v23.0/123456789012345/messages',
  ])
})

test('missing secret disables Meta before fetch and remote uncertainty stays unknown', async t => {
  await t.test('missing secret', () => {
    let fetchCalls = 0

    const provider = createNotificationRuntimeProvider({
      runtime: {
        mode: 'meta',
        apiVersion: 'v23.0',
        phoneNumberId: '123456789012345',
      },
      jobId: 'job-' + 'c'.repeat(32),
      readAccessToken: () => '',
      fetch: async (): Promise<Response> => {
        fetchCalls += 1

        return Response.json({ id: 'must-not-be-used' })
      },
    })

    assert.equal(provider, null)
    assert.equal(fetchCalls, 0)
  })

  await t.test('rate limit', async () => {
    const provider = createMetaProvider(async () => new Response(null, { status: 429 }))

    assert.ok(provider)
    assert.deepEqual(await provider.sendTemplate(createTemplateInput()), {
      outcome: 'rejected',
      errorCode: 'RATE_LIMITED',
    })
  })

  await t.test('network uncertainty', async () => {
    const provider = createMetaProvider(async () => {
      throw new Error('remote detail must not escape')
    })

    assert.ok(provider)
    assert.deepEqual(await provider.sendTemplate(createTemplateInput()), {
      outcome: 'unknown',
      errorCode: 'META_TRANSPORT_UNKNOWN',
    })
  })
})

function createMetaProvider(fetch: typeof globalThis.fetch) {
  return createNotificationRuntimeProvider({
    runtime: {
      mode: 'meta',
      apiVersion: 'v23.0',
      phoneNumberId: '123456789012345',
    },
    jobId: 'job-' + 'd'.repeat(32),
    readAccessToken: () => 'test-token-kept-in-memory',
    fetch,
  })
}

function createTemplateInput(): SendTemplateInput {
  return {
    to: '+5215512345678',
    templateName: 'payment_reminder_pdf_v1',
    locale: 'es_MX',
    parameters: ['Ana', 'Mayo 2026', '$500.00 MXN'],
    document: {
      bytes: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]),
      filename: 'reminder-123.pdf',
      sha256: '86edbaa24831badfa0a8b04bb410141e2ee4182b6d0014493fe262a7a331c20b',
    },
  }
}
