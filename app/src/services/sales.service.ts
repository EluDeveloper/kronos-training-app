import type { PaymentMethod, Sale, StoreCreditAccount, StoreCreditEntry } from '@/types/domain'
import { get, increment, push, ref, update } from 'firebase/database'
import { businessPath, requireDatabase, serverTimestamp, subscribeCollection, type ErrorHandler } from './realtime.service'
import { saleAppliedAmount } from '@/utils/kronos'

export type NewSale = Omit<Sale, 'id' | 'createdAt' | 'updatedAt'>

const currency = (value: number) => Math.round(Number(value || 0) * 100) / 100

async function loadCreditAccount(athleteId?: string | null) {
  if (!athleteId)
    return null

  const database = requireDatabase()
  const snapshot = await get(ref(database, businessPath(`storeCredits/${athleteId}`)))

  return snapshot.exists() ? snapshot.val() as StoreCreditAccount : null
}

function creditEntry(id: string, type: StoreCreditEntry['type'], amount: number, saleId: string, occurredAt: number, balanceAfter: number): StoreCreditEntry {
  const descriptions: Record<StoreCreditEntry['type'], string> = {
    deposit: 'Excedente dejado como saldo a favor',
    application: 'Saldo aplicado a compra',
    refund: 'Reintegro por cancelación de venta',
  }

  return { id, type, amount, saleId, description: descriptions[type], occurredAt, balanceAfter }
}

