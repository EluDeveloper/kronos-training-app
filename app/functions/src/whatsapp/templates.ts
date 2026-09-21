import { formatMxn } from '../formatters.js'
import {
  validateSendTemplateInput,
  type SendTemplateInput,
  type WhatsAppDocument,
} from './client.js'

export type ApprovedTemplateName = 'payment_receipt_pdf_v1' | 'payment_reminder_pdf_v1'

export interface ApprovedTemplateDefinition {
  name: ApprovedTemplateName
  category: 'UTILITY'
  locale: 'es_MX'
  enabled: boolean
  documentHeader: 'pdf'
  parameterCount: 3
}

const approvedTemplates: Record<ApprovedTemplateName, ApprovedTemplateDefinition> = {
  'payment_receipt_pdf_v1': {
    name: 'payment_receipt_pdf_v1',
    category: 'UTILITY',
    locale: 'es_MX',
    enabled: true,
    documentHeader: 'pdf',
    parameterCount: 3,
  },
  'payment_reminder_pdf_v1': {
    name: 'payment_reminder_pdf_v1',
    category: 'UTILITY',
    locale: 'es_MX',
    enabled: true,
    documentHeader: 'pdf',
    parameterCount: 3,
  },
}

export type TemplateSuppressionReason =
  | 'template-not-approved'
  | 'template-disabled'
  | 'template-category-invalid'
  | 'template-locale-invalid'

export type ApprovedTemplateResolution =
  | { status: 'ready'; definition: ApprovedTemplateDefinition }
  | { status: 'suppressed-template'; reason: TemplateSuppressionReason }

export function resolveApprovedTemplate(
  name: string,
  overrides: { enabled?: boolean; category?: string; locale?: string } = {},
): ApprovedTemplateResolution {
  const definition = approvedTemplates[name as ApprovedTemplateName]
  if (!definition)
    return { status: 'suppressed-template', reason: 'template-not-approved' }
  if (overrides.category !== undefined && overrides.category !== 'UTILITY')
    return { status: 'suppressed-template', reason: 'template-category-invalid' }
  if (overrides.locale !== undefined && overrides.locale !== definition.locale)
    return { status: 'suppressed-template', reason: 'template-locale-invalid' }
  if (overrides.enabled === false || !definition.enabled)
    return { status: 'suppressed-template', reason: 'template-disabled' }

  return { status: 'ready', definition: { ...definition, ...overrides } as ApprovedTemplateDefinition }
}

interface TemplateRequestBase {
  to: string
  customerName: string
  document: WhatsAppDocument
}

export function buildPaymentReceiptTemplateRequest(input: TemplateRequestBase & {
  concept: string
  amountPaid: number
}): SendTemplateInput {
  const definition = requireApprovedTemplate('payment_receipt_pdf_v1')

  const parameters = [
    requiredParameter(input.customerName, 'customer name'),
    requiredParameter(input.concept, 'concept'),
    formatMxn(input.amountPaid),
  ]

  return createRequest(definition, input.to, parameters, input.document)
}

export function buildPaymentReminderTemplateRequest(input: TemplateRequestBase & {
  dueDate: string
  balance: number
}): SendTemplateInput {
  const definition = requireApprovedTemplate('payment_reminder_pdf_v1')

  if (!Number.isFinite(input.balance) || input.balance <= 0)
    throw new Error('Reminder requires a positive balance')

  if (!isCalendarDate(input.dueDate))
    throw new Error('Invalid due date')

  const parameters = [
    requiredParameter(input.customerName, 'customer name'),
    requiredParameter(input.dueDate, 'due date'),
    formatMxn(input.balance),
  ]

  return createRequest(definition, input.to, parameters, input.document)
}

function createRequest(
  definition: ApprovedTemplateDefinition,
  to: string,
  parameters: string[],
  document: WhatsAppDocument,
): SendTemplateInput {
  const request: SendTemplateInput = {
    to,
    templateName: definition.name,
    locale: definition.locale,
    parameters,
    document,
  }

  validateSendTemplateInput(request)

  return request
}

function requireApprovedTemplate(name: ApprovedTemplateName): ApprovedTemplateDefinition {
  const resolution = resolveApprovedTemplate(name)

  if (resolution.status !== 'ready')
    throw new Error(`Template suppressed: ${resolution.reason}`)

  return resolution.definition
}

function requiredParameter(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value) || value.length > 512)
    throw new Error(`Invalid ${label}`)

  return value.trim()
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false

  const date = new Date(`${value}T00:00:00.000Z`)

  return date.toISOString().slice(0, 10) === value
}
