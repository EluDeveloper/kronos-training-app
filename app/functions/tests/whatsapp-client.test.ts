import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FakeWhatsAppProvider,
  WhatsAppInputError,
  type ProviderOutcome,
  type SendTemplateInput,
} from '../src/whatsapp/client.ts'

const request: SendTemplateInput = {
  to: '+5215512345678',
  templateName: 'payment_receipt_pdf_v1',
  locale: 'es_MX',
  parameters: ['Ana', 'Mayo 2026', '$500.00 MXN'],
  document: {
    bytes: new Uint8Array([37, 80, 68, 70]),
    filename: 'receipt-123.pdf',
    sha256: 'a'.repeat(64),
  },
}

for (const outcome of ['accepted', 'rejected', 'unknown'] as const) {
  test(`fake provider returns ${outcome} without network access`, async () => {
    const provider = new FakeWhatsAppProvider({
      response: {
        outcome,
        messageId: outcome === 'accepted' ? 'fake-wamid-1' : undefined,
        errorCode: outcome === 'rejected' ? 'FAKE_REJECTED' : undefined,
      },
    })

    const response = await provider.sendTemplate(request)

    assert.equal(response.outcome, outcome)
    assert.equal(provider.submittedRequests.length, 1)
    assert.deepEqual(provider.submittedRequests[0], request)
    assert.notStrictEqual(provider.submittedRequests[0]?.document.bytes, request.document.bytes)
  })
}

test('fake provider defaults to a disabled rejected response', async () => {
  const provider = new FakeWhatsAppProvider({
    response: { outcome: 'rejected', errorCode: 'FAKE_PROVIDER_DISABLED' },
  })

  const response = await provider.sendTemplate(request)

  assert.deepEqual(response, {
    outcome: 'rejected',
    errorCode: 'FAKE_PROVIDER_DISABLED',
  })
})

test('fake provider validates the recipient before recording a request', async () => {
  const provider = new FakeWhatsAppProvider({
    response: { outcome: 'accepted' },
  })

  await assert.rejects(
    provider.sendTemplate({ ...request, to: '5512345678' }),
    (error: unknown) => error instanceof WhatsAppInputError && error.code === 'INVALID_INPUT',
  )
  assert.equal(provider.submittedRequests.length, 0)
})

test('fake provider rejects unsafe document filenames and hashes', async () => {
  const provider = new FakeWhatsAppProvider({
    response: { outcome: 'accepted' },
  })

  await assert.rejects(
    provider.sendTemplate({
      ...request,
      document: { ...request.document, filename: '../phone.pdf' },
    }),
    WhatsAppInputError,
  )
  await assert.rejects(
    provider.sendTemplate({
      ...request,
      document: { ...request.document, sha256: 'not-a-hash' },
    }),
    WhatsAppInputError,
  )
  assert.equal(provider.submittedRequests.length, 0)
})

test('fake provider rejects unsupported outcomes at construction time', () => {
  assert.throws(
    () => new FakeWhatsAppProvider({ response: { outcome: 'sent' as ProviderOutcome } }),
    /invalid outcome/,
  )
})
