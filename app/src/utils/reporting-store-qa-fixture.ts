import type { ReportingDataset } from '@/services/reporting.service'
import type { ReportingFilters } from '@/types/reporting'

function atNoon(day: string) {
  return new Date(`${day}T12:00:00-06:00`).getTime()
}

function shiftDay(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

export function createReportingStoreQaFixture(from: string, through: string): ReportingDataset {
  const next = shiftDay(from, 1)
  const recoveryDate = next <= through ? next : from

  return {
    visitPayments: [],
    expenses: [],
    cashClosures: [],
    athletes: [],
    visits: [],
    payments: [],
    inventoryClosures: [],
    inventoryResolutions: [],
    workEntries: [],
    payrollSettlements: [],
    sales: [{
      id: 'qa-store-sale-001',
      athleteId: 'qa-athlete-001',
      createdAt: atNoon(from),
      updatedAt: atNoon(recoveryDate),
      total: 120,
      status: 'credit',
      items: {
        'qa-item-shirt': { productId: 'qa-shirt-001', name: 'Playera QA sintética', quantity: 1, unitPrice: 60, unitCost: 20 },
        'qa-item-bottle': { productId: 'qa-bottle-001', name: 'Botella QA sintética', quantity: 1, unitPrice: 60, unitCost: 15 },
      },
      payments: {
        'qa-payment-cash': { id: 'qa-payment-cash', amountApplied: 30, method: 'cash', appliedAt: atNoon(from) },
        'qa-payment-transfer': { id: 'qa-payment-transfer', amountApplied: 25, method: 'transfer', appliedAt: atNoon(recoveryDate) },
      },
    }],
    sources: ['athletes', 'visits', 'store'],
    loadedSources: ['athletes', 'visits', 'store'],
  }
}

export function reportingStoreQaFilters(today: string): ReportingFilters {
  return {
    from: shiftDay(today, -6),
    through: today,
    productIds: [],
  }
}
