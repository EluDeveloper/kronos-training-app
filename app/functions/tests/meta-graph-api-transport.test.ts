/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import { MetaGraphApiTransport } from '../src/whatsapp/meta-graph-api-transport.ts'

const accessToken = 'test-token-kept-in-memory'
const phoneNumberId = '123456789012345'

test('rejects invalid local configuration before a request can be made', async () => {
  let calls = 0

  const fetch = async (): Promise<Response> => {
    calls += 1

    return new Response('{}')
  }

  assert.throws(
    () => new MetaGraphApiTransport({ apiVersion: 'latest', fetch }),
    /configuration is invalid/,
  )
  assert.throws(
    () => new MetaGraphApiTransport({ apiVersion: 'v23.0', timeoutMs: 0, fetch }),
    /configuration is invalid/,
  )

  const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', fetch })

  await assert.rejects(
    transport.uploadDocument(undefined as never),
    /request is invalid/,
  )
  await assert.rejects(
    transport.uploadDocument({
      phoneNumberId: 'phone-id',
      accessToken,
      document: createDocument(),
    }),
    /request is invalid/,
  )
  await assert.rejects(
    transport.uploadDocument({
      phoneNumberId,
      accessToken: 'token with spaces',
      document: createDocument(),
    }),
    /request is invalid/,
  )
  await assert.rejects(
    transport.uploadDocument({
      phoneNumberId,
      accessToken,
      document: { ...createDocument(), bytes: new Uint8Array([1, 2, 3]) },
    }),
    /request is invalid/,
  )
  await assert.rejects(
    transport.uploadDocument({
      phoneNumberId,
      accessToken,
      document: { ...createDocument(), sha256: 'not-a-sha256' },
    }),
    /request is invalid/,
  )
  await assert.rejects(
    transport.uploadDocument({
      phoneNumberId,
      accessToken,
      document: {
        ...createDocument(),
        bytes: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 54]),
      },
    }),
    /request is invalid/,
  )
  await assert.rejects(
    transport.sendTemplate({
      phoneNumberId,
      accessToken,
      to: '+5215512345678',
      templateName: 'unapproved_template',
      locale: 'es_MX',
      parameters: ['Ana', 'Mayo 2026'],
      mediaId: '987654321',
    }),
    /request is invalid/,
  )
  assert.equal(calls, 0)
})

test('uploads a PDF to the fixed Graph API media endpoint', async () => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedUrl = String(input)
    capturedInit = init

    return Response.json({ id: '987654321' }, { status: 200 })
  }

  const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', fetch })

  const result = await transport.uploadDocument({
    phoneNumberId,
    accessToken,
    document: createDocument(),
  })

  assert.deepEqual(result, { mediaId: '987654321' })
  assert.equal(capturedUrl, `https://graph.facebook.com/v23.0/${phoneNumberId}/media`)
  assert.equal(capturedInit?.method, 'POST')
  assert.equal(capturedInit?.redirect, 'error')
  assert.equal(new Headers(capturedInit?.headers).get('authorization'), `Bearer ${accessToken}`)
  assert.equal(new Headers(capturedInit?.headers).has('content-type'), false)
  assert.ok(capturedInit?.body instanceof FormData)
  assert.equal(capturedInit.body.get('messaging_product'), 'whatsapp')
  assert.equal(capturedInit.body.get('type'), 'application/pdf')

  const file = capturedInit.body.get('file')

  assert.ok(file instanceof Blob)
  assert.equal(file.type, 'application/pdf')
  assert.equal((file as File).name, 'receipt-123.pdf')
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), createDocument().bytes)
})

test('sends the approved template structure to the fixed messages endpoint', async () => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedUrl = String(input)
    capturedInit = init

    return Response.json({ messages: [{ id: 'wamid.test-message-1' }] }, { status: 200 })
  }

  const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', fetch })

  const result = await transport.sendTemplate({
    phoneNumberId,
    accessToken,
    to: '+5215512345678',
    templateName: 'payment_reminder_pdf_v1',
    locale: 'es_MX',
    parameters: ['Ana', 'Mayo 2026', '$500.00 MXN'],
    mediaId: '987654321',
  })

  assert.deepEqual(result, { messageId: 'wamid.test-message-1' })
  assert.equal(capturedUrl, `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`)
  assert.equal(capturedInit?.method, 'POST')
  assert.equal(capturedInit?.redirect, 'error')
  assert.equal(new Headers(capturedInit?.headers).get('authorization'), `Bearer ${accessToken}`)
  assert.equal(new Headers(capturedInit?.headers).get('content-type'), 'application/json')
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    // eslint-disable-next-line camelcase
    messaging_product: 'whatsapp',
    to: '+5215512345678',
    type: 'template',
    template: {
      name: 'payment_reminder_pdf_v1',
      language: { code: 'es_MX' },
      components: [
        {
          type: 'header',
          parameters: [{ type: 'document', document: { id: '987654321' } }],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Ana' },
            { type: 'text', text: 'Mayo 2026' },
            { type: 'text', text: '$500.00 MXN' },
          ],
        },
      ],
    },
  })
})

