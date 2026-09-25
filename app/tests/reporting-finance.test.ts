import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CashClosure, Expense, Payment, Sale } from '../src/types/domain'
import { buildFinanceReport } from '../src/utils/reporting-finance'

const timestamp = Date.parse('2026-08-06T12:00:00-06:00')
const filters = { from: '2026-08-01', through: '2026-08-31', productIds: [] as string[] }

test('separa venta reconocida, cobros, egresos, flujo y conciliación', () => {
  const sales: Sale[] = [{
    id: 's1', customerName: 'QA', total: 100, status: 'credit', createdAt: timestamp, updatedAt: timestamp,
    items: { p1: { productId: 'p1', name: 'A', quantity: 1, unitPrice: 100, unitCost: 40 } },
    payments: { cash: { id: 'cash', amountApplied: 40, method: 'cash', receivedAmount: 50, changeGiven: 10, appliedAt: timestamp } },
  }]

  const memberships: Payment[] = [{ athleteId: 'a1', period: '2026-08', status: 'paid', amount: 50, totalAmount: 50, balance: 0, method: 'transfer', appliedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }]
  const expenses: Expense[] = [{ id: 'e1', date: '2026-08-06', category: 'Operación', description: 'Renta', amount: 20, method: 'cash', status: 'paid', registeredBy: 'admin', createdAt: timestamp, updatedAt: timestamp }]

  const closures: CashClosure[] = [{
    id: '2026-08-06', date: '2026-08-06', movementFrom: '2026-08-01', openingCash: 0, openingBank: 0,
    cashIncome: 40, bankIncome: 50, otherIncome: 0, cashExpenses: 20, bankExpenses: 0, otherExpenses: 0,
    expectedCash: 20, expectedBank: 50, countedCash: 19, countedBank: 50, cashVariance: -1, bankVariance: 0,
    closedBy: 'admin', closedByName: 'Admin', createdAt: timestamp, updatedAt: timestamp,
  }]

  const report = buildFinanceReport({ sales, membershipPayments: memberships, visitPayments: [], expenses, cashClosures: closures }, filters)

  assert.equal(report.summary.recognizedStoreRevenue, 100)
  assert.equal(report.summary.collected, 90)
  assert.equal(report.summary.expensesPaid, 20)
  assert.equal(report.summary.cashFlow, 20)
  assert.equal(report.summary.bankFlow, 50)
  assert.equal(report.summary.cashVariance, -1)
})

test('mantiene cartera, utilidad, compromisos, flujo y variación como conceptos independientes', () => {
  const sale: Sale = {
    id: 's2', customerName: 'QA', total: 120, status: 'credit', createdAt: timestamp, updatedAt: timestamp,
    items: { p1: { productId: 'p1', name: 'A', quantity: 1, unitPrice: 120, unitCost: 50 } },
    payments: {
      bank: { id: 'bank', amountApplied: 60, method: 'card', appliedAt: timestamp },
      credit: { id: 'credit', amountApplied: 10, method: 'store-credit', appliedAt: timestamp },
    },
  }

  const membership: Payment = {
    athleteId: 'a2', period: '2026-08', status: 'pending', totalAmount: 100, balance: 60,
    snapshot: { planId: 'p', agreedAmount: 100, paymentDay: 1, dueDate: '2026-08-01' },
    installments: { i1: { id: 'i1', amountApplied: 40, method: 'cash', appliedAt: timestamp, balanceAfter: 60 } },
    createdAt: timestamp, updatedAt: timestamp,
  }

  const expenses: Expense[] = [
    { id: 'paid', date: '2026-08-06', category: 'Operación', description: 'privada', amount: 20, method: 'cash', status: 'paid', registeredBy: 'admin', createdAt: timestamp, updatedAt: timestamp },
    { id: 'pending', date: '2026-08-06', category: 'Operación', description: 'privada', amount: 30, method: 'cash', status: 'pending', registeredBy: 'admin', createdAt: timestamp, updatedAt: timestamp },
  ]

  const closure: CashClosure = {
    id: '2026-08-06', date: '2026-08-06', movementFrom: '2026-08-01', openingCash: 0, openingBank: 0,
    cashIncome: 40, bankIncome: 60, otherIncome: 0, cashExpenses: 20, bankExpenses: 0, otherExpenses: 0,
    expectedCash: 20, expectedBank: 60, countedCash: 15, countedBank: 65, cashVariance: -5, bankVariance: 5,
    closedBy: 'admin', closedByName: 'Admin', createdAt: timestamp, updatedAt: timestamp,
  }

  const report = buildFinanceReport({ sales: [sale], membershipPayments: [membership], visitPayments: [], expenses, cashClosures: [closure] }, filters)

  assert.equal(report.summary.recognizedStoreRevenue, 120)
  assert.equal(report.summary.storeGrossProfit, 70)
  assert.equal(report.summary.storeReceivable, 50)
  assert.equal(report.summary.membershipExpected, 100)
  assert.equal(report.summary.membershipReceivable, 60)
  assert.equal(report.summary.collected, 110)
  assert.equal(report.summary.expensesPaid, 20)
  assert.equal(report.summary.expensesPending, 30)
  assert.equal(report.summary.cashFlow, 20)
  assert.equal(report.summary.bankFlow, 60)
  assert.equal(report.summary.nonCashFlow, 10)
  assert.equal(report.summary.totalVariance, 0)
})

test('filtra egresos por cuenta, categoría y estado sin alterar ingreso reconocido', () => {
  const sales: Sale[] = [{
    id: 's3', customerName: 'QA', total: 100, status: 'paid', createdAt: timestamp, updatedAt: timestamp,
    items: { p1: { productId: 'p1', name: 'A', quantity: 1, unitPrice: 100, unitCost: 50 } },
    payments: { bank: { id: 'bank', amountApplied: 100, method: 'card', appliedAt: timestamp } },
  }]

  const expenses: Expense[] = [
    { id: 'bank', date: '2026-08-06', category: 'Operación', description: 'privada', amount: 20, method: 'transfer', status: 'paid', registeredBy: 'admin', createdAt: timestamp, updatedAt: timestamp },
    { id: 'cash', date: '2026-08-06', category: 'Otra', description: 'privada', amount: 30, method: 'cash', status: 'paid', registeredBy: 'admin', createdAt: timestamp, updatedAt: timestamp },
  ]

  const report = buildFinanceReport({ sales, membershipPayments: [], visitPayments: [], expenses, cashClosures: [] }, {
    ...filters, financialAccount: 'bank', expenseCategory: 'Operación', expenseStatus: 'paid',
  })

  assert.equal(report.summary.recognizedStoreRevenue, 100)
  assert.equal(report.summary.expensesPaid, 20)
  assert.equal(report.summary.bankFlow, 80)
  assert.equal(report.summary.cashFlow, 0)
  assert.deepEqual(report.expenses.map(expense => expense.id), ['bank'])
})
