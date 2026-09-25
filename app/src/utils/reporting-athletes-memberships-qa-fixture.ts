import type { ReportingDataset } from '@/services/reporting.service'
import type { ReportingFilters } from '@/types/reporting'

const appliedAt = Date.parse('2026-10-01T12:00:00-06:00')

export function reportingAthletesMembershipsQaFilters(): ReportingFilters {
  return { from: '2026-10-01', through: '2026-10-31', productIds: [] }
}

export function createReportingAthletesMembershipsQaFixture(): ReportingDataset {
  return {
    visitPayments: [], expenses: [], cashClosures: [],
    athletes: [{
      id: 'qa-athlete-001', status: 'active', createdAt: Date.parse('2026-01-01T12:00:00-06:00'),
      lifecycleEvents: {
        created: { id: 'qa-event-created', athleteId: 'qa-athlete-001', type: 'created', fromStatus: null, toStatus: 'active', effectiveDate: '2026-01-01', createdAt: 1 },
        paused: { id: 'qa-event-paused', athleteId: 'qa-athlete-001', type: 'paused', fromStatus: 'active', toStatus: 'paused', effectiveDate: '2026-10-05', createdAt: 2 },
        reactivated: { id: 'qa-event-reactivated', athleteId: 'qa-athlete-001', type: 'reactivated', fromStatus: 'paused', toStatus: 'active', effectiveDate: '2026-10-10', createdAt: 3 },
      },
    }],
    visits: [], sales: [],
    payments: [{
      athleteId: 'qa-athlete-001', period: '2026-10', status: 'pending', totalAmount: 500,
      snapshot: { planId: 'qa-plan', agreedAmount: 500, paymentDay: 5, dueDate: '2026-10-05' },
      installments: { advance: { id: 'qa-installment-advance', amountApplied: 200, method: 'transfer', appliedAt } },
      createdAt: appliedAt, updatedAt: appliedAt,
    }],
    inventoryClosures: [], inventoryResolutions: [], workEntries: [], payrollSettlements: [],
    sources: ['athletes', 'memberships'], loadedSources: ['athletes', 'memberships'],
  }
}
