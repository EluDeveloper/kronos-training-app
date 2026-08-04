import { child, get, push, ref, runTransaction, update } from 'firebase/database'
import type { MembershipPaymentInstallment, Payment, PaymentMethod, Sale, SalePayment } from '@/types/domain'
import { businessPath, requireDatabase, subscribeValue, type ErrorHandler } from './realtime.service'
import { saleBalance } from '@/utils/kronos'

type PaymentTree = Record<string, Record<string, Omit<Payment, 'athleteId' | 'period'>>>

export interface MembershipInstallmentInput {
  athleteId: string
  period: string
  totalAmount: number
  amount: number
  method: PaymentMethod
  concept?: string
  visitCount?: number
}

export interface AppliedMembershipInstallment {
  payment: Payment
  installment: MembershipPaymentInstallment
  settledSales: Array<{ sale: Sale; payment: SalePayment }>
}

const currency = (value: number) => Math.round(value * 100) / 100

function updatedPayment(current: Payment | null, input: MembershipInstallmentInput, installmentId: string, appliedAt: number) {
  const amount = currency(Number(input.amount))
  const requestedTotal = currency(Number(input.totalAmount))
  const paid = currency(Math.max(0, Number(current?.amount || 0)))
  const storedTotal = currency(Math.max(0, Number(current?.totalAmount || 0)))
  const totalAmount = Math.max(paid, storedTotal || requestedTotal)
  const currentBalance = currency(Math.max(0, totalAmount - paid))

  if (amount > currentBalance)
    return null

  const accumulated = currency(paid + amount)
  const balanceAfter = currency(Math.max(0, totalAmount - accumulated))

  const installment: MembershipPaymentInstallment = {
    id: installmentId,
    amountApplied: amount,
    method: input.method,
    appliedAt,
    balanceAfter,
  }

  const payment: Payment = {
    ...(current ?? {}),
    athleteId: input.athleteId,
    period: input.period,
    amount: accumulated,
    totalAmount,
    balance: balanceAfter,
    status: balanceAfter === 0 ? 'paid' : 'pending',
    method: input.method,
    appliedAt,
    createdAt: current?.createdAt ?? appliedAt,
    updatedAt: appliedAt,
    installments: {
      ...(current?.installments ?? {}),
      [installmentId]: installment,
    },
    ...(input.concept ? { concept: input.concept } : {}),
    ...(input.visitCount ? { visitCount: input.visitCount } : {}),
  }

  return { payment, installment }
}

export const paymentsService = {
  subscribe(onChange: (items: Payment[]) => void, onError: ErrorHandler) {
    return subscribeValue<PaymentTree>('payments', tree => {
      onChange(Object.entries(tree ?? {}).flatMap(([athleteId, periods]) =>
        Object.entries(periods ?? {}).map(([period, payment]) => ({ ...payment, athleteId, period } as Payment)),
      ))
    }, onError)
  },
  async applyInstallment(input: MembershipInstallmentInput, storeSales: Sale[] = []): Promise<AppliedMembershipInstallment> {
    const amount = currency(Number(input.amount))
    const requestedTotal = currency(Number(input.totalAmount))

    if (!input.athleteId || !/^\d{4}-\d{2}$/.test(input.period) || amount <= 0 || requestedTotal <= 0)
      throw new Error('Selecciona atleta, periodo y monto válido.')

    const database = requireDatabase()
    const paymentRef = ref(database, businessPath(`payments/${input.athleteId}/${input.period}`))
    const installmentId = push(child(paymentRef, 'installments')).key

    if (!installmentId)
      throw new Error('No fue posible generar el identificador del abono.')

    const appliedAt = Date.now()

    if (storeSales.length) {
      const [paymentSnapshot, ...saleSnapshots] = await Promise.all([
        get(paymentRef),
        ...storeSales.map(sale => get(ref(database, businessPath(`sales/${sale.id}`)))),
      ])

      const current = paymentSnapshot.exists() ? paymentSnapshot.val() as Payment : null
      const next = updatedPayment(current, input, installmentId, appliedAt)

      if (!next)
        throw new Error('El abono excede el saldo pendiente o el periodo ya está liquidado.')

      const updates: Record<string, unknown> = {
        [`payments/${input.athleteId}/${input.period}`]: next.payment,
      }

      const settledSales: AppliedMembershipInstallment['settledSales'] = []

      saleSnapshots.forEach(snapshot => {
        if (!snapshot.exists())
          return
        const sale = snapshot.val() as Sale
        const balance = currency(saleBalance(sale))
        if (sale.status !== 'credit' || sale.athleteId !== input.athleteId || balance <= 0)
          return

        const salePaymentId = push(ref(database, businessPath(`sales/${sale.id}/payments`))).key
        if (!salePaymentId)
          throw new Error('No fue posible generar el identificador de un pago de tienda.')

        const salePayment: SalePayment = {
          id: salePaymentId,
          amountApplied: balance,
          method: input.method,
          receivedAmount: balance,
          changeGiven: 0,
          appliedAt,
        }

        updates[`sales/${sale.id}/payments/${salePaymentId}`] = salePayment
        updates[`sales/${sale.id}/status`] = 'paid'
        updates[`sales/${sale.id}/updatedAt`] = appliedAt
        settledSales.push({ sale: { ...sale, status: 'paid', payments: { ...(sale.payments ?? {}), [salePaymentId]: salePayment }, updatedAt: appliedAt }, payment: salePayment })
      })

      await update(ref(database, businessPath('')), updates)

      return { ...next, settledSales }
    }

    const result = await runTransaction(paymentRef, currentValue => {
      return updatedPayment(currentValue as Payment | null, input, installmentId, appliedAt)?.payment
    }, { applyLocally: false })

    if (!result.committed || !result.snapshot.exists())
      throw new Error('El abono excede el saldo pendiente o el periodo ya está liquidado.')

    const payment = result.snapshot.val() as Payment
    const installment = payment.installments?.[installmentId]

    if (!installment)
      throw new Error('El abono se guardó, pero no fue posible recuperar su recibo.')

    return { payment, installment, settledSales: [] }
  },
}
