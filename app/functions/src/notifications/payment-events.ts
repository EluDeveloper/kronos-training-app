export type PaymentEventKind = 'membership' | 'sale-initial' | 'sale-payment' | 'sale-group' | 'combined'

export interface PaymentAppliedEvent {
  kind: PaymentEventKind
  correlationKey: string
  athleteId: string | null
  referenceId: string
  period?: string
  amountApplied: number
  occurredAt: number | string | null
}

export interface MembershipPaymentEventInput {
  athleteId: string
  period: string
  before: unknown
  after: unknown
}

export interface SalePaymentEventInput {
  saleId: string
  before: unknown
  after: unknown
}

const appliedStatuses = new Set(['applied', 'paid', 'completed', 'settled', 'liquidated'])

export function detectMembershipPaymentEvents(input: MembershipPaymentEventInput): PaymentAppliedEvent[] {
  if (!isKeyPart(input.athleteId) || !isKeyPart(input.period))
    return []

  const before = asRecord(input.before)
  const after = asRecord(input.after)
  const afterInstallments = asRecord(after?.installments)
  if (!afterInstallments)
    return []

  const beforeInstallments = asRecord(before?.installments)
  return Object.keys(afterInstallments).sort().flatMap(installmentId => {
    if (!isKeyPart(installmentId))
      return []

    const current = afterInstallments[installmentId]
    const previous = beforeInstallments?.[installmentId]
    if (!hasAppliedTransition(previous, current))
      return []

    return [{
      kind: 'membership' as const,
      correlationKey: `membership:${input.athleteId}:${input.period}:${installmentId}`,
      athleteId: input.athleteId,
      referenceId: installmentId,
      period: input.period,
      amountApplied: appliedAmount(current),
      occurredAt: occurredAt(current, after),
    }]
  })
}

export function detectSalePaymentEvents(input: SalePaymentEventInput): PaymentAppliedEvent[] {
  if (!isKeyPart(input.saleId))
    return []

  const before = asRecord(input.before)
  const after = asRecord(input.after)
  if (!after)
    return []

  const athleteId = text(after.athleteId)
  if (isPaidSale(after) && !before) {
    return [{
      kind: 'sale-initial',
      correlationKey: `sale-initial:${input.saleId}`,
      athleteId,
      referenceId: input.saleId,
      amountApplied: firstAmount(after, ['amountApplied', 'total']),
      occurredAt: occurredAt(after, after),
    }]
  }

  const afterPayments = asRecord(after.payments)
  if (!afterPayments)
    return []
  const beforePayments = asRecord(before?.payments)
  const seenKeys = new Set<string>()

  return Object.keys(afterPayments).sort().flatMap(paymentId => {
    if (!isKeyPart(paymentId))
      return []

    const payment = asRecord(afterPayments[paymentId])
    if (!payment || !hasAppliedTransition(beforePayments?.[paymentId], payment))
      return []

    const groupPaymentId = text(payment.groupPaymentId)
    const period = text(payment.membershipPeriod)
    const installmentId = text(payment.membershipInstallmentId)
    const hasCombinedIdentity = Boolean(athleteId && period && installmentId)
    const kind: PaymentEventKind = groupPaymentId
      ? 'sale-group'
      : hasCombinedIdentity ? 'combined' : 'sale-payment'
    const correlationKey = groupPaymentId
      ? `sale-group:${groupPaymentId}`
      : hasCombinedIdentity
        ? `combined:${athleteId}:${period}:${installmentId}`
        : `sale-payment:${input.saleId}:${paymentId}`

    if (seenKeys.has(correlationKey))
      return []
    seenKeys.add(correlationKey)

    return [{
      kind,
      correlationKey,
      athleteId,
      referenceId: groupPaymentId ?? paymentId,
      ...(period ? { period } : {}),
      amountApplied: firstAmount(payment, ['amountApplied', 'amount', 'appliedAmount']),
      occurredAt: occurredAt(payment, after),
    }]
  })
}

function hasAppliedTransition(previous: unknown, current: unknown): boolean {
  return isApplied(current) && !isApplied(previous)
}

function isApplied(value: unknown): boolean {
  const record = asRecord(value)
  if (!record)
    return false

  const status = text(record.status)?.toLocaleLowerCase('en-US')
  return Boolean(
    (status && appliedStatuses.has(status))
    || record.applied === true
    || record.paid === true
    || record.isPaid === true
    || appliedAmount(record) > 0,
  )
}

function appliedAmount(value: unknown): number {
  return firstAmount(asRecord(value), ['amountApplied', 'appliedAmount', 'amountPaid', 'paidAmount'])
}

function firstAmount(value: Record<string, unknown> | null, fields: readonly string[]): number {
  if (!value)
    return 0

  for (const field of fields) {
    const raw = value[field]
    const amount = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN
    if (Number.isFinite(amount))
      return Math.max(0, Math.round(amount * 100) / 100)
  }
  return 0
}

function occurredAt(value: unknown, fallback: unknown): number | string | null {
  const record = asRecord(value)
  const fallbackRecord = asRecord(fallback)
  const candidate = record?.appliedAt ?? record?.paidAt ?? record?.updatedAt ?? fallbackRecord?.updatedAt
  return typeof candidate === 'number' || typeof candidate === 'string' ? candidate : null
}

function isPaidSale(value: Record<string, unknown> | null): boolean {
  const status = text(value?.status)?.toLocaleLowerCase('en-US')
  return status === 'paid'
}

function isKeyPart(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes(':')
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
