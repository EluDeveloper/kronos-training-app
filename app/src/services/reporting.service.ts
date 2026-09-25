import type { Unsubscribe } from 'firebase/database'
import type { Athlete, CashClosure, Expense, InventoryClosure, InventoryResolution, Payment, Sale, Visit, VisitPayment } from '@/types/domain'
import type { PayrollSettlement, WorkEntry } from '@/types/workforce'
import type { AppUser } from '@/types/access'
import type { ReportingAthleteEvent, ReportingAthleteSource, ReportingCashClosureSource, ReportingExpenseSource, ReportingInventoryClosureSource, ReportingInventoryResolutionSource, ReportingMembershipSource, ReportingPayrollSettlementSource, ReportingSaleSource, ReportingVisitPaymentSource, ReportingVisitSource, ReportingWorkEntrySource } from '@/types/reporting'
import type { ReportingSource } from './reporting-access'
import { reportingSourcesFor } from './reporting-access'

export interface ReportingDataset {
  athletes: ReportingAthleteSource[]
  visits: ReportingVisitSource[]
  sales: ReportingSaleSource[]
  payments: ReportingMembershipSource[]
  inventoryClosures: ReportingInventoryClosureSource[]
  inventoryResolutions: ReportingInventoryResolutionSource[]
  workEntries: ReportingWorkEntrySource[]
  payrollSettlements: ReportingPayrollSettlementSource[]
  visitPayments: ReportingVisitPaymentSource[]
  expenses: ReportingExpenseSource[]
  cashClosures: ReportingCashClosureSource[]
  sources: ReportingSource[]
  loadedSources: ReportingSource[]
}

export type ReportingListener = (dataset: ReportingDataset) => void
export type ReportingErrorListener = (source: ReportingSource, error: Error) => void

export interface ReportingSubscriptions {
  athletes?: (onChange: (items: Athlete[]) => void, onError: (error: Error) => void) => Unsubscribe
  visits?: (onChange: (items: Visit[]) => void, onError: (error: Error) => void) => Unsubscribe
  sales?: (onChange: (items: Sale[]) => void, onError: (error: Error) => void) => Unsubscribe
  payments?: (onChange: (items: Payment[]) => void, onError: (error: Error) => void) => Unsubscribe
  inventoryClosures?: (onChange: (items: InventoryClosure[]) => void, onError: (error: Error) => void) => Unsubscribe
  inventoryResolutions?: (onChange: (items: InventoryResolution[]) => void, onError: (error: Error) => void) => Unsubscribe
  workEntries?: (onChange: (items: WorkEntry[]) => void, onError: (error: Error) => void) => Unsubscribe
  payrollSettlements?: (onChange: (items: PayrollSettlement[]) => void, onError: (error: Error) => void) => Unsubscribe
  visitPayments?: (onChange: (items: VisitPayment[]) => void, onError: (error: Error) => void) => Unsubscribe
  expenses?: (onChange: (items: Expense[]) => void, onError: (error: Error) => void) => Unsubscribe
  cashClosures?: (onChange: (items: CashClosure[]) => void, onError: (error: Error) => void) => Unsubscribe
}

function projectAthlete(athlete: Athlete): ReportingAthleteSource {
  return {
    id: athlete.id,
    status: athlete.status,
    createdAt: athlete.createdAt,
    ...(athlete.migrationNeedsReview ? { migrationNeedsReview: true } : {}),
    ...(athlete.lifecycleEvents ? {
      lifecycleEvents: Object.fromEntries(Object.entries(athlete.lifecycleEvents).map(([id, event]) => [id, {
        id: event.id,
        athleteId: event.athleteId,
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        effectiveDate: event.effectiveDate,
        createdAt: event.createdAt,
      } satisfies ReportingAthleteEvent])),
    } : {}),
  }
}

function projectVisit(visit: Visit): ReportingVisitSource {
  return {
    id: visit.id,
    period: visit.period,
    visitedAt: visit.visitedAt,
    accessType: visit.accessType,
    ...(visit.athleteId ? { athleteId: visit.athleteId } : {}),
  }
}

