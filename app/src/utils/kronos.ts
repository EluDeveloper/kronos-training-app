import type { ISOTimestamp, Sale } from '@/types/domain'

export const formatCurrency = (value: number) => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(value || 0)

export const formatDate = (value?: ISOTimestamp | null) => {
  if (!value)
    return '—'

  const date = typeof value === 'number' ? new Date(value) : new Date(value)

  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-MX')
}

export const timestampValue = (value?: ISOTimestamp | null) => {
  if (!value)
    return 0

  return typeof value === 'number' ? value : new Date(value).getTime()
}

export const saleAppliedAmount = (sale: Sale) => Object.values(sale.payments ?? {})
  .reduce((total, payment) => total + Number(payment.amountApplied || 0), 0)

export const saleBalance = (sale: Sale) => Math.max(0, sale.total - saleAppliedAmount(sale))