export const salesService = {
  subscribe: (onChange: (items: Sale[]) => void, onError: ErrorHandler) => subscribeCollection<Sale>('sales', onChange, onError),
  async create(sale: NewSale, creditDeposit = 0, creditApplied = 0) {
    const database = requireDatabase()
    const saleRef = push(ref(database, businessPath('sales')))
    const saleId = saleRef.key

    if (!saleId)
      throw new Error('No fue posible generar el ID de venta.')

    const deposit = currency(creditDeposit)
    const applied = currency(creditApplied)
    if ((deposit > 0 || applied > 0) && !sale.athleteId)
      throw new Error('El saldo a favor sólo está disponible para atletas registrados.')

    const account = await loadCreditAccount(sale.athleteId)
    const startingCredit = currency(account?.balance ?? 0)
    if (applied > startingCredit)
      throw new Error('El saldo a favor disponible cambió. Actualiza la venta e intenta de nuevo.')

    const afterApplication = currency(startingCredit - applied)
    const finalCredit = currency(afterApplication + deposit)
    const now = Date.now()

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

    if (sale.athleteId && (deposit > 0 || applied > 0)) {
      updates[`storeCredits/${sale.athleteId}/athleteId`] = sale.athleteId
      updates[`storeCredits/${sale.athleteId}/balance`] = finalCredit
      updates[`storeCredits/${sale.athleteId}/createdAt`] = account?.createdAt ?? now
      updates[`storeCredits/${sale.athleteId}/updatedAt`] = now
      if (applied > 0) {
        const entryId = `application-${saleId}`

        updates[`storeCredits/${sale.athleteId}/entries/${entryId}`] = creditEntry(entryId, 'application', applied, saleId, now, afterApplication)
      }
      if (deposit > 0) {
        const entryId = `deposit-${saleId}`

        updates[`storeCredits/${sale.athleteId}/entries/${entryId}`] = creditEntry(entryId, 'deposit', deposit, saleId, now, finalCredit)
      }
    }

    await update(ref(database, businessPath('')), updates)

    return saleId
  },
  async addPayment(saleId: string, amountApplied: number, method: string, receivedAmount = amountApplied, changeGiven = 0, creditDeposit = 0) {
    const database = requireDatabase()
    const paymentId = push(ref(database, businessPath(`sales/${saleId}/payments`))).key

    if (!paymentId)
      throw new Error('No fue posible generar el ID del abono.')

    const snapshot = await get(ref(database, businessPath(`sales/${saleId}`)))
    const sale = snapshot.exists() ? snapshot.val() as Sale : null
    const balance = sale ? Math.max(0, Number(sale.total) - saleAppliedAmount(sale)) : 0
    const amount = currency(amountApplied)
    const deposit = currency(creditDeposit)

    if (!sale || sale.status === 'cancelled' || amount <= 0 || amount > balance + 0.01)
      throw new Error('El abono no pudo aplicarse. Verifica el saldo actual.')

    if (deposit > 0 && !sale.athleteId)
      throw new Error('Sólo un atleta registrado puede guardar el excedente como saldo a favor.')

    const account = await loadCreditAccount(sale.athleteId)
    const finalCredit = currency(Number(account?.balance || 0) + deposit)
    const appliedAt = Date.now()

    const payment = {
      id: paymentId,
      amountApplied: amount,
      method: method as PaymentMethod,
      receivedAmount: currency(receivedAmount),
      changeGiven: currency(changeGiven),
      ...(deposit > 0 ? { creditBalance: finalCredit } : {}),
      appliedAt,
    }

    const updates: Record<string, unknown> = {
      [`sales/${saleId}/payments/${paymentId}`]: payment,
      [`sales/${saleId}/status`]: amount >= balance - 0.01 ? 'paid' : 'credit',
      [`sales/${saleId}/updatedAt`]: appliedAt,
    }

    if (sale.athleteId && deposit > 0) {
      const entryId = `deposit-${paymentId}`

      updates[`storeCredits/${sale.athleteId}/athleteId`] = sale.athleteId
      updates[`storeCredits/${sale.athleteId}/balance`] = finalCredit
      updates[`storeCredits/${sale.athleteId}/createdAt`] = account?.createdAt ?? appliedAt
      updates[`storeCredits/${sale.athleteId}/updatedAt`] = appliedAt
      updates[`storeCredits/${sale.athleteId}/entries/${entryId}`] = creditEntry(entryId, 'deposit', deposit, saleId, appliedAt, finalCredit)
    }

    await update(ref(database, businessPath('')), updates)

    const updatedSale: Sale = {
      ...sale,
      status: amount >= balance - 0.01 ? 'paid' : 'credit',
      payments: { ...(sale.payments ?? {}), [paymentId]: payment },
      updatedAt: appliedAt,
    }

    return { sale: updatedSale, payment }
  },
  async cancel(saleId: string) {
    const database = requireDatabase()
    const saleRef = ref(database, businessPath(`sales/${saleId}`))
    const snapshot = await get(saleRef)
    const sale = snapshot.exists() ? snapshot.val() as Sale : null

    if (!sale || sale.inventoryRestoredAt)
      throw new Error('La venta ya fue cancelada y su inventario fue restituido, o dejó de existir.')

    const now = Date.now()

    await update(saleRef, {
      status: 'cancelled',
      cancelledAt: sale.cancelledAt ?? now,
      updatedAt: now,
    })

    const updates: Record<string, unknown> = {
      [`sales/${saleId}/status`]: 'cancelled',
      [`sales/${saleId}/cancelledAt`]: sale.cancelledAt ?? now,
      [`sales/${saleId}/inventoryRestoredAt`]: now,
      [`sales/${saleId}/updatedAt`]: now,
    }

    Object.values(sale.items ?? {}).forEach(item => {
      updates[`products/${item.productId}/stock`] = increment(Number(item.quantity || 0))
      updates[`products/${item.productId}/inventoryAdjustments/${saleId}`] = now
      updates[`products/${item.productId}/updatedAt`] = now
    })

    const appliedCredit = Object.values(sale.payments ?? {})
      .filter(payment => payment.method === 'store-credit')
      .reduce((total, payment) => total + Number(payment.amountApplied || 0), 0)

    if (sale.athleteId && appliedCredit > 0 && !sale.storeCreditRestoredAt) {
      const account = await loadCreditAccount(sale.athleteId)
      const finalCredit = currency(Number(account?.balance || 0) + appliedCredit)
      const entryId = `refund-${saleId}`

      updates[`storeCredits/${sale.athleteId}/athleteId`] = sale.athleteId
      updates[`storeCredits/${sale.athleteId}/balance`] = finalCredit
      updates[`storeCredits/${sale.athleteId}/createdAt`] = account?.createdAt ?? now
      updates[`storeCredits/${sale.athleteId}/updatedAt`] = now
      updates[`storeCredits/${sale.athleteId}/entries/${entryId}`] = creditEntry(entryId, 'refund', appliedCredit, saleId, now, finalCredit)
      updates[`sales/${saleId}/storeCreditRestoredAt`] = now
    }

    await update(ref(database, businessPath('')), updates)
  },
}
