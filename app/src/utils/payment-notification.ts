import type { Athlete, Payment, Sale } from '@/types/domain'
import { membershipBalance, saleBalance } from '@/utils/kronos'

export type NotificationPurpose = 'receipt' | 'reminder'
export type NotificationConsentStatus = 'unknown' | 'opted-in' | 'opted-out'

export interface NotificationConsent {
  athleteId: string
  createdAt: number | string
  receiptStatus: NotificationConsentStatus
  reminderStatus: NotificationConsentStatus
  consentedPhoneE164: string | null
  consentedAt?: number | string | null
  consentSource?: 'athlete' | 'guardian' | 'staff' | 'webhook' | null
  recordedBy?: string | null
  optedOutAt?: number | string | null
  optOutSource?: 'athlete' | 'guardian' | 'staff' | 'webhook' | null
  updatedAt: number | string
  updatedBy?: string | null
}

export interface DebtSnapshot {
  monthly: number
  store: number
  total: number
}

export interface PaymentNotificationLine {
  description: string
  amount: number
}

export type PaymentNotificationDocument =
  | {
    kind: 'receipt'
    title: 'RECIBO'
    folio: string
    customerName: string
    issuedAt: number | string
    concept: string
    lines: PaymentNotificationLine[]
    total: number
    amountPaid: number
    balance: number
    isProofOfPayment: true
  }
  | {
    kind: 'reminder'
    title: 'AVISO DE PAGO'
    folio: string
    customerName: string
    issuedAt: number | string
    concept: string
    dueDate: string
    lines: PaymentNotificationLine[]
    total: number
    amountPaid: 0
    balance: number
    isProofOfPayment: false
    disclaimer: 'Documento informativo - no es comprobante de pago'
  }

export interface NotificationEligibility {
  eligible: boolean
  recipient: string | null
  reason: 'eligible' | 'athlete-inactive' | 'no-consent' | 'opted-out' | 'phone-changed' | 'invalid-phone' | 'consent-mismatch'
}

export type PaymentNotificationKeyInput =
  | { kind: 'membership'; athleteId: string; period: string; installmentId: string }
  | { kind: 'sale-initial'; saleId: string }
  | { kind: 'sale-payment'; saleId: string; paymentId: string }
  | { kind: 'sale-group'; groupPaymentId: string }
  | { kind: 'combined'; athleteId: string; period: string; membershipInstallmentId: string }

export type ReminderKind = 'pre-due' | 'due' | 'overdue' | 'store' | 'combined'

export type NotificationStatus =
  | 'queued'
  | 'processing'
  | 'accepted'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'retryable-failed'
  | 'terminal-failed'
  | 'suppressed'
  | 'unknown'

const currency = (value: number) => Math.round(Number(value || 0) * 100) / 100

export function buildPaymentReceiptDocument(input: {
  folio: string
  customerName: string
  issuedAt: number | string
  concept: string
  lines: ReadonlyArray<PaymentNotificationLine>
  total: number
  amountPaid: number
  balance: number
}): PaymentNotificationDocument {
  return {
    kind: 'receipt',
    title: 'RECIBO',
    folio: input.folio,
    customerName: input.customerName,
    issuedAt: input.issuedAt,
    concept: input.concept,
    lines: input.lines.map(line => ({
      description: line.description,
      amount: currency(line.amount),
    })),
    total: currency(input.total),
    amountPaid: currency(input.amountPaid),
    balance: currency(input.balance),
    isProofOfPayment: true,
  }
}

export function buildPaymentReminderDocument(input: {
  folio: string
  customerName: string
  issuedAt: number | string
  period: string
  dueDate: string
  monthlyDebt: number
  storeDebt: number
}): Extract<PaymentNotificationDocument, { kind: 'reminder' }> | null {
  const monthlyDebt = currency(Math.max(0, input.monthlyDebt))
  const storeDebt = currency(Math.max(0, input.storeDebt))
  const lines: PaymentNotificationLine[] = []

  if (monthlyDebt > 0)
    lines.push({ description: 'Mensualidad ' + input.period, amount: monthlyDebt })

  if (storeDebt > 0)
    lines.push({ description: 'Tienda', amount: storeDebt })

  const total = currency(monthlyDebt + storeDebt)
  if (total <= 0)
    return null

  return {
    kind: 'reminder',
    title: 'AVISO DE PAGO',
    folio: input.folio,
    customerName: input.customerName,
    issuedAt: input.issuedAt,
    concept: 'Estado de cuenta ' + input.period,
    dueDate: input.dueDate,
    lines,
    total,
    amountPaid: 0,
    balance: total,
    isProofOfPayment: false,
    disclaimer: 'Documento informativo - no es comprobante de pago',
  }
}