function projectSale(sale: Sale): ReportingSaleSource {
  return {
    id: sale.id,
    ...(sale.athleteId ? { athleteId: sale.athleteId } : {}),
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
    ...(sale.cancelledAt ? { cancelledAt: sale.cancelledAt } : {}),
    total: sale.total,
    status: sale.status,
    items: Object.fromEntries(Object.entries(sale.items ?? {}).map(([id, item]) => [id, {
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
    }])),
    ...(sale.payments ? { payments: Object.fromEntries(Object.entries(sale.payments).map(([id, payment]) => [id, {
      id: payment.id,
      amountApplied: payment.amountApplied,
      method: payment.method,
      appliedAt: payment.appliedAt,
      ...(payment.receivedAmount !== undefined ? { receivedAmount: payment.receivedAmount } : {}),
      ...(payment.changeGiven !== undefined ? { changeGiven: payment.changeGiven } : {}),
      ...(payment.creditBalance !== undefined ? { creditBalance: payment.creditBalance } : {}),
      ...(payment.groupPaymentId ? { groupPaymentId: payment.groupPaymentId } : {}),
    }])) } : {}),
    ...(sale.paymentAdjustments ? { paymentAdjustments: Object.fromEntries(Object.entries(sale.paymentAdjustments).map(([id, adjustment]) => [id, {
      id: adjustment.id,
      saleId: adjustment.saleId,
      paymentId: adjustment.paymentId,
      ...(adjustment.groupPaymentId ? { groupPaymentId: adjustment.groupPaymentId } : {}),
      kind: adjustment.kind,
      ...(adjustment.amount !== undefined ? { amount: adjustment.amount } : {}),
      ...(adjustment.fromMethod ? { fromMethod: adjustment.fromMethod } : {}),
      ...(adjustment.toMethod ? { toMethod: adjustment.toMethod } : {}),
      createdAt: adjustment.createdAt,
    }])) } : {}),
  }
}

function projectPayment(payment: Payment): ReportingMembershipSource {
  return {
    athleteId: payment.athleteId,
    period: payment.period,
    status: payment.status,
    ...(payment.totalAmount !== undefined ? { totalAmount: payment.totalAmount } : {}),
    ...(payment.snapshot ? { snapshot: { ...payment.snapshot } } : {}),
    ...(payment.installments ? { installments: Object.fromEntries(Object.entries(payment.installments).map(([id, installment]) => [id, {
      id: installment.id,
      amountApplied: installment.amountApplied,
      method: installment.method,
      appliedAt: installment.appliedAt,
    }])) } : {}),
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  }
}

function projectInventoryClosure(closure: InventoryClosure): ReportingInventoryClosureSource {
  return {
    id: closure.id,
    weekStart: closure.weekStart,
    weekEnd: closure.weekEnd,
    status: closure.status,
    ...(closure.finalizedAt !== undefined ? { finalizedAt: closure.finalizedAt } : {}),
    items: Object.fromEntries(Object.entries(closure.items ?? {}).map(([id, item]) => [id, {
      productId: item.productId,
      name: item.name,
      category: item.category,
      systemStock: item.systemStock,
      countedStock: item.countedStock,
      variance: item.variance,
      unitCost: item.unitCost,
      varianceValue: item.varianceValue,
    }])),
  }
}

function projectInventoryResolution(resolution: InventoryResolution): ReportingInventoryResolutionSource {
  return {
    id: resolution.id,
    adjustmentId: resolution.adjustmentId,
    closureId: resolution.closureId,
    productId: resolution.productId,
    kind: resolution.kind,
    units: resolution.units,
    amount: resolution.amount,
    ...(resolution.method ? { method: resolution.method } : {}),
    createdAt: resolution.createdAt,
  }
}

function projectWorkEntry(entry: WorkEntry): ReportingWorkEntrySource {
  return {
    id: entry.id,
    employeeId: entry.employeeId,
    employeeName: entry.employeeName,
    date: entry.date,
    unit: entry.unit,
    quantity: entry.quantity,
    rateSnapshot: entry.rateSnapshot,
    amount: entry.amount,
    status: entry.status,
    ...(entry.payrollSettlementId ? { payrollSettlementId: entry.payrollSettlementId } : {}),
  }
}

