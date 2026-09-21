import { resolveNotificationProviderRuntime } from './provider-runtime.js'

export interface WhatsAppWebhookConfig {
  accountId: string
  phoneNumberId: string
}

export type WhatsAppWebhookRuntime =
  | { mode: 'disabled'; reason: 'MODE_DISABLED' | 'INVALID_RUNTIME' }
  | {
    mode: 'local-fake'
    config: WhatsAppWebhookConfig | null
    optOutEnabled: boolean
    statusEnabled: boolean
    legacyStatusEnabled: true
  }
  | {
    mode: 'meta'
    config: WhatsAppWebhookConfig
    optOutEnabled: true
    statusEnabled: true
    legacyStatusEnabled: false
  }

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

const META_ID_PATTERN = /^\d{5,32}$/
const QA_ID_PATTERN = /^qa-[a-z0-9-]{1,64}$/

export function resolveWhatsAppWebhookRuntime(
  environment: RuntimeEnvironment,
): WhatsAppWebhookRuntime {
  const providerRuntime = resolveNotificationProviderRuntime(environment)

  if (providerRuntime.mode === 'disabled')
    return providerRuntime

  if (providerRuntime.mode === 'meta') {
    const accountId = environment.KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID ?? ''
    const config = { accountId, phoneNumberId: providerRuntime.phoneNumberId }

    return isValidProductionWebhookConfig(config)
      ? {
        mode: 'meta',
        config,
        optOutEnabled: true,
        statusEnabled: true,
        legacyStatusEnabled: false,
      }
      : { mode: 'disabled', reason: 'INVALID_RUNTIME' }
  }

  const optOutMode = environment.KRONOS_WHATSAPP_OPT_OUT_MODE ?? ''
  const statusMode = environment.KRONOS_WHATSAPP_STATUS_INBOX_MODE ?? ''
  if (!['', 'local'].includes(optOutMode) || !['', 'local'].includes(statusMode))
    return { mode: 'disabled', reason: 'INVALID_RUNTIME' }

  const optOutEnabled = optOutMode === 'local'
  const statusEnabled = statusMode === 'local'
  if (!optOutEnabled && !statusEnabled) {
    return {
      mode: 'local-fake',
      config: null,
      optOutEnabled: false,
      statusEnabled: false,
      legacyStatusEnabled: true,
    }
  }

  const config = {
    accountId: environment.KRONOS_WHATSAPP_QA_ACCOUNT_ID ?? '',
    phoneNumberId: environment.KRONOS_WHATSAPP_QA_NUMBER_ID ?? '',
  }

  return isValidLocalWebhookConfig(config)
    ? {
      mode: 'local-fake',
      config,
      optOutEnabled,
      statusEnabled,
      legacyStatusEnabled: true,
    }
    : { mode: 'disabled', reason: 'INVALID_RUNTIME' }
}

export function isValidWebhookConfig(value: unknown): value is WhatsAppWebhookConfig {
  return isValidProductionWebhookConfig(value) || isValidLocalWebhookConfig(value)
}

export function isValidWebhookVerifyToken(value: unknown): value is string {
  return isPrintableSecret(value, 16, 256)
}

export function isValidWebhookAppSecret(value: unknown): value is string {
  return isPrintableSecret(value, 16, 512)
}

function isValidProductionWebhookConfig(value: unknown): value is WhatsAppWebhookConfig {
  const config = asConfig(value)

  return config !== null
    && META_ID_PATTERN.test(config.accountId)
    && META_ID_PATTERN.test(config.phoneNumberId)
}

function isValidLocalWebhookConfig(value: unknown): value is WhatsAppWebhookConfig {
  const config = asConfig(value)

  return config !== null
    && QA_ID_PATTERN.test(config.accountId)
    && QA_ID_PATTERN.test(config.phoneNumberId)
}

function asConfig(value: unknown): WhatsAppWebhookConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null

  const accountId = Reflect.get(value, 'accountId')
  const phoneNumberId = Reflect.get(value, 'phoneNumberId')

  return typeof accountId === 'string' && typeof phoneNumberId === 'string'
    ? { accountId, phoneNumberId }
    : null
}

function isPrintableSecret(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string'
    && value.length >= minimum
    && value.length <= maximum
    && Array.from(value).every(character => {
      const code = character.charCodeAt(0)

      return code > 32 && code < 127
    })
}