const requiredPart = (name: string, value: string) => {
  if (!value.trim() || value.includes(':'))
    throw new Error(name + ' inválido.')

  return value
}

export function calculateDebtSnapshot(athlete: Athlete, payment: Payment | null | undefined, sales: Sale[]): DebtSnapshot {
  const monthly = currency(membershipBalance(payment, athlete.membership.agreedAmount))

  const store = currency(sales
    .filter(sale => sale.status === 'credit')
    .reduce((total, sale) => total + saleBalance(sale), 0))

  return {
    monthly,
    store,
    total: currency(monthly + store),
  }
}

export function normalizePhoneE164(value: string | null | undefined, countryCode = '52'): string | null {
  const input = value?.trim() ?? ''
  if (!input || !/^\+?[\d\s().-]+$/.test(input) || !/^\d+$/.test(countryCode))
    return null

  const digits = input.replace(/\D/g, '')
  if (digits.length === 10)
    return countryCode + digits

  if (digits.length === countryCode.length + 10 && digits.startsWith(countryCode))
    return digits

  return null
}

export interface NotificationConsentMutationInput {
  athleteId: string
  phone: string | null | undefined
  current: NotificationConsent | null | undefined
  receiptOptIn: boolean
  reminderOptIn: boolean
  consentConfirmed: boolean
  withdrawalConfirmed: boolean
  recordedBy: string
  now: number | string
}

export function buildNotificationConsentMutation(input: NotificationConsentMutationInput): NotificationConsent {
  if (!input.athleteId.trim())
    throw new Error('El atleta es obligatorio.')

  if (!input.recordedBy.trim())
    throw new Error('El operador es obligatorio.')

  const current = input.current
  const phoneE164 = normalizePhoneE164(input.phone)
  const hasOptIn = input.receiptOptIn || input.reminderOptIn

  const isWithdrawing = (current?.receiptStatus === 'opted-in' && !input.receiptOptIn)
    || (current?.reminderStatus === 'opted-in' && !input.reminderOptIn)

  if (hasOptIn && !phoneE164)
    throw new Error('Se requiere un teléfono válido para activar el consentimiento.')

  if (hasOptIn && !input.consentConfirmed)
    throw new Error('Se requiere confirmación explícita del consentimiento.')

  if (isWithdrawing && !input.withdrawalConfirmed)
    throw new Error('Confirma el retiro del consentimiento antes de guardar.')

  const receiptStatus: NotificationConsentStatus = input.receiptOptIn
    ? 'opted-in'
    : current?.receiptStatus === 'opted-in' ? 'opted-out' : current?.receiptStatus ?? 'unknown'

  const reminderStatus: NotificationConsentStatus = input.reminderOptIn
    ? 'opted-in'
    : current?.reminderStatus === 'opted-in' ? 'opted-out' : current?.reminderStatus ?? 'unknown'

  const hasOptedOut = receiptStatus === 'opted-out' || reminderStatus === 'opted-out'
  const consentedPhoneE164 = hasOptIn ? phoneE164 : current?.consentedPhoneE164 ?? null

  const consentedAt = hasOptIn
    ? current?.consentedPhoneE164 === phoneE164 && current.consentedAt != null ? current.consentedAt : input.now
    : current?.consentedAt ?? null

  return {
    athleteId: input.athleteId,
    createdAt: current?.createdAt ?? input.now,
    receiptStatus,
    reminderStatus,
    consentedPhoneE164,
    consentedAt,
    consentSource: hasOptIn ? 'staff' : current?.consentSource ?? null,
    recordedBy: hasOptIn ? input.recordedBy : current?.recordedBy ?? null,
    optedOutAt: hasOptedOut ? current?.optedOutAt ?? input.now : current?.optedOutAt ?? null,
    optOutSource: hasOptedOut ? current?.optOutSource ?? 'staff' : current?.optOutSource ?? null,
    updatedAt: input.now,
    updatedBy: input.recordedBy,
  }
}

