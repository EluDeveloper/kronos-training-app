import { createHash } from 'node:crypto'
import type {
  MetaWhatsAppTransport,
  WhatsAppDocument,
} from './client.js'

export type MetaGraphApiFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface MetaGraphApiTransportOptions {
  apiVersion: string
  timeoutMs?: number
  fetch?: MetaGraphApiFetch
}

const GRAPH_API_ORIGIN = 'https://graph.facebook.com'
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_TIMEOUT_MS = 60_000
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const MAX_RESPONSE_BYTES = 64 * 1024
const API_VERSION_PATTERN = /^v\d{1,2}\.\d{1,2}$/
const PHONE_NUMBER_ID_PATTERN = /^\d{5,32}$/
const E164_PATTERN = /^\+[1-9]\d{7,14}$/
const TEMPLATE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
// eslint-disable-next-line regexp/prefer-w
const PDF_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.pdf$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MEDIA_ID_PATTERN = /^\d{1,64}$/
// eslint-disable-next-line regexp/prefer-w
const MESSAGE_ID_PATTERN = /^wamid\.[A-Za-z0-9_+=./-]{1,511}$/
const APPROVED_TEMPLATE_NAMES = new Set(['payment_receipt_pdf_v1', 'payment_reminder_pdf_v1'])

export class MetaGraphApiTransport implements MetaWhatsAppTransport {
  private readonly apiVersion: string
  private readonly timeoutMs: number
  private readonly fetch: MetaGraphApiFetch