test('maps HTTP failures to the closed internal error vocabulary', async t => {
  const cases = [
    { operation: 'upload', status: 429, expected: 'RATE_LIMITED' },
    { operation: 'upload', status: 503, expected: 'SERVICE_UNAVAILABLE' },
    { operation: 'upload', status: 400, expected: 'META_MEDIA_REJECTED' },
    { operation: 'send', status: 400, expected: 'META_MESSAGE_REJECTED' },
  ] as const

  for (const current of cases) {
    await t.test(`${current.operation} ${current.status}`, async () => {
      const fetch = async (): Promise<Response> => Response.json(
        { error: { message: 'remote detail must never escape' } },
        { status: current.status },
      )

      const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', fetch })

      const result = current.operation === 'upload'
        ? await transport.uploadDocument({ phoneNumberId, accessToken, document: createDocument() })
        : await sendValidTemplate(transport)

      assert.deepEqual(result, { errorCode: current.expected })
      assert.equal(JSON.stringify(result).includes('remote detail'), false)
    })
  }
})

test('turns network failures and timeout into sanitized uncertainty', async t => {
  await t.test('network failure', async () => {
    const fetch = async (): Promise<Response> => {
      throw new Error(`remote failure exposed ${accessToken} +5215512345678`)
    }

    const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', fetch })

    await assert.rejects(
      transport.uploadDocument({ phoneNumberId, accessToken, document: createDocument() }),
      assertSanitizedUncertainty,
    )
  })

  await t.test('timeout', async () => {
    const fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => (
      new Promise((_resolve, reject) => {
        const guard = setTimeout(
          () => reject(new Error(`fetch did not receive timeout ${accessToken}`)),
          100,
        )

        init?.signal?.addEventListener('abort', () => {
          clearTimeout(guard)
          reject(new Error(`abort detail exposed ${accessToken}`))
        }, { once: true })
      })
    )

    const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', timeoutMs: 5, fetch })

    await assert.rejects(
      transport.uploadDocument({ phoneNumberId, accessToken, document: createDocument() }),
      assertSanitizedUncertainty,
    )
  })

  await t.test('response body timeout', async () => {
    let requestSignal: AbortSignal | null | undefined

    const fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requestSignal = init?.signal

      return new Response(new ReadableStream({
        start(controller) {
          const guard = setTimeout(
            () => controller.error(new Error(`body timeout missing ${accessToken}`)),
            100,
          )

          requestSignal?.addEventListener('abort', () => {
            clearTimeout(guard)
            controller.error(new Error(`body detail exposed ${accessToken}`))
          }, { once: true })
        },
      }))
    }

    const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', timeoutMs: 5, fetch })

    await assert.rejects(
      transport.uploadDocument({ phoneNumberId, accessToken, document: createDocument() }),
      assertSanitizedUncertainty,
    )
    assert.equal(requestSignal?.aborted, true)
  })
})

test('rejects malformed or oversized 2xx responses as sanitized uncertainty', async t => {
  await t.test('malformed success', async () => {
    const fetch = async (): Promise<Response> => Response.json({ id: `invalid-${accessToken}` })

    const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', fetch })

    await assert.rejects(
      transport.uploadDocument({ phoneNumberId, accessToken, document: createDocument() }),
      assertSanitizedUncertainty,
    )
  })

  await t.test('declared oversized success', async () => {
    const fetch = async (): Promise<Response> => Response.json(
      { id: '987654321' },
      { headers: { 'content-length': '70000' } },
    )

    const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', fetch })

    await assert.rejects(
      transport.uploadDocument({ phoneNumberId, accessToken, document: createDocument() }),
      assertSanitizedUncertainty,
    )
  })

  await t.test('streamed oversized success', async () => {
    const fetch = async (): Promise<Response> => new Response('x'.repeat(65_537))

    const transport = new MetaGraphApiTransport({ apiVersion: 'v23.0', fetch })

    await assert.rejects(
      transport.uploadDocument({ phoneNumberId, accessToken, document: createDocument() }),
      assertSanitizedUncertainty,
    )
  })
})

function sendValidTemplate(transport: MetaGraphApiTransport) {
  return transport.sendTemplate({
    phoneNumberId,
    accessToken,
    to: '+5215512345678',
    templateName: 'payment_reminder_pdf_v1',
    locale: 'es_MX',
    parameters: ['Ana', 'Mayo 2026', '$500.00 MXN'],
    mediaId: '987654321',
  })
}

function assertSanitizedUncertainty(error: unknown): boolean {
  assert.ok(error instanceof Error)
  assert.equal(error.message, 'Meta Graph API request result is uncertain')
  assert.equal(error.message.includes(accessToken), false)
  assert.equal(error.message.includes('+5215512345678'), false)

  return true
}

function createDocument() {
  return {
    bytes: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]),
    filename: 'receipt-123.pdf',
    sha256: '86edbaa24831badfa0a8b04bb410141e2ee4182b6d0014493fe262a7a331c20b',
  }
}
