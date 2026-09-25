import type { ReportingDataset } from '@/services/reporting.service'
import type { ReportingFilters } from '@/types/reporting'

const atNoon = (day: string) => Date.parse(`${day}T12:00:00-06:00`)

export function reportingFinanceQaFilters(): ReportingFilters {
  return { from: '2026-12-01', through: '2026-12-31', productIds: [] }
}

export function createReportingFinanceQaFixture(): ReportingDataset {
  const occurredAt = atNoon('2026-12-05')

  return {
    athletes: [],
    visits: [],
    workEntries: [],
    payrollSettlements: [],
    inventoryClosures: [],
    sales: [{
      id: 'qa-finance-sale',
      createdAt: occurredAt,
      updatedAt: occurredAt,
      total: 120,
      status: 'credit',
      items: { product: { productId: 'qa-finance-product', name: 'Producto financiero QA', quantity: 1, unitPrice: 120, unitCost: 50 } },
      payments: {
        cash: { id: 'qa-finance-cash', amountApplied: 50, method: 'cash', appliedAt: occurredAt },
        bank: { id: 'qa-finance-bank', amountApplied: 30, method: 'card', appliedAt: occurredAt },
      },
    }],
    payments: [{
      athleteId: 'qa-finance-athlete', period: '2026-12', status: 'paid', totalAmount: 50,
      snapshot: { planId: 'qa-plan', agreedAmount: 50, paymentDay: 5, dueDate: '2026-12-05' },
      installments: { installment: { id: 'qa-finance-membership', amountApplied: 50, method: 'transfer', appliedAt: occurredAt } },
      createdAt: occurredAt, updatedAt: occurredAt,
    }],
    visitPayments: [{ id: 'qa-finance-visit', visitorId: 'qa-visitor', throughPeriod: '2026-12', amount: 50, method: 'cash', appliedAt: occurredAt }],
    expenses: [{ id: 'qa-finance-expense', date: '2026-12-05', category: 'Operación QA', subcategory: 'Insumos', amount: 50, method: 'cash', status: 'paid' }],
    inventoryResolutions: [{ id: 'qa-finance-recovery', adjustmentId: 'qa-adjustment', closureId: 'qa-inventory-closure', productId: 'qa-finance-product', kind: 'covered', units: 1, amount: 50, method: 'cash', createdAt: occurredAt }],
    cashClosures: [{
      id: '2026-12-05', date: '2026-12-05', movementFrom: '2026-12-01', openingCash: 0, openingBank: 0,
      cashIncome: 150, bankIncome: 80, otherIncome: 0, cashExpenses: 50, bankExpenses: 0, otherExpenses: 0,
      expectedCash: 100, expectedBank: 80, countedCash: 95, countedBank: 80, cashVariance: -5, bankVariance: 0,
    }],
    sources: ['store', 'memberships', 'visit-payments', 'expenses', 'cash-closures', 'inventory'],
    loadedSources: ['store', 'memberships', 'visit-payments', 'expenses', 'cash-closures', 'inventory'],
  }
}