  constructor(options: MetaGraphApiTransportOptions) {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

    if (!options
      || !isValidMetaGraphApiVersion(options.apiVersion)
      || !Number.isInteger(timeoutMs)
      || timeoutMs < 1
      || timeoutMs > MAX_TIMEOUT_MS
      || (options.fetch !== undefined && typeof options.fetch !== 'function')) {
      throw new Error('Meta Graph API transport configuration is invalid')
    }

    this.apiVersion = options.apiVersion
    this.timeoutMs = timeoutMs
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async uploadDocument(input: {
    phoneNumberId: string
    accessToken: string
    document: WhatsAppDocument
  }): Promise<{ mediaId?: string; errorCode?: string }> {
    assertRequestObject(input)
    assertCredentials(input.phoneNumberId, input.accessToken)
    assertDocument(input.document)

    const body = new FormData()
    const documentBytes = input.document.bytes.slice()

    body.set('messaging_product', 'whatsapp')
    body.set('type', 'application/pdf')
    body.set(
      'file',
      new Blob([documentBytes.buffer], { type: 'application/pdf' }),
      input.document.filename,
    )

    return this.execute(
      this.createEndpoint(input.phoneNumberId, 'media'),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${input.accessToken}` },
        body,
      },
      async response => {
        if (!response.ok) {
          await discardResponseBody(response)

          return { errorCode: mapHttpError(response.status, 'META_MEDIA_REJECTED') }
        }

        const payload = await readBoundedJson(response)
        const mediaId = readStringProperty(payload, 'id')

        if (!mediaId || !MEDIA_ID_PATTERN.test(mediaId))
          throw createUncertainError()

        return { mediaId }
      },
    )
  }

  async sendTemplate(input: {
    phoneNumberId: string
    accessToken: string
    to: string
    templateName: string
    locale: string
    parameters: ReadonlyArray<string>
    mediaId: string
  }): Promise<{ messageId?: string; errorCode?: string }> {
    assertRequestObject(input)
    assertCredentials(input.phoneNumberId, input.accessToken)
    assertTemplateInput(input)

    return this.execute(
      this.createEndpoint(input.phoneNumberId, 'messages'),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          // eslint-disable-next-line camelcase
          messaging_product: 'whatsapp',
          to: input.to,
          type: 'template',
          template: {
            name: input.templateName,
            language: { code: input.locale },
            components: [
              {
                type: 'header',
                parameters: [{ type: 'document', document: { id: input.mediaId } }],
              },
              {
                type: 'body',
                parameters: input.parameters.map(text => ({ type: 'text', text })),
              },
            ],
          },
        }),
      },
      async response => {
        if (!response.ok) {
          await discardResponseBody(response)

          return { errorCode: mapHttpError(response.status, 'META_MESSAGE_REJECTED') }
        }

        const payload = await readBoundedJson(response)
        const messages = readArrayProperty(payload, 'messages')
        const messageId = messages ? readStringProperty(messages[0], 'id') : undefined

        if (!messageId || !MESSAGE_ID_PATTERN.test(messageId))
          throw createUncertainError()

        return { messageId }
      },
    )
  }

  private createEndpoint(phoneNumberId: string, resource: 'media' | 'messages'): string {
    return `${GRAPH_API_ORIGIN}/${this.apiVersion}/${phoneNumberId}/${resource}`
  }

  private async execute<Result>(
    input: string,
    init: RequestInit,
    handleResponse: (response: Response) => Promise<Result>,
  ): Promise<Result> {
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined

    const timeoutResult = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(createUncertainError())
      }, this.timeoutMs)
    })

    const requestResult = async () => {
      const response = await this.fetch(input, {
        ...init,
        redirect: 'error',
        signal: controller.signal,
      })

      return handleResponse(response)
    }

    try {
      return await Promise.race([
        requestResult(),
        timeoutResult,
      ])
    } catch {
      throw createUncertainError()
    } finally {
      if (timeout)
        clearTimeout(timeout)
    }
  }
}

function assertRequestObject(value: unknown): asserts value is object {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Meta Graph API request is invalid')
}

function assertCredentials(phoneNumberId: string, accessToken: string): void {
  if (typeof phoneNumberId !== 'string'
    || !isValidMetaPhoneNumberId(phoneNumberId)
    || typeof accessToken !== 'string'
    || !isValidMetaAccessToken(accessToken)) {
    throw new Error('Meta Graph API request is invalid')
  }
}

export function isValidMetaGraphApiVersion(value: unknown): value is string {
  return typeof value === 'string' && API_VERSION_PATTERN.test(value)
}

export function isValidMetaPhoneNumberId(value: unknown): value is string {
  return typeof value === 'string' && PHONE_NUMBER_ID_PATTERN.test(value)
}

export function isValidMetaAccessToken(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 4096
    && Array.from(value).every(character => {
      const characterCode = character.charCodeAt(0)

      return characterCode > 32 && characterCode < 127
    })
}

function assertDocument(document: WhatsAppDocument): void {
  if (!document
    || !(document.bytes instanceof Uint8Array)
    || document.bytes.length === 0
    || document.bytes.length > MAX_DOCUMENT_BYTES
    || typeof document.filename !== 'string'
    || !PDF_FILENAME_PATTERN.test(document.filename)
    || typeof document.sha256 !== 'string'
    || !SHA256_PATTERN.test(document.sha256)
    || !hasPdfSignature(document.bytes)) {
    throw new Error('Meta Graph API request is invalid')
  }

  const actualSha256 = createHash('sha256').update(document.bytes).digest('hex')

  if (actualSha256 !== document.sha256)
    throw new Error('Meta Graph API request is invalid')
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 37
    && bytes[1] === 80
    && bytes[2] === 68
    && bytes[3] === 70
    && bytes[4] === 45
}

function assertTemplateInput(input: {
  to: string
  templateName: string
  locale: string
  parameters: ReadonlyArray<string>
  mediaId: string
}): void {
  if (typeof input.to !== 'string'
    || !E164_PATTERN.test(input.to)
    || typeof input.templateName !== 'string'
    || !TEMPLATE_NAME_PATTERN.test(input.templateName)
    || !APPROVED_TEMPLATE_NAMES.has(input.templateName)
    || input.locale !== 'es_MX'
    || !Array.isArray(input.parameters)
    || input.parameters.length !== 3
    || input.parameters.some(parameter => typeof parameter !== 'string' || parameter.length > 512)
    || typeof input.mediaId !== 'string'
    || !MEDIA_ID_PATTERN.test(input.mediaId)) {
    throw new Error('Meta Graph API request is invalid')
  }
}

function readStringProperty(value: unknown, property: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  const candidate = Reflect.get(value, property)

  return typeof candidate === 'string' ? candidate : undefined
}

function readArrayProperty(value: unknown, property: string): unknown[] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  const candidate = Reflect.get(value, property)

  return Array.isArray(candidate) ? candidate : undefined
}

function mapHttpError(status: number, fallback: 'META_MEDIA_REJECTED' | 'META_MESSAGE_REJECTED'):
  'RATE_LIMITED' | 'SERVICE_UNAVAILABLE' | 'META_MEDIA_REJECTED' | 'META_MESSAGE_REJECTED' {
  if (status === 429)
    return 'RATE_LIMITED'

  if (status === 408 || status >= 500)
    return 'SERVICE_UNAVAILABLE'

  return fallback
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // The HTTP status is authoritative; response details are intentionally discarded.
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length')

  if (declaredLength !== null
    && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RESPONSE_BYTES)) {
    await discardResponseBody(response)
    throw createUncertainError()
  }

  if (!response.body)
    throw createUncertainError()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done)
        break

      totalBytes += value.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw createUncertainError()
      }
      chunks.push(value)
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0

    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }

    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw createUncertainError()
  } finally {
    reader.releaseLock()
  }
}

function createUncertainError(): Error {
  return new Error('Meta Graph API request result is uncertain')
}
