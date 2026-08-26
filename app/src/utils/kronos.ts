import type { ISOTimestamp, MembershipPaymentInstallment, Payment, Sale } from '@/types/domain'

export const formatCurrency = (value: number) => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(value || 0)

export const formatDate = (value?: ISOTimestamp | null) => {
  if (!value)
    return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-MX')
}

export const normalizeSearchTerm = (value?: string | null) => (value ?? '').toLocaleLowerCase('es')

export const timestampValue = (value?: ISOTimestamp | null) => {
  if (!value)
    return 0

  return typeof value === 'number' ? value : new Date(value).getTime()
}

export const membershipPaidAmount = (payment?: Payment | null) => Math.max(0, Number(payment?.amount || 0))

export const membershipTotalAmount = (payment?: Payment | null, fallback = 0) => {
  const paid = membershipPaidAmount(payment)
  const explicitTotal = Number(payment?.totalAmount || 0)

  return Math.max(paid, explicitTotal > 0 ? explicitTotal : Number(fallback || 0))
}

export const membershipBalance = (payment?: Payment | null, fallback = 0) => {
  if (payment?.balance != null)
    return Math.max(0, Number(payment.balance || 0))

  if (payment?.status === 'paid')
    return 0

  return Math.max(0, membershipTotalAmount(payment, fallback) - membershipPaidAmount(payment))
}

export const membershipInstallments = (payment: Payment): MembershipPaymentInstallment[] => {
  const installments = Object.values(payment.installments ?? {})

  if (installments.length)
    return installments.sort((a, b) => timestampValue(a.appliedAt) - timestampValue(b.appliedAt))

  const amountApplied = membershipPaidAmount(payment)
  if (!amountApplied)
    return []

  return [{
    id: `legacy-${payment.athleteId}-${payment.period}`,
    amountApplied,
    method: payment.method ?? 'other',
    appliedAt: payment.appliedAt ?? payment.updatedAt,
    balanceAfter: membershipBalance(payment),
  }]
}

export const saleAppliedAmount = (sale: Sale) => Object.values(sale.payments ?? {})
  .reduce((total, payment) => total + Number(payment.amountApplied || 0), 0)

export const saleBalance = (sale: Sale) => Math.max(0, sale.total - saleAppliedAmount(sale))
