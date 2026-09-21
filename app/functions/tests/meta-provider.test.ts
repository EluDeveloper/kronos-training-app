/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MetaWhatsAppProvider,
  type MetaWhatsAppTransport,
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

test('real Meta provider is disabled by default and never calls transport', async () => {
  let calls = 0

  const transport: MetaWhatsAppTransport = {
    uploadDocument: async () => {
      calls += 1

      return { mediaId: 'media-1' }
    },
    sendTemplate: async () => {
      calls += 1

      return { messageId: 'wamid-1' }
    },
  }

  const provider = new MetaWhatsAppProvider({
    accessToken: 'secret-is-never-logged',
    phoneNumberId: 'phone-number-id',
    transport,
  })

  assert.deepEqual(await provider.sendTemplate(request), {
    outcome: 'not-submitted',
    errorCode: 'REAL_PROVIDER_DISABLED',
  })
  assert.equal(calls, 0)
})

test('enabled Meta provider uploads privately then sends the template', async () => {
  const calls: string[] = []

  const provider = new MetaWhatsAppProvider({
    enabled: true,
    accessToken: 'secret-is-never-logged',
    phoneNumberId: 'phone-number-id',
    transport: {
      uploadDocument: async input => {
        calls.push(`upload:${input.document.filename}:${input.document.sha256}`)

        return { mediaId: 'media-1' }
      },
      sendTemplate: async input => {
        calls.push(`send:${input.to}:${input.templateName}:${input.mediaId}`)

        return { messageId: 'wamid-1' }
      },
    },
  })

  assert.deepEqual(await provider.sendTemplate(request), {
    outcome: 'accepted',
    messageId: 'wamid-1',
  })
  assert.deepEqual(calls, [
    'upload:receipt-123.pdf:' + 'a'.repeat(64),
    'send:+5215512345678:payment_receipt_pdf_v1:media-1',
  ])
})

test('Meta transport uncertainty is never converted into acceptance', async () => {
  const provider = new MetaWhatsAppProvider({
    enabled: true,
    accessToken: 'secret-is-never-logged',
    phoneNumberId: 'phone-number-id',
    transport: {
      uploadDocument: async () => ({ mediaId: 'media-1' }),
      sendTemplate: async () => {
        throw new Error('network timeout')
      },
    },
  })

  assert.deepEqual(await provider.sendTemplate(request), {
    outcome: 'unknown',
    errorCode: 'META_TRANSPORT_UNKNOWN',
  })
})

test('Meta provider rejects a template that is not approved before transport', async () => {
  let calls = 0

  const provider = new MetaWhatsAppProvider({
    enabled: true,
    accessToken: 'secret-is-never-logged',
    phoneNumberId: 'phone-number-id',
    transport: {
      uploadDocument: async () => {
        calls += 1

        return { mediaId: 'media-1' }
      },
      sendTemplate: async () => {
        calls += 1

        return { messageId: 'wamid-1' }
      },
    },
  })

  assert.deepEqual(await provider.sendTemplate({ ...request, templateName: 'marketing_offer' }), {
    outcome: 'rejected',
    errorCode: 'TEMPLATE_NOT_APPROVED',
  })
  assert.equal(calls, 0)
})

test('Meta provider requires the approved locale and parameter count', async () => {
  const provider = new MetaWhatsAppProvider({
    enabled: true,
    accessToken: 'secret-is-never-logged',
    phoneNumberId: 'phone-number-id',
    transport: {
      uploadDocument: async () => ({ mediaId: 'media-1' }),
      sendTemplate: async () => ({ messageId: 'wamid-1' }),
    },
  })

  assert.deepEqual(await provider.sendTemplate({ ...request, locale: 'en_US' }), {
    outcome: 'rejected',
    errorCode: 'TEMPLATE_NOT_APPROVED',
  })
  assert.deepEqual(await provider.sendTemplate({ ...request, parameters: ['Ana'] }), {
    outcome: 'rejected',
    errorCode: 'TEMPLATE_NOT_APPROVED',
  })
})
