import type { AppUser } from '@/types/access'
import type { KioskSettings, Product, Sale } from '@/types/domain'

const currency = (value: number) => Math.round(value * 100) / 100
const finiteNumber = (value: unknown) => {
  const numeric = Number(value)

  return Number.isFinite(numeric) ? numeric : 0
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
)

export const normalizeCustomerKey = (value: unknown) => typeof value === 'string' ? value : ''

export const removeCartItem = <T>(cart: Readonly<Record<string, T>>, productId: string): Record<string, T> => {
  if (!(productId in cart))
    return { ...cart }

  const next = { ...cart }

  delete next[productId]

  return next
}

export const availableStoreProducts = (products: readonly Product[]) => products.filter(product => (
  product.status === 'active' && finiteNumber(product.stock) > 0
))

export const calculateGrossProfit = (sales: readonly Sale[]) => currency(sales
  .filter(sale => sale.status !== 'cancelled')
  .flatMap(sale => Object.values(sale.items ?? {}))
  .reduce((total, item) => total + (
    finiteNumber(item.unitPrice) - finiteNumber(item.unitCost)
  ) * finiteNumber(item.quantity), 0))

export function parseKioskSettings(value: unknown): KioskSettings | null {
  if (!isRecord(value))
    return null

  const allowedKeys = new Set(['paymentNowMode', 'paymentNowUserIds', 'updatedBy', 'updatedAt'])
  if (Object.keys(value).some(key => !allowedKeys.has(key)))
    return null

  const mode = value.paymentNowMode
  const updatedBy = value.updatedBy
  const updatedAt = value.updatedAt
  let normalizedUpdatedAt: number | string

  if (typeof updatedAt === 'number' && Number.isFinite(updatedAt))
    normalizedUpdatedAt = updatedAt
  else if (typeof updatedAt === 'string' && updatedAt.length > 0 && !Number.isNaN(new Date(updatedAt).getTime()))
    normalizedUpdatedAt = updatedAt
  else
    return null

  if ((mode !== 'disabled' && mode !== 'all-admins' && mode !== 'selected-admins')
    || typeof updatedBy !== 'string' || !updatedBy)
    return null

  if (mode !== 'selected-admins') {
    if (value.paymentNowUserIds != null)
      return null

    return { paymentNowMode: mode, paymentNowUserIds: null, updatedBy, updatedAt: normalizedUpdatedAt }
  }

  if (!isRecord(value.paymentNowUserIds))
    return null

  const ids = Object.entries(value.paymentNowUserIds)
  if (!ids.length || ids.some(([uid, enabled]) => !uid || enabled !== true))
    return null

  return {
    paymentNowMode: mode,
    paymentNowUserIds: Object.fromEntries(ids) as Record<string, true>,
    updatedBy,
    updatedAt: normalizedUpdatedAt,
  }
}

export const isKioskPaymentNowAllowed = (settings: KioskSettings | null, user: AppUser | null) => {
  if (!settings || !user?.enabled || user.role !== 'admin')
    return false
  if (settings.paymentNowMode === 'all-admins')
    return true
  if (settings.paymentNowMode !== 'selected-admins')
    return false

  return settings.paymentNowUserIds?.[user.uid] === true
}