const consentStatuses: NotificationConsentStatus[] = ['unknown', 'opted-in', 'opted-out']
const consentSources = ['athlete', 'guardian', 'staff', 'webhook'] as const
const optOutSources = ['athlete', 'guardian', 'staff', 'webhook'] as const

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object'
const isTimestamp = (value: unknown): value is number | string => typeof value === 'number' || typeof value === 'string'
const nullableString = (value: unknown): string | null => value == null ? null : typeof value === 'string' ? value : null

export function parseNotificationConsent(value: unknown, athleteId?: string): NotificationConsent | null {
  if (!isRecord(value) || typeof value.athleteId !== 'string' || (athleteId && value.athleteId !== athleteId))
    return null

  if (!consentStatuses.includes(value.receiptStatus as NotificationConsentStatus) || !consentStatuses.includes(value.reminderStatus as NotificationConsentStatus))
    return null

  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt))
    return null

  const consentedPhoneE164 = value.consentedPhoneE164 == null ? null : normalizePhoneE164(String(value.consentedPhoneE164))
  if (value.consentedPhoneE164 != null && consentedPhoneE164 !== value.consentedPhoneE164)
    return null

  const consentSource = nullableString(value.consentSource)
  const optOutSource = nullableString(value.optOutSource)
  if (consentSource && !consentSources.includes(consentSource as typeof consentSources[number]))
    return null

  if (optOutSource && !optOutSources.includes(optOutSource as typeof optOutSources[number]))
    return null

  const normalizedConsentSource = consentSource as NotificationConsent['consentSource'] ?? null
  const normalizedOptOutSource = optOutSource as NotificationConsent['optOutSource'] ?? null

  if (value.consentedAt != null && !isTimestamp(value.consentedAt))
    return null

  if (value.optedOutAt != null && !isTimestamp(value.optedOutAt))
    return null

  if (value.recordedBy != null && typeof value.recordedBy !== 'string')
    return null

  if (value.updatedBy != null && typeof value.updatedBy !== 'string')
    return null

  return {
    athleteId: value.athleteId,
    createdAt: value.createdAt,
    receiptStatus: value.receiptStatus as NotificationConsentStatus,
    reminderStatus: value.reminderStatus as NotificationConsentStatus,
    consentedPhoneE164,
    consentedAt: value.consentedAt == null ? null : value.consentedAt as number | string,
    consentSource: normalizedConsentSource,
    recordedBy: nullableString(value.recordedBy),
    optedOutAt: value.optedOutAt == null ? null : value.optedOutAt as number | string,
    optOutSource: normalizedOptOutSource,
    updatedAt: value.updatedAt,
    updatedBy: nullableString(value.updatedBy),
  }
}

export function resolveWhatsAppEligibility(input: {
  athlete: Pick<Athlete, 'id' | 'status' | 'profile'>
  consent: NotificationConsent | null | undefined
  purpose: NotificationPurpose
}): NotificationEligibility {
  if (input.athlete.status !== 'active')
    return { eligible: false, recipient: null, reason: 'athlete-inactive' }

  if (!input.consent)
    return { eligible: false, recipient: null, reason: 'no-consent' }

  if (input.consent.athleteId !== input.athlete.id)
    return { eligible: false, recipient: null, reason: 'consent-mismatch' }

  const consentStatus = input.purpose === 'receipt'
    ? input.consent.receiptStatus
    : input.consent.reminderStatus

  if (consentStatus === 'opted-out')
    return { eligible: false, recipient: null, reason: 'opted-out' }

  if (consentStatus !== 'opted-in')
    return { eligible: false, recipient: null, reason: 'no-consent' }

  const recipient = normalizePhoneE164(input.athlete.profile.phone)
  if (!recipient)
    return { eligible: false, recipient: null, reason: 'invalid-phone' }

  if (input.consent.consentedPhoneE164 !== recipient)
    return { eligible: false, recipient: null, reason: 'phone-changed' }

  return { eligible: true, recipient, reason: 'eligible' }
}