function projectPayrollSettlement(settlement: PayrollSettlement): ReportingPayrollSettlementSource {
  return {
    id: settlement.id,
    employeeId: settlement.employeeId,
    employeeName: settlement.employeeName,
    entryIds: { ...settlement.entryIds },
    periodFrom: settlement.periodFrom,
    periodThrough: settlement.periodThrough,
    amount: settlement.amount,
    method: settlement.method,
    paidAt: settlement.paidAt,
  }
}

function projectVisitPayment(payment: VisitPayment): ReportingVisitPaymentSource {
  return { id: payment.id, visitorId: payment.visitorId, throughPeriod: payment.throughPeriod, amount: payment.amount, method: payment.method, appliedAt: payment.appliedAt }
}

function projectExpense(expense: Expense): ReportingExpenseSource {
  return {
    id: expense.id, date: expense.date, category: expense.category, ...(expense.subcategory ? { subcategory: expense.subcategory } : {}), amount: expense.amount, method: expense.method, status: expense.status,
    ...(expense.payrollSettlementId ? { payrollSettlementId: expense.payrollSettlementId } : {}), ...(expense.employeeId ? { employeeId: expense.employeeId } : {}),
    ...(expense.periodFrom ? { periodFrom: expense.periodFrom } : {}), ...(expense.periodThrough ? { periodThrough: expense.periodThrough } : {}),
  }
}

function projectCashClosure(closure: CashClosure): ReportingCashClosureSource {
  return {
    id: closure.id, date: closure.date, movementFrom: closure.movementFrom, ...(closure.isBaseline !== undefined ? { isBaseline: closure.isBaseline } : {}),
    openingCash: closure.openingCash, openingBank: closure.openingBank, cashIncome: closure.cashIncome, bankIncome: closure.bankIncome, otherIncome: closure.otherIncome,
    cashExpenses: closure.cashExpenses, bankExpenses: closure.bankExpenses, otherExpenses: closure.otherExpenses, expectedCash: closure.expectedCash, expectedBank: closure.expectedBank,
    countedCash: closure.countedCash, countedBank: closure.countedBank, cashVariance: closure.cashVariance, bankVariance: closure.bankVariance,
  }
}

