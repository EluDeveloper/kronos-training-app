import type { Sale } from '@/types/domain'
import { increment, push, ref, runTransaction, update } from 'firebase/database'
import { businessPath, requireDatabase, serverTimestamp, subscribeCollection, type ErrorHandler } from './realtime.service'
import { saleAppliedAmount } from '@/utils/kronos'

export type NewSale = Omit<Sale, 'id' | 'createdAt' | 'updatedAt'>

export const salesService = {
  subscribe: (onChange: (items: Sale[]) => void, onError: ErrorHandler) => subscribeCollection<Sale>('sales', onChange, onError),
  async create(sale: NewSale) {
    const database = requireDatabase()
    const saleRef = push(ref(database, businessPath('sales')))
    const saleId = saleRef.key

    if (!saleId)
      throw new Error('No fue posible generar el ID de venta.')

    const updates: Record<string, unknown> = {
      [`sales/${saleId}`]: {
        ...sale,
        id: saleId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    }

    Object.values(sale.items).forEach(item => {
      updates[`products/${item.productId}/stock`] = increment(-item.quantity)
      updates[`products/${item.productId}/updatedAt`] = serverTimestamp()
    })

    await update(ref(database, businessPath('')), updates)

    return saleId
  },
  async addPayment(saleId: string, amountApplied: number, method: string, receivedAmount = amountApplied, changeGiven = 0) {
    const database = requireDatabase()
    const paymentId = push(ref(database, businessPath(`sales/${saleId}/payments`))).key

    if (!paymentId)
      throw new Error('No fue posible generar el ID del abono.')

    const result = await runTransaction(ref(database, businessPath(`sales/${saleId}`)), current => {
      if (!current || current.status === 'cancelled')
        return

      const applied = saleAppliedAmount(current as Sale)
      const balance = Math.max(0, Number(current.total) - applied)

      if (amountApplied <= 0 || amountApplied > balance + 0.01)
        return

      current.payments = current.payments ?? {}
      current.payments[paymentId] = {
        id: paymentId,
        amountApplied,
        method,
        receivedAmount,
        changeGiven,
        appliedAt: Date.now(),
      }
      current.status = amountApplied >= balance - 0.01 ? 'paid' : 'credit'
      current.updatedAt = Date.now()

      return current
    })

    if (!result.committed)
      throw new Error('El abono no pudo aplicarse. Verifica el saldo actual.')
  },
  async cancel(saleId: string) {
    const database = requireDatabase()
    const saleRef = ref(database, businessPath(`sales/${saleId}`))
    const result = await runTransaction(saleRef, current => {
      const sale = current as Sale | null
      if (!sale || sale.inventoryRestoredAt)
        return
      if (sale.status !== 'cancelled') {
        sale.status = 'cancelled'
        sale.cancelledAt = Date.now()
        sale.updatedAt = Date.now()
      }
      return sale
    })

    if (!result.committed)
      throw new Error('La venta ya fue cancelada y su inventario fue restituido, o dejó de existir.')

    const sale = result.snapshot.val() as Sale
    await Promise.all(Object.values(sale.items ?? {}).map(item => runTransaction(
      ref(database, businessPath(`products/${item.productId}`)),
      current => {
        if (!current)
          return
        current.inventoryAdjustments = current.inventoryAdjustments ?? {}
        if (current.inventoryAdjustments[saleId])
          return current
        current.stock = Number(current.stock || 0) + Number(item.quantity || 0)
        current.inventoryAdjustments[saleId] = Date.now()
        current.updatedAt = Date.now()
        return current
      },
    )))
    await update(saleRef, { inventoryRestoredAt: serverTimestamp(), updatedAt: serverTimestamp() })
  },
}
