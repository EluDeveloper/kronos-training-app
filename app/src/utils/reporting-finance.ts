import type { ReportingCashClosureSource, ReportingExpenseSource, ReportingFilters, ReportingInventoryResolutionSource, ReportingMembershipSource, ReportingSaleSource, ReportingVisitPaymentSource } from '@/types/reporting'
import { buildFinancialMovements, paymentAccount, summarizeMovements } from './financial-reports'
import { dateForBusinessTimeZone } from './reporting-periods'
import { currency } from './reporting-metrics'
import { buildStoreReport } from './reporting-store'
import { buildMembershipReport } from './reporting-memberships'

export interface FinanceReportInput {
  sales: ReportingSaleSource[]
  membershipPayments: ReportingMembershipSource[]
  visitPayments: ReportingVisitPaymentSource[]
  expenses: ReportingExpenseSource[]
  cashClosures: ReportingCashClosureSource[]
  inventoryRecoveries?: ReportingInventoryResolutionSource[]
}

export interface FinanceReport {
  summary: {
    recognizedStoreRevenue: number
    storeGrossProfit: number | null
    storeReceivable: number
    membershipExpected: number | null
    membershipReceivable: number | null
    collected: number
    expensesPaid: number
    expensesPending: number
    expensesScheduled: number
    cashFlow: number
    bankFlow: number
    otherFlow: number
    nonCashFlow: number
    cashVariance: number
    bankVariance: number
    totalVariance: number
  }
  movements: ReturnType<typeof buildFinancialMovements>
  expenses: ReportingExpenseSource[]
  closures: ReportingCashClosureSource[]
}

export function buildFinanceReport(input: FinanceReportInput, filters: ReportingFilters): FinanceReport {
  const sales = input.sales.filter(sale => !filters.athleteId || sale.athleteId === filters.athleteId)
  const membershipPayments = input.membershipPayments.filter(payment => !filters.athleteId || payment.athleteId === filters.athleteId)

  const expenseMatches = (expense: ReportingExpenseSource) => expense.date >= filters.from && expense.date <= filters.through
    && (!filters.expenseCategory || expense.category === filters.expenseCategory)
    && (!filters.expenseStatus || expense.status === filters.expenseStatus)
    && (!filters.paymentMethod || expense.method === filters.paymentMethod)
    && (!filters.financialAccount || paymentAccount(expense.method) === filters.financialAccount)

  const expenses = input.expenses.filter(expenseMatches)

  const movements = buildFinancialMovements({
    membershipPayments,
    visitPayments: input.visitPayments,
    sales,
    expenses,
    inventoryRecoveries: input.inventoryRecoveries,
  }).filter(movement => movement.date >= filters.from && movement.date <= filters.through
    && (!filters.paymentMethod || movement.method === filters.paymentMethod)
    && (!filters.financialAccount || movement.account === filters.financialAccount)
    && (movement.source !== 'expense' || expenses.some(expense => `expense:${expense.id}` === movement.id)))

  const summary = summarizeMovements(movements)
  const closures = input.cashClosures.filter(closure => closure.date >= filters.from && closure.date <= filters.through)
  const cashVariance = currency(closures.reduce((sum, closure) => sum + Number(closure.cashVariance || 0), 0))
  const bankVariance = currency(closures.reduce((sum, closure) => sum + Number(closure.bankVariance || 0), 0))
  const store = buildStoreReport(sales, { ...filters, productIds: filters.productIds })
  const memberships = buildMembershipReport(membershipPayments, filters)

  return {
    summary: {
      recognizedStoreRevenue: store.summary.recognizedRevenue,
      storeGrossProfit: store.summary.grossProfit,
      storeReceivable: store.summary.receivable,
      membershipExpected: memberships.summary.expected,
      membershipReceivable: memberships.summary.receivable,
      collected: summary.income,
      expensesPaid: summary.expenses,
      expensesPending: currency(expenses.filter(expense => expense.status === 'pending').reduce((sum, expense) => sum + expense.amount, 0)),
      expensesScheduled: currency(expenses.filter(expense => expense.status === 'scheduled').reduce((sum, expense) => sum + expense.amount, 0)),
      cashFlow: summary.cashNet,
      bankFlow: summary.bankNet,
      otherFlow: currency(summary.otherIncome - summary.otherExpenses),
      nonCashFlow: summary.nonCashNet,
      cashVariance,
      bankVariance,
      totalVariance: currency(cashVariance + bankVariance),
    },
    movements,
    expenses,
    closures,
  }
}

export const reportingMovementDate = (value: string | number | Date) => dateForBusinessTimeZone(value)