export function subscribeReportingData(
  user: AppUser | null,
  listeners: ReportingSubscriptions,
  onChange: ReportingListener,
  onError: ReportingErrorListener,
): Unsubscribe {
  const sources = reportingSourcesFor(user)
  const availableSources: ReportingSource[] = sources.filter(source => (source === 'athletes' && Boolean(listeners.athletes)) || (source === 'visits' && Boolean(listeners.visits)) || (source === 'store' && Boolean(listeners.sales)) || (source === 'memberships' && Boolean(listeners.payments)) || (source === 'visit-payments' && Boolean(listeners.visitPayments)) || (source === 'expenses' && Boolean(listeners.expenses)) || (source === 'cash-closures' && Boolean(listeners.cashClosures)) || (source === 'inventory' && Boolean(listeners.inventoryClosures && listeners.inventoryResolutions)) || (source === 'workforce' && Boolean(listeners.workEntries && listeners.payrollSettlements)))
  const dataset: ReportingDataset = { athletes: [], visits: [], sales: [], payments: [], inventoryClosures: [], inventoryResolutions: [], workEntries: [], payrollSettlements: [], visitPayments: [], expenses: [], cashClosures: [], sources: availableSources, loadedSources: [] }
  const stops: Unsubscribe[] = []
  const loadedParts = new Set<string>()
  const emit = () => onChange({ ...dataset, athletes: [...dataset.athletes], visits: [...dataset.visits], inventoryClosures: [...dataset.inventoryClosures], inventoryResolutions: [...dataset.inventoryResolutions], workEntries: [...dataset.workEntries], payrollSettlements: [...dataset.payrollSettlements] })

  const markGroupedSourceLoaded = (source: ReportingSource, part: string, required: string[]) => {
    loadedParts.add(part)
    if (required.every(item => loadedParts.has(item)) && !dataset.loadedSources.includes(source))
      dataset.loadedSources.push(source)
  }

  if (sources.includes('athletes') && listeners.athletes) {
    stops.push(listeners.athletes(items => {
      dataset.athletes = items.map(projectAthlete)
      if (!dataset.loadedSources.includes('athletes'))
        dataset.loadedSources.push('athletes')
      emit()
    }, error => onError('athletes', error)))
  }
  if (sources.includes('visits') && listeners.visits) {
    stops.push(listeners.visits(items => {
      dataset.visits = items.map(projectVisit)
      if (!dataset.loadedSources.includes('visits'))
        dataset.loadedSources.push('visits')
      emit()
    }, error => onError('visits', error)))
  }
  if (sources.includes('store') && listeners.sales) {
    stops.push(listeners.sales(items => {
      dataset.sales = items.map(projectSale)
      if (!dataset.loadedSources.includes('store'))
        dataset.loadedSources.push('store')
      emit()
    }, error => onError('store', error)))
  }
  if (sources.includes('memberships') && listeners.payments) {
    stops.push(listeners.payments(items => {
      dataset.payments = items.map(projectPayment)
      if (!dataset.loadedSources.includes('memberships'))
        dataset.loadedSources.push('memberships')
      emit()
    }, error => onError('memberships', error)))
  }
  if (sources.includes('visit-payments') && listeners.visitPayments) {
    stops.push(listeners.visitPayments(items => {
      dataset.visitPayments = items.map(projectVisitPayment)
      if (!dataset.loadedSources.includes('visit-payments')) dataset.loadedSources.push('visit-payments')
      emit()
    }, error => onError('visit-payments', error)))
  }
  if (sources.includes('expenses') && listeners.expenses) {
    stops.push(listeners.expenses(items => {
      dataset.expenses = items.map(projectExpense)
      if (!dataset.loadedSources.includes('expenses')) dataset.loadedSources.push('expenses')
      emit()
    }, error => onError('expenses', error)))
  }
  if (sources.includes('cash-closures') && listeners.cashClosures) {
    stops.push(listeners.cashClosures(items => {
      dataset.cashClosures = items.map(projectCashClosure)
      if (!dataset.loadedSources.includes('cash-closures')) dataset.loadedSources.push('cash-closures')
      emit()
    }, error => onError('cash-closures', error)))
  }
  if (sources.includes('inventory') && listeners.inventoryClosures && listeners.inventoryResolutions) {
    stops.push(listeners.inventoryClosures(items => {
      dataset.inventoryClosures = items.map(projectInventoryClosure)
      markGroupedSourceLoaded('inventory', 'inventory-closures', ['inventory-closures', 'inventory-resolutions'])
      emit()
    }, error => onError('inventory', error)))
    stops.push(listeners.inventoryResolutions(items => {
      dataset.inventoryResolutions = items.map(projectInventoryResolution)
      markGroupedSourceLoaded('inventory', 'inventory-resolutions', ['inventory-closures', 'inventory-resolutions'])
      emit()
    }, error => onError('inventory', error)))
  }
  if (sources.includes('workforce') && listeners.workEntries && listeners.payrollSettlements) {
    stops.push(listeners.workEntries(items => {
      dataset.workEntries = items.map(projectWorkEntry)
      markGroupedSourceLoaded('workforce', 'work-entries', ['work-entries', 'payroll-settlements'])
      emit()
    }, error => onError('workforce', error)))
    stops.push(listeners.payrollSettlements(items => {
      dataset.payrollSettlements = items.map(projectPayrollSettlement)
      markGroupedSourceLoaded('workforce', 'payroll-settlements', ['work-entries', 'payroll-settlements'])
      emit()
    }, error => onError('workforce', error)))
  }

  emit()

  return () => stops.forEach(stop => stop())
}
