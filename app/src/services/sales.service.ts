import type { PaymentMethod, Sale, SalePayment, SalePaymentAdjustmentKind, StoreCreditAccount, StoreCreditEntry } from '@/types/domain'
import { get, increment, push, ref, update } from 'firebase/database'
import { businessPath, requireDatabase, serverTimestamp, subscribeCollection, type ErrorHandler } from './realtime.service'
import { saleAppliedAmount, timestampValue } from '@/utils/kronos'
import {
  buildSalePaymentAdjustment,
  buildStoreCreditReversalPlan,
  effectiveSaleStatus,
  resolveSalePaymentStates,
} from '@/utils/store-payment-adjustments'

export type NewSale = Omit<Sale, 'id' | 'createdAt' | 'updatedAt'>

export interface StorePaymentAdjustmentRequest {
  saleId: string
  paymentId: string
  kind: SalePaymentAdjustmentKind
  toMethod?: PaymentMethod
}

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
    reversal: 'Retiro de saldo por reverso de cobro',
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
  async addGroupedPayment(saleIds: string[], amountApplied: number, method: string, receivedAmount = amountApplied, changeGiven = 0, creditDeposit = 0) {
    const database = requireDatabase()
    const uniqueSaleIds = [...new Set(saleIds.filter(Boolean))]

    if (uniqueSaleIds.length < 2)
      throw new Error('Selecciona al menos dos adeudos del mismo atleta.')

    const snapshots = await Promise.all(uniqueSaleIds.map(saleId => get(ref(database, businessPath(`sales/${saleId}`)))))
    const sales = snapshots.map(snapshot => snapshot.exists() ? snapshot.val() as Sale : null)

    if (sales.some(sale => !sale))
      throw new Error('Uno de los adeudos dejó de existir. Actualiza e intenta de nuevo.')

    const openSales = (sales as Sale[])
      .filter(sale => sale.status !== 'cancelled' && saleAppliedAmount(sale) < Number(sale.total || 0))
      .sort((a, b) => timestampValue(a.createdAt) - timestampValue(b.createdAt) || a.id.localeCompare(b.id))

    if (openSales.length !== uniqueSaleIds.length)
      throw new Error('El saldo de uno de los adeudos cambió. Actualiza e intenta de nuevo.')

    const athleteId = openSales[0]?.athleteId
    if (!athleteId || openSales.some(sale => sale.athleteId !== athleteId))
      throw new Error('El cobro conjunto sólo está disponible para adeudos del mismo atleta.')

    const balances = new Map(openSales.map(sale => [sale.id, currency(Math.max(0, Number(sale.total) - saleAppliedAmount(sale)))]))
    const totalBalance = currency([...balances.values()].reduce((total, balance) => total + balance, 0))
    const amount = currency(amountApplied)
    const received = currency(receivedAmount)
    const deposit = currency(creditDeposit)

    if (amount <= 0 || Math.abs(amount - totalBalance) > 0.01)
      throw new Error('El total de los adeudos cambió. Actualiza e intenta cobrar nuevamente.')
    if (received < amount)
      throw new Error('El efectivo recibido es menor que el abono conjunto.')

    const groupPaymentId = push(ref(database, businessPath('paymentGroups'))).key
    if (!groupPaymentId)
      throw new Error('No fue posible generar el identificador del cobro conjunto.')

    const account = await loadCreditAccount(athleteId)
    const finalCredit = currency(Number(account?.balance || 0) + deposit)
    const appliedAt = Date.now()
    const updates: Record<string, unknown> = {}
    const results: Array<{ sale: Sale; payment: SalePayment }> = []
    let remaining = amount

    for (const [index, sale] of openSales.entries()) {
      if (remaining <= 0)
        break

      const balance = balances.get(sale.id) ?? 0
      const applied = currency(Math.min(balance, remaining))
      const paymentId = push(ref(database, businessPath(`sales/${sale.id}/payments`))).key
      if (!paymentId)
        throw new Error('No fue posible generar uno de los movimientos del cobro.')

      const payment = {
        id: paymentId,
        amountApplied: applied,
        method: method as PaymentMethod,
        ...(index === 0 ? { receivedAmount: received, changeGiven: currency(changeGiven) } : {}),
        ...(index === 0 && deposit > 0 ? { creditBalance: finalCredit } : {}),
        groupPaymentId,
        appliedAt,
      }

      const status: Sale['status'] = applied >= balance - 0.01 ? 'paid' : 'credit'

      updates[`sales/${sale.id}/payments/${paymentId}`] = payment
      updates[`sales/${sale.id}/status`] = status
      updates[`sales/${sale.id}/updatedAt`] = appliedAt
      results.push({
        sale: {
          ...sale,
          status,
          payments: { ...(sale.payments ?? {}), [paymentId]: payment },
          updatedAt: appliedAt,
        },
        payment,
      })
      remaining = currency(remaining - applied)
    }

    if (deposit > 0) {
      const entryId = `deposit-${groupPaymentId}`

      updates[`storeCredits/${athleteId}/athleteId`] = athleteId
      updates[`storeCredits/${athleteId}/balance`] = finalCredit
      updates[`storeCredits/${athleteId}/createdAt`] = account?.createdAt ?? appliedAt
      updates[`storeCredits/${athleteId}/updatedAt`] = appliedAt
      updates[`storeCredits/${athleteId}/entries/${entryId}`] = creditEntry(entryId, 'deposit', deposit, openSales[0].id, appliedAt, finalCredit)
    }

    await update(ref(database, businessPath('')), updates)

    return { groupPaymentId, entries: results }
  },
  async adjustPayments(requests: StorePaymentAdjustmentRequest[], reason: string, actorUid: string) {
    const database = requireDatabase()
    const cleanReason = reason.trim()
    const cleanActor = actorUid.trim()
    const uniqueRequests = [...new Map(requests.map(request => [`${request.saleId}:${request.paymentId}`, request])).values()]

    if (!uniqueRequests.length)
      throw new Error('Selecciona al menos un cobro para corregir.')
    if (cleanReason.length < 3)
      throw new Error('Captura un motivo de al menos tres caracteres.')
    if (!cleanActor)
      throw new Error('No fue posible identificar a la persona que realiza la corrección.')

    const salesSnapshot = await get(ref(database, businessPath('sales')))
    const allSales = salesSnapshot.exists() ? Object.values(salesSnapshot.val() as Record<string, Sale>) : []
    const salesById = new Map(allSales.map(sale => [sale.id, sale]))

    const selected = uniqueRequests.map(request => {
      const sale = salesById.get(request.saleId)
      const payment = sale?.payments?.[request.paymentId]
      if (!sale || !payment)
        throw new Error('Uno de los cobros dejó de existir. Actualiza e intenta nuevamente.')
      if (sale.status === 'cancelled')
        throw new Error('No se puede corregir el cobro de una venta cancelada.')

      return { request, sale, payment }
    })

    const customerKeys = new Set(selected.map(({ sale }) => sale.athleteId ? `athlete:${sale.athleteId}` : `visitor:${sale.visitorId ?? sale.customerName}`))
    if (customerKeys.size > 1)
      throw new Error('Los cobros seleccionados deben pertenecer al mismo cliente.')

    const operationId = push(ref(database, businessPath('paymentAdjustments'))).key
    if (!operationId)
      throw new Error('No fue posible generar el identificador de la corrección.')

    const occurredAt = Date.now()
    const updates: Record<string, unknown> = {}
    const projectedSales = new Map<string, Sale>()
    const adjustments = []

    for (const [index, { request, sale }] of selected.entries()) {
      const currentSale = projectedSales.get(sale.id) ?? sale

      const adjustmentId = request.kind === 'reversal'
        ? `reversal-${request.paymentId}`
        : `${operationId}-${index + 1}`

      const adjustment = buildSalePaymentAdjustment(currentSale, {
        id: adjustmentId,
        paymentId: request.paymentId,
        kind: request.kind,
        ...(request.toMethod ? { toMethod: request.toMethod } : {}),
        reason: cleanReason,
        createdBy: cleanActor,
        createdAt: occurredAt,
      })

      const projected: Sale = {
        ...currentSale,
        paymentAdjustments: { ...(currentSale.paymentAdjustments ?? {}), [adjustment.id]: adjustment },
      }

      projectedSales.set(sale.id, projected)
      adjustments.push(adjustment)
      updates[`sales/${sale.id}/paymentAdjustments/${adjustment.id}`] = adjustment
    }

    const reversalTargets = selected
      .filter(({ request }) => request.kind === 'reversal')
      .map(({ sale, payment }) => ({ sale, paymentId: payment.id }))

    const athleteId = reversalTargets[0]?.sale.athleteId
    const account = await loadCreditAccount(athleteId)

    for (const { payment } of selected.filter(({ request }) => request.kind === 'reversal')) {
      if (!payment.groupPaymentId || !account?.entries?.[`deposit-${payment.groupPaymentId}`])
        continue

      const selectedGroupPayments = new Set(reversalTargets
        .filter(target => target.sale.payments?.[target.paymentId]?.groupPaymentId === payment.groupPaymentId)
        .map(target => `${target.sale.id}:${target.paymentId}`))

      const effectiveGroupPayments = allSales.flatMap(candidate => resolveSalePaymentStates(candidate)
        .filter(state => !state.reversed && state.original.groupPaymentId === payment.groupPaymentId)
        .map(state => `${candidate.id}:${state.original.id}`))

      if (effectiveGroupPayments.some(key => !selectedGroupPayments.has(key)))
        throw new Error('El cobro agrupado generó saldo a favor; revierte el grupo completo para conservar la conciliación.')
    }

    const creditPlan = buildStoreCreditReversalPlan(reversalTargets, account, occurredAt, operationId, cleanActor)
    if (creditPlan && account) {
      updates[`storeCredits/${creditPlan.athleteId}/balance`] = creditPlan.balance
      updates[`storeCredits/${creditPlan.athleteId}/updatedAt`] = occurredAt
      for (const entry of creditPlan.entries) {
        updates[`storeCredits/${creditPlan.athleteId}/entries/${entry.id}`] = entry
        updates[`storeCredits/${creditPlan.athleteId}/lastAdjustmentId`] = entry.id
      }
    }

    await update(ref(database, businessPath('')), updates)

    return {
      operationId,
      adjustments,
      sales: [...projectedSales.values()].map(sale => ({ ...sale, status: effectiveSaleStatus(sale) })),
      storeCreditBalance: creditPlan?.balance,
    }
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

    const appliedCredit = resolveSalePaymentStates(sale)
      .filter(state => !state.reversed)
      .map(state => ({ ...state.original, method: state.effectiveMethod }))
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
