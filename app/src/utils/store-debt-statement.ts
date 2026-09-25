import type { Athlete, Sale } from '@/types/domain'
import type { ReceiptData, ReceiptLine } from '@/utils/receipts'
import { saleAppliedAmount, saleBalance, timestampValue } from '@/utils/kronos'
import { effectiveSaleStatus } from '@/utils/store-payment-adjustments'

export interface StoreDebtStatementInput {
  athlete: Athlete
  sales: Sale[]
  issuedAt: number
}

const currency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const folioSuffix = (value: string) => value.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase().padStart(6, '0')

export const eligibleStoreDebtSales = (athleteId: string, sales: Sale[]) => sales
  .filter(sale => sale.athleteId === athleteId && effectiveSaleStatus(sale) !== 'cancelled' && saleBalance(sale) > 0.01)
  .sort((left, right) => timestampValue(left.createdAt) - timestampValue(right.createdAt) || left.id.localeCompare(right.id))

function statementLine(sale: Sale): ReceiptLine {
  const products = Object.values(sale.items ?? {})
    .map(item => `${item.quantity} × ${item.name}`)
    .join(', ')

  const adjustments = Object.keys(sale.paymentAdjustments ?? {}).length
  const detail = `Venta VEN-${folioSuffix(sale.id)} · Original ${currency(sale.total)} · Abonado ${saleAppliedAmount(sale)}${adjustments ? ` · ${adjustments} ajuste${adjustments === 1 ? '' : 's'}` : ''}`

  return {
    description: `${products || 'Artículos de tienda'} · ${detail}`,
    amount: saleBalance(sale),
  }
}

export function buildStoreDebtStatement({ athlete, sales, issuedAt }: StoreDebtStatementInput): ReceiptData {
  if (!sales.length)
    throw new Error('Selecciona al menos un adeudo de tienda.')
  if (sales.some(sale => sale.athleteId !== athlete.id))
    throw new Error('Todos los adeudos deben pertenecer al mismo atleta.')

  const eligible = eligibleStoreDebtSales(athlete.id, sales)
  if (eligible.length !== sales.length)
    throw new Error('La selección contiene una venta cancelada o sin saldo pendiente.')

  const total = currency(eligible.reduce((sum, sale) => sum + Number(sale.total || 0), 0))
  const amountPaid = currency(eligible.reduce((sum, sale) => sum + saleAppliedAmount(sale), 0))
  const balance = currency(eligible.reduce((sum, sale) => sum + saleBalance(sale), 0))

  return {
    kind: 'store-statement',
    folio: `TDA-${new Date(issuedAt).getFullYear()}-${folioSuffix(`${athlete.id}-${issuedAt}`)}`,
    issuedAt,
    customerName: athlete.profile.name,
    concept: `Estado de cuenta de tienda · ${eligible.length} adeudo${eligible.length === 1 ? '' : 's'}`,
    lines: eligible.map(statementLine),
    method: null,
    total,
    amountPaid,
    balance,
  }
}
