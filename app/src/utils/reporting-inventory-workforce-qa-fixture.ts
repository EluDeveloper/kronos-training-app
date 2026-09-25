import type { ReportingDataset } from '@/services/reporting.service'
import type { ReportingFilters } from '@/types/reporting'

const atNoon = (day: string) => Date.parse(`${day}T12:00:00-06:00`)

export function reportingInventoryWorkforceQaFilters(): ReportingFilters {
  return { from: '2026-11-01', through: '2026-11-30', productIds: [] }
}

export function createReportingInventoryWorkforceQaFixture(): ReportingDataset {
  return {
    visitPayments: [], expenses: [], cashClosures: [],
    athletes: [], visits: [], sales: [], payments: [],
    inventoryClosures: [{
      id: '2026-11-03', weekStart: '2026-11-03', weekEnd: '2026-11-09', status: 'finalized', finalizedAt: atNoon('2026-11-05'),
      items: {
        'qa-product-001': { productId: 'qa-product-001', name: 'Bebida QA sintética', category: 'Bebidas', systemStock: 10, countedStock: 7, variance: -3, unitCost: 10, varianceValue: -30 },
      },
    }],
    inventoryResolutions: [
      { id: 'qa-resolution-covered', adjustmentId: 'qa-adjustment-001', closureId: '2026-11-03', productId: 'qa-product-001', kind: 'covered', units: 1, amount: 10, method: 'cash', createdAt: atNoon('2026-11-06') },
      { id: 'qa-resolution-written-off', adjustmentId: 'qa-adjustment-001', closureId: '2026-11-03', productId: 'qa-product-001', kind: 'written-off', units: 1, amount: 10, createdAt: atNoon('2026-11-07') },
      { id: 'qa-resolution-corrected', adjustmentId: 'qa-adjustment-001', closureId: '2026-11-03', productId: 'qa-product-001', kind: 'corrected', units: 1, amount: 10, createdAt: atNoon('2026-11-08') },
    ],
    workEntries: [
      { id: 'qa-work-paid', employeeId: 'qa-employee-001', employeeName: 'Entrenadora QA', date: '2026-11-10', unit: 'class', quantity: 1, rateSnapshot: 200, amount: 200, status: 'paid', payrollSettlementId: 'qa-settlement-001' },
      { id: 'qa-work-pending', employeeId: 'qa-employee-001', employeeName: 'Entrenadora QA', date: '2026-11-12', unit: 'class', quantity: 1, rateSnapshot: 100, amount: 100, status: 'approved' },
    ],
    payrollSettlements: [{
      id: 'qa-settlement-001', employeeId: 'qa-employee-001', employeeName: 'Entrenadora QA', entryIds: { 'qa-work-paid': true }, periodFrom: '2026-11-10', periodThrough: '2026-11-10', amount: 200, method: 'transfer', paidAt: '2026-11-15',
    }],
    sources: ['inventory', 'workforce'], loadedSources: ['inventory', 'workforce'],
  }
}
