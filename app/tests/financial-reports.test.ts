import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Expense, Payment, Sale, VisitPayment } from '../src/types/domain'
import { buildFinancialMovements, movementsBetweenDates, summarizeMovements } from '../src/utils/financial-reports'

const timestamp = new Date('2026-08-06T12:00:00-06:00').getTime()

const membershipPayment: Payment = {
  athleteId: 'athlete-test',
  period: '2026-08',
  status: 'paid',
  amount: 500,
  totalAmount: 500,
  balance: 0,
  installments: {
    first: { id: 'first', amountApplied: 500, method: 'transfer', appliedAt: timestamp, balanceAfter: 0 },
  },
  createdAt: timestamp,
  updatedAt: timestamp,
}

const visitPayment: VisitPayment = {
  id: 'visit-payment-test',
  visitorId: 'visitor-test',
  customerName: 'Visitante de prueba',
  phone: '0000000000',
  throughPeriod: '2026-08',
  amount: 100,
  method: 'cash',
  appliedAt: timestamp,
  visitRefs: {},
  createdAt: timestamp,
  updatedAt: timestamp,
}

const sale: Sale = {
  id: 'sale-test',
  customerName: 'Cliente de prueba',
  items: {
    product: { productId: 'product', name: 'Producto de prueba', quantity: 1, unitPrice: 120, unitCost: 60 },
  },
  total: 120,
  status: 'paid',
  payments: {
    cash: { id: 'cash', amountApplied: 100, method: 'cash', receivedAmount: 200, changeGiven: 50, creditBalance: 50, appliedAt: timestamp },
    credit: { id: 'credit', amountApplied: 20, method: 'store-credit', appliedAt: timestamp },
  },
  createdAt: timestamp,
  updatedAt: timestamp,
}

const expenses: Expense[] = [
  { id: 'cash-expense', date: '2026-08-06', category: 'Prueba', description: 'Egreso en efectivo', amount: 30, method: 'cash', status: 'paid', registeredBy: 'Admin', createdAt: timestamp, updatedAt: timestamp },
  { id: 'bank-expense', date: '2026-08-06', category: 'Prueba', description: 'Egreso bancario', amount: 50, method: 'card', status: 'paid', registeredBy: 'Admin', createdAt: timestamp, updatedAt: timestamp },
  { id: 'other-expense', date: '2026-08-06', category: 'Prueba', description: 'Otro egreso', amount: 10, method: 'other', status: 'paid', registeredBy: 'Admin', createdAt: timestamp, updatedAt: timestamp },
]

test('separa ingreso reconocido de movimientos reales de caja y banco', () => {
  const movements = buildFinancialMovements({ membershipPayments: [membershipPayment], visitPayments: [visitPayment], sales: [sale], expenses })
  const summary = summarizeMovements(movements)

  assert.equal(summary.income, 720)
  assert.equal(summary.memberships, 500)
  assert.equal(summary.visits, 100)
  assert.equal(summary.store, 120)
  assert.equal(summary.expenses, 90)
  assert.equal(summary.net, 630)
  assert.equal(summary.cashIncome, 250)
  assert.equal(summary.cashExpenses, 30)
  assert.equal(summary.cashNet, 220)
  assert.equal(summary.bankIncome, 500)
  assert.equal(summary.bankExpenses, 50)
  assert.equal(summary.bankNet, 450)
  assert.equal(summary.otherExpenses, 10)
})

test('un cierre posterior sólo toma movimientos después de la fecha previa', () => {
  const movements = buildFinancialMovements({ membershipPayments: [membershipPayment], visitPayments: [visitPayment], sales: [sale], expenses })

  assert.equal(movementsBetweenDates(movements, '2026-08-06', '2026-08-07').length, 0)
  assert.equal(movementsBetweenDates(movements, null, '2026-08-06').length, movements.length)
})
