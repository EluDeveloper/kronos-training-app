import type { ISODate, ISOTimestamp, MembershipPeriodSnapshot } from '@/types/domain'

export type MembershipCollectionState = 'advance' | 'pending' | 'overdue' | 'paid'

const periodPattern = /^(\d{4})-(0[1-9]|1[0-2])$/
const currency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const dateKey = (date: Date): ISODate => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function membershipDueDate(period: string, paymentDay: number): ISODate {
  const match = period.match(periodPattern)
  if (!match)
    throw new Error('El periodo de mensualidad no es válido.')

  const year = Number(match[1])
  const month = Number(match[2])
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(Math.max(1, Math.trunc(Number(paymentDay || 1))), lastDay)

  return `${period}-${String(day).padStart(2, '0')}`
}

export function allowedMembershipPeriods(today = new Date(), futureMonths = 12) {
  return Array.from({ length: futureMonths + 1 }, (_, offset) => {
    const date = new Date(today.getFullYear(), today.getMonth() + offset, 1)

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

export function validateAdvancePeriod(period: string, today = new Date()) {
  if (!periodPattern.test(period))
    throw new Error('El periodo de mensualidad no es válido.')
  const current = allowedMembershipPeriods(today)[0]!
  if (period > current && !allowedMembershipPeriods(today).includes(period))
    throw new Error('Selecciona el periodo vigente o uno de los siguientes doce meses.')
}

export function buildMembershipPeriodSnapshot(
  membership: { planId: string; agreedAmount: number; paymentDay: number },
  period: string,
): MembershipPeriodSnapshot {
  return {
    planId: membership.planId,
    agreedAmount: currency(membership.agreedAmount),
    paymentDay: Math.trunc(membership.paymentDay),
    dueDate: membershipDueDate(period, membership.paymentDay),
  }
}

export function membershipCollectionState(input: {
  dueDate: ISODate
  balance: number
  paidAt?: ISOTimestamp | null
  today?: Date
}): MembershipCollectionState {
  if (currency(input.balance) <= 0)
    return 'paid'

  const today = dateKey(input.today ?? new Date())
  if (today > input.dueDate)
    return 'overdue'

  if (input.paidAt) {
    const paidAt = dateKey(new Date(input.paidAt))
    if (paidAt <= input.dueDate)
      return 'advance'
  }

  return 'pending'
}
