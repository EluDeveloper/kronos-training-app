import { onRequest } from 'firebase-functions/v2/https'

export {
  createFakeWhatsAppProvider,
  FakeWhatsAppProvider,
  MetaWhatsAppProvider,
  validateSendTemplateInput,
  WhatsAppInputError,
} from './whatsapp/client.js'
export type {
  FakeWhatsAppProviderOptions,
  MetaWhatsAppProviderOptions,
  MetaWhatsAppTransport,
  ProviderOutcome,
  ProviderResponse,
  SendTemplateInput,
  WhatsAppDocument,
  WhatsAppProvider,
} from './whatsapp/client.js'
export { MetaGraphApiTransport } from './whatsapp/meta-graph-api-transport.js'
export type {
  MetaGraphApiFetch,
  MetaGraphApiTransportOptions,
} from './whatsapp/meta-graph-api-transport.js'
export {
  buildPaymentReceiptTemplateRequest,
  buildPaymentReminderTemplateRequest,
  resolveApprovedTemplate,
} from './whatsapp/templates.js'
export type {
  ApprovedTemplateDefinition,
  ApprovedTemplateName,
  ApprovedTemplateResolution,
  TemplateSuppressionReason,
} from './whatsapp/templates.js'
export {
  createPaymentNotificationPdf,
} from './pdf/payment-receipts.js'
export type {
  BackendPaymentNotificationDocument,
  BackendPaymentNotificationLine,
  PaymentNotificationPdf,
} from './pdf/payment-receipts.js'

export {
  onMembershipPaymentWritten,
  onSaleWritten,
} from './notifications/triggers.js'
export {
  onReminderScheduled,
} from './notifications/reminders.js'
export { whatsappWebhook } from './whatsapp/http.js'
export { onNotificationProviderStatusWritten } from './whatsapp/local-status-inbox.js'
export { onNotificationJobCreated } from './notifications/local-worker.js'
export { onNotificationRecoveryScheduled } from './notifications/production-recovery.js'
export { onWhatsAppMaintenanceScheduled } from './whatsapp/production-maintenance.js'
export { onNotificationJobStatusWritten } from './notifications/local-status-projection.js'

export const whatsappProviderHealth = onRequest((_request, response) => {
  response.status(200).json({
    provider: 'fake',
    realProvider: 'disabled',
    status: 'ok',
  })
})
