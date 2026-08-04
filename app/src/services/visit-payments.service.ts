import { push, ref, update } from 'firebase/database'
import type { PaymentMethod, Visit, VisitPayment } from '@/types/domain'
import { businessPath, requireDatabase, subscribeValue, type ErrorHandler } from './realtime.service'

type VisitPaymentTree = Record<string, Record<string, Omit<VisitPayment, 'id' | 'visitorId'>>>

export interface NewVisitPayment {
  visitorId: string
  customerName: string
  phone: string
  throughPeriod: string
  method: PaymentMethod
  visits: Visit[]
}

export const visitPaymentsService = {
  subscribe(onChange: (items: VisitPayment[]) => void, onError: ErrorHandler) {
    return subscribeValue<VisitPaymentTree>('visitPayments', tree => {
      onChange(Object.entries(tree ?? {}).flatMap(([visitorId, payments]) =>
        Object.entries(payments ?? {}).map(([id, payment]) => ({ ...payment, id, visitorId } as VisitPayment)),
      ))
    }, onError)
  },

  async create(input: NewVisitPayment) {
    const selectedVisits = input.visits.filter(visit => visit.visitorId === input.visitorId && visit.period <= input.throughPeriod && !visit.paidAt)
    if (!selectedVisits.length)
      throw new Error('No hay visitas pendientes para cobrar.')

    const database = requireDatabase()
    const paymentRef = push(ref(database, businessPath(`visitPayments/${input.visitorId}`)))
    if (!paymentRef.key)
      throw new Error('Firebase no pudo generar el identificador del pago.')

    const now = Date.now()
    const visitRefs = Object.fromEntries(selectedVisits.map(visit => [visit.id, {
      id: visit.id,
      period: visit.period,
      visitedAt: visit.visitedAt,
      unitPrice: Number(visit.unitPrice || 0),
    }]))
    const amount = selectedVisits.reduce((total, visit) => total + Number(visit.unitPrice || 0), 0)
    const payment: VisitPayment = {
      id: paymentRef.key,
      visitorId: input.visitorId,
      customerName: input.customerName,
      phone: input.phone,
      throughPeriod: input.throughPeriod,
      amount,
      method: input.method,
      appliedAt: now,
      visitRefs,
      createdAt: now,
      updatedAt: now,
    }
    const updates: Record<string, unknown> = {
      [`visitPayments/${input.visitorId}/${payment.id}`]: payment,
    }

    for (const visit of selectedVisits) {
      const visitPath = `visits/${input.visitorId}/${visit.period}/${visit.id}`
      updates[`${visitPath}/paidAt`] = now
      updates[`${visitPath}/visitPaymentId`] = payment.id
      updates[`${visitPath}/paymentPeriod`] = input.throughPeriod
      updates[`${visitPath}/updatedAt`] = now
    }

    await update(ref(database, businessPath('')), updates)

    return payment
  },
}
