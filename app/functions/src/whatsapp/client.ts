export type ProviderOutcome = 'not-submitted' | 'rejected' | 'accepted' | 'unknown'

export interface WhatsAppDocument {
  bytes: Uint8Array
  filename: string
  sha256: string
}

export interface SendTemplateInput {
  to: string
  templateName: string
  locale: string
  parameters: ReadonlyArray<string>
  document: WhatsAppDocument
}

export interface ProviderResponse {
  outcome: ProviderOutcome
  messageId?: string
  errorCode?: string
}

export interface WhatsAppProvider {
  sendTemplate(input: SendTemplateInput): Promise<ProviderResponse>
}

export interface MetaWhatsAppTransport {
  uploadDocument(input: {
    phoneNumberId: string
    accessToken: string
    document: WhatsAppDocument
  }): Promise<{ mediaId?: string; errorCode?: string }>
  sendTemplate(input: {
    phoneNumberId: string
    accessToken: string
    to: string
    templateName: string
    locale: string
    parameters: ReadonlyArray<string>
    mediaId: string
  }): Promise<{ messageId?: string; errorCode?: string }>
}

export interface MetaWhatsAppProviderOptions {
  enabled?: boolean
  accessToken: string
  phoneNumberId: string
  transport?: MetaWhatsAppTransport
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly enabled: boolean
  private readonly accessToken: string
  private readonly phoneNumberId: string
  private readonly transport?: MetaWhatsAppTransport

  constructor(options: MetaWhatsAppProviderOptions) {
    this.enabled = options.enabled === true
    this.accessToken = options.accessToken
    this.phoneNumberId = options.phoneNumberId
    this.transport = options.transport
  }

  async sendTemplate(input: SendTemplateInput): Promise<ProviderResponse> {
    validateSendTemplateInput(input)

    if (!APPROVED_TEMPLATE_NAMES.has(input.templateName)
      || input.locale !== 'es_MX'
      || input.parameters.length !== 3)
      return { outcome: 'rejected', errorCode: 'TEMPLATE_NOT_APPROVED' }
    if (!this.enabled)
      return { outcome: 'not-submitted', errorCode: 'REAL_PROVIDER_DISABLED' }
    if (!this.accessToken.trim() || !this.phoneNumberId.trim() || !this.transport)
      return { outcome: 'not-submitted', errorCode: 'META_PROVIDER_MISCONFIGURED' }

    try {
      const upload = await this.transport.uploadDocument({
        phoneNumberId: this.phoneNumberId,
        accessToken: this.accessToken,
        document: input.document,
      })

      if (!upload.mediaId)
        return { outcome: 'rejected', errorCode: sanitizeProviderError(upload.errorCode, 'META_MEDIA_REJECTED') }

      const response = await this.transport.sendTemplate({
        phoneNumberId: this.phoneNumberId,
        accessToken: this.accessToken,
        to: input.to,
        templateName: input.templateName,
        locale: input.locale,
        parameters: input.parameters,
        mediaId: upload.mediaId,
      })

      if (response.messageId)
        return { outcome: 'accepted', messageId: response.messageId }

      return { outcome: 'rejected', errorCode: sanitizeProviderError(response.errorCode, 'META_MESSAGE_REJECTED') }
    } catch {
      return { outcome: 'unknown', errorCode: 'META_TRANSPORT_UNKNOWN' }
    }
  }
}

export class WhatsAppInputError extends Error {
  readonly code = 'INVALID_INPUT'

  constructor(message: string) {
    super(message)
    this.name = 'WhatsAppInputError'
  }
}

const E164_PATTERN = /^\+[1-9]\d{7,14}$/
// eslint-disable-next-line regexp/prefer-w
const TEMPLATE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const LOCALE_PATTERN = /^[a-z]{2}(?:_[A-Z]{2})?$/
// eslint-disable-next-line regexp/prefer-w
const PDF_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.pdf$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MAX_PARAMETERS = 10
const MAX_PARAMETER_LENGTH = 512
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const APPROVED_TEMPLATE_NAMES = new Set(['payment_receipt_pdf_v1', 'payment_reminder_pdf_v1'])

export function validateSendTemplateInput(input: SendTemplateInput): void {
  if (!input || typeof input !== 'object') {
    throw new WhatsAppInputError('Template request is required')
  }

  if (typeof input.to !== 'string' || !E164_PATTERN.test(input.to)) {
    throw new WhatsAppInputError('Recipient must be a valid E.164 number')
  }

  if (typeof input.templateName !== 'string' || !TEMPLATE_NAME_PATTERN.test(input.templateName)) {
    throw new WhatsAppInputError('Template name is invalid')
  }

  if (typeof input.locale !== 'string' || !LOCALE_PATTERN.test(input.locale)) {
    throw new WhatsAppInputError('Template locale is invalid')
  }

  if (!Array.isArray(input.parameters) || input.parameters.some(parameter => typeof parameter !== 'string')) {
    throw new WhatsAppInputError('Template parameters are invalid')
  }

  if (input.parameters.length > MAX_PARAMETERS) {
    throw new WhatsAppInputError('Template has too many parameters')
  }

  if (input.parameters.some(parameter => parameter.length > MAX_PARAMETER_LENGTH)) {
    throw new WhatsAppInputError('Template parameter is too long')
  }

  if (!input.document || typeof input.document !== 'object') {
    throw new WhatsAppInputError('Document is required')
  }

  if (!(input.document.bytes instanceof Uint8Array) || input.document.bytes.length === 0) {
    throw new WhatsAppInputError('Document must contain bytes')
  }

  if (input.document.bytes.length > MAX_DOCUMENT_BYTES) {
    throw new WhatsAppInputError('Document is too large')
  }

  if (typeof input.document.filename !== 'string' || !PDF_FILENAME_PATTERN.test(input.document.filename)) {
    throw new WhatsAppInputError('Document filename is invalid')
  }

  if (typeof input.document.sha256 !== 'string' || !SHA256_PATTERN.test(input.document.sha256)) {
    throw new WhatsAppInputError('Document hash is invalid')
  }
}

export interface FakeWhatsAppProviderOptions {
  response: ProviderResponse
}

export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly submittedRequests: SendTemplateInput[] = []
  private readonly response: ProviderResponse

  constructor(options: FakeWhatsAppProviderOptions) {
    assertProviderResponse(options.response)
    this.response = { ...options.response }
  }

  async sendTemplate(input: SendTemplateInput): Promise<ProviderResponse> {
    validateSendTemplateInput(input)
    this.submittedRequests.push({
      ...input,
      parameters: [...input.parameters],
      document: {
        ...input.document,
        bytes: input.document.bytes.slice(),
      },
    })

    return { ...this.response }
  }
}

export function createFakeWhatsAppProvider(
  response: ProviderResponse = { outcome: 'rejected', errorCode: 'FAKE_PROVIDER_DISABLED' },
): WhatsAppProvider {
  return new FakeWhatsAppProvider({ response })
}

function assertProviderResponse(response: ProviderResponse): void {
  const outcomes: ProviderOutcome[] = ['not-submitted', 'rejected', 'accepted', 'unknown']
  if (!outcomes.includes(response.outcome)) {
    throw new Error('Fake provider response has an invalid outcome')
  }
}

function sanitizeProviderError(value: string | undefined, fallback: string): string {
  return value && /^[A-Z\d_-]{1,64}$/.test(value) ? value : fallback
}
