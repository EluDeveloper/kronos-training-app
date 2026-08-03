import type { Payment } from '@/types/domain'
import { serverTimestamp, setEntity, subscribeValue, type ErrorHandler } from './realtime.service'

type PaymentTree = Record<string, Record<string, Omit<Payment, 'athleteId' | 'period'>>>

export const paymentsService = {
  subscribe(onChange: (items: Payment[]) => void, onError: ErrorHandler) {
    return subscribeValue<PaymentTree>('payments', tree => {
      onChange(Object.entries(tree ?? {}).flatMap(([athleteId, periods]) =>
        Object.entries(periods ?? {}).map(([period, payment]) => ({ ...payment, athleteId, period } as Payment)),
      ))
    }, onError)
  },
  save(payment: Omit<Payment, 'createdAt' | 'updatedAt'>) {
    return setEntity(`payments/${payment.athleteId}/${payment.period}`, {
      ...payment,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  },
}
