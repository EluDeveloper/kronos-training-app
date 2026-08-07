import type { Expense, Payment, PaymentMethod, Sale, VisitPayment } from '@/types/domain'
import { membershipInstallments, timestampValue } from '@/utils/kronos'

export type FinancialMovementSource = 'membership' | 'visits' | 'store' | 'expense'
export type FinancialAccount = 'cash' | 'bank' | 'other' | 'non-cash'

export interface FinancialMovement {
  id: string
  date: string
  period: string
  occurredAt: number
  direction: 'income' | 'expense'
  source: FinancialMovementSource
  method: PaymentMethod
  account: FinancialAccount
  amount: number
  accountAmount: number
  description: string
}

export interface FinancialSummary {
  income: number
  expenses: number
  net: number
  memberships: number
  visits: number
  store: number
  cashIncome: number
  bankIncome: number
  otherIncome: number
  cashExpenses: number
  bankExpenses: number
  otherExpenses: number
  cashNet: number
  bankNet: number
}

const currency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export function dateKey(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value)

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const periodKey = (value: string | number | Date) => dateKey(value).slice(0, 7)

export const paymentAccount = (method: PaymentMethod): FinancialAccount => {
  if (method === 'cash')
    return 'cash'
  if (method === 'transfer' || method === 'card')
    return 'bank'
  if (method === 'store-credit')
    return 'non-cash'

  return 'other'
}

export function buildFinancialMovements(input: {
  membershipPayments: Payment[]
  visitPayments: VisitPayment[]
  sales: Sale[]
  expenses: Expense[]
}): FinancialMovement[] {
  const movements: FinancialMovement[] = []

  input.membershipPayments.forEach(payment => {
    membershipInstallments(payment).forEach(installment => {
      const occurredAt = timestampValue(installment.appliedAt)
      const amount = currency(installment.amountApplied)
      const method = installment.method

      movements.push({
        id: `membership:${payment.athleteId}:${payment.period}:${installment.id}`,
        date: dateKey(occurredAt),
        period: periodKey(occurredAt),
        occurredAt,
        direction: 'income',
        source: 'membership',
        method,
        account: paymentAccount(method),
        amount,
        accountAmount: amount,
        description: `Mensualidad ${payment.period}`,
      })
    })
  })

  input.visitPayments.forEach(payment => {
    const occurredAt = timestampValue(payment.appliedAt)
    const amount = currency(payment.amount)

    movements.push({
      id: `visits:${payment.id}`,
      date: dateKey(occurredAt),
      period: periodKey(occurredAt),
      occurredAt,
      direction: 'income',
      source: 'visits',
      method: payment.method,
      account: paymentAccount(payment.method),
      amount,
      accountAmount: amount,
      description: `Visitas hasta ${payment.throughPeriod}`,
    })
  })

  input.sales
    .filter(sale => sale.status !== 'cancelled')
    .forEach(sale => Object.values(sale.payments ?? {}).forEach(payment => {
      const occurredAt = timestampValue(payment.appliedAt)
      const amount = currency(payment.amountApplied)
      const account = paymentAccount(payment.method)
      const received = Number(payment.receivedAmount ?? amount)
      const accountAmount = account === 'cash'
        ? currency(Math.max(0, received - Number(payment.changeGiven || 0)))
        : account === 'bank' ? amount : 0

      movements.push({
        id: `store:${sale.id}:${payment.id}`,
        date: dateKey(occurredAt),
        period: periodKey(occurredAt),
        occurredAt,
        direction: 'income',
        source: 'store',
        method: payment.method,
        account,
        amount,
        accountAmount,
        description: `Tienda · ${Object.values(sale.items ?? {}).map(item => item.name).join(', ')}`,
      })
    }))

  input.expenses
    .filter(expense => expense.status === 'paid')
    .forEach(expense => {
      const occurredAt = timestampValue(`${expense.date}T12:00:00`)
      const amount = currency(expense.amount)

      movements.push({
        id: `expense:${expense.id}`,
        date: expense.date,
        period: expense.date.slice(0, 7),
        occurredAt,
        direction: 'expense',
        source: 'expense',
        method: expense.method,
        account: paymentAccount(expense.method),
        amount,
        accountAmount: amount,
        description: expense.description,
      })
    })

  return movements.sort((left, right) => left.occurredAt - right.occurredAt || left.id.localeCompare(right.id))
}

export function summarizeMovements(movements: FinancialMovement[]): FinancialSummary {
  const summary: FinancialSummary = {
    income: 0,
    expenses: 0,
    net: 0,
    memberships: 0,
    visits: 0,
    store: 0,
    cashIncome: 0,
    bankIncome: 0,
    otherIncome: 0,
    cashExpenses: 0,
    bankExpenses: 0,
    otherExpenses: 0,
    cashNet: 0,
    bankNet: 0,
  }

  movements.forEach(movement => {
    if (movement.direction === 'income') {
      summary.income += movement.amount
      if (movement.source === 'membership') summary.memberships += movement.amount
      if (movement.source === 'visits') summary.visits += movement.amount
      if (movement.source === 'store') summary.store += movement.amount
      if (movement.account === 'cash') summary.cashIncome += movement.accountAmount
      else if (movement.account === 'bank') summary.bankIncome += movement.accountAmount
      else if (movement.account === 'other') summary.otherIncome += movement.accountAmount || movement.amount
    }
    else {
      summary.expenses += movement.amount
      if (movement.account === 'cash') summary.cashExpenses += movement.accountAmount
      else if (movement.account === 'bank') summary.bankExpenses += movement.accountAmount
      else summary.otherExpenses += movement.accountAmount || movement.amount
    }
  })

  Object.keys(summary).forEach(key => {
    summary[key as keyof FinancialSummary] = currency(summary[key as keyof FinancialSummary])
  })
  summary.net = currency(summary.income - summary.expenses)
  summary.cashNet = currency(summary.cashIncome - summary.cashExpenses)
  summary.bankNet = currency(summary.bankIncome - summary.bankExpenses)

  return summary
}

export const movementsForPeriod = (movements: FinancialMovement[], period: string) => movements.filter(movement => movement.period === period)

export const movementsBetweenDates = (movements: FinancialMovement[], fromExclusive: string | null, through: string) => movements.filter(movement => (
  (!fromExclusive || movement.date > fromExclusive) && movement.date <= through
))