export function buildPaymentNotificationKey(input: PaymentNotificationKeyInput): string {
  switch (input.kind) {
  case 'membership':
    return [
      'membership',
      requiredPart('athleteId', input.athleteId),
      requiredPart('period', input.period),
      requiredPart('installmentId', input.installmentId),
    ].join(':')
  case 'sale-initial':
    return 'sale-initial:' + requiredPart('saleId', input.saleId)
  case 'sale-payment':
    return 'sale-payment:' + requiredPart('saleId', input.saleId) + ':' + requiredPart('paymentId', input.paymentId)
  case 'sale-group':
    return 'sale-group:' + requiredPart('groupPaymentId', input.groupPaymentId)
  case 'combined':
    return [
      'combined',
      requiredPart('athleteId', input.athleteId),
      requiredPart('period', input.period),
      requiredPart('membershipInstallmentId', input.membershipInstallmentId),
    ].join(':')
  }
}

export function buildReminderNotificationKey(input: {
  athleteId: string
  localDate: string
  reminderKind: ReminderKind
  period: string
}): string {
  return [
    'reminder',
    requiredPart('athleteId', input.athleteId),
    requiredPart('localDate', input.localDate),
    requiredPart('reminderKind', input.reminderKind),
    requiredPart('period', input.period),
  ].join(':')
}

const parseCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null

  const date = new Date(value + 'T00:00:00.000Z')
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return null

  return date
}

export function getScheduledReminderKinds(input: {
  localDate: string
  dueDate: string
  monthlyDebt: number
  storeDebt: number
  storeWeekday?: number
}): ReminderKind[] {
  const localDate = parseCalendarDate(input.localDate)
  const dueDate = parseCalendarDate(input.dueDate)
  if (!localDate || !dueDate)
    return []

  const dayDifference = Math.round((localDate.getTime() - dueDate.getTime()) / 86_400_000)
  const monthlyDebt = currency(input.monthlyDebt)
  const storeDebt = currency(input.storeDebt)

  const monthlyKind = monthlyDebt <= 0
    ? null
    : dayDifference === -3
      ? 'pre-due' as const
      : dayDifference === 0
        ? 'due' as const
        : dayDifference === 7
          ? 'overdue' as const
          : null

  const storeKind = storeDebt > 0 && localDate.getUTCDay() === (input.storeWeekday ?? 1)
    ? 'store' as const
    : null

  if (storeKind && monthlyDebt > 0)
    return ['combined']

  return monthlyKind ? [monthlyKind] : storeKind ? [storeKind] : []
}

const allowedStatusTransitions: Record<NotificationStatus, readonly NotificationStatus[]> = {
  queued: ['processing', 'retryable-failed', 'terminal-failed', 'suppressed'],
  processing: ['accepted', 'retryable-failed', 'terminal-failed', 'suppressed', 'unknown'],
  accepted: ['sent', 'delivered', 'terminal-failed'],
  sent: ['delivered', 'read', 'terminal-failed'],
  delivered: ['read'],
  read: [],
  'retryable-failed': ['processing'],
  'terminal-failed': [],
  suppressed: [],
  unknown: [],
}

export function isNotificationStatusAdvance(from: NotificationStatus, to: NotificationStatus): boolean {
  return allowedStatusTransitions[from]?.includes(to) ?? false
}

export function sanitizeProviderError(input: { code?: unknown; message?: unknown }) {
  const code = typeof input.code === 'string' && input.code.trim()
    ? input.code.trim().slice(0, 64)
    : 'PROVIDER_ERROR'

  const message = String(input.message ?? 'Error no especificado del proveedor')
    .replace(/Authorization\s+Bearer\s+\S+/gi, 'Authorization Bearer [REDACTED]')
    .replace(/\+?\d{10,16}/g, '[REDACTED]')
    .slice(0, 240)

  return { code, message }
}
