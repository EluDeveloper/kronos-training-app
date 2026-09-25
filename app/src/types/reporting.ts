import type { PaymentMethod, AthleteLifecycleEvent, AthleteStatus, Visit, SaleItem, SalePayment, SalePaymentAdjustment, SaleStatus, ISOTimestamp, PaymentStatus, MembershipPeriodSnapshot, MembershipPaymentInstallment, InventoryClosureItem, InventoryResolutionKind, InventoryClosureStatus, ExpenseStatus } from './domain'
import type { CompensationUnit, WorkEntryStatus } from './workforce'

export type ReportingDataQuality = 'exact' | 'proportional' | 'partial-history' | 'unavailable'
export type ReportingPeriodKind = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'
export type ReportingComparison = 'previous-period' | 'year-over-year' | 'none'
export type ReportingDateRange = { from: string; through: string }

export interface ReportingFilters extends ReportingDateRange {
  productIds: string[]
  athleteId?: string
  status?: string
  athleteStatus?: AthleteStatus
  membershipStatus?: 'paid' | 'pending' | 'overdue' | 'advance' | 'unavailable'
  employeeId?: string
  workStatus?: WorkEntryStatus
  inventoryResolutionKind?: InventoryResolutionKind
  paymentMethod?: PaymentMethod
  financialAccount?: 'cash' | 'bank' | 'other' | 'non-cash'
  expenseCategory?: string
  expenseStatus?: ExpenseStatus
}

export type ReportingMetricKey =
  | 'unitsSold' | 'recognizedRevenue' | 'historicalCost' | 'grossProfit' | 'grossMargin'
  | 'collected' | 'recovered' | 'receivable' | 'cancellations'
  | 'athletesActive' | 'athletesPaused' | 'athletesInactive' | 'athleteEnrollments'
  | 'athletePauses' | 'athleteExits' | 'athleteReactivations' | 'athleteRetention' | 'membershipExpected' | 'membershipCollected'
  | 'membershipOverdue' | 'membershipAdvanced' | 'membershipReceivable'
  | 'inventoryDifferences' | 'inventoryRecovered' | 'inventoryCovered' | 'inventoryWrittenOff'
  | 'workAccrued' | 'workPaid' | 'workPending' | 'expenses' | 'cashFlow' | 'cashVariance'

export interface ReportingMetricDefinition {
  key: ReportingMetricKey
  label: string
  unit: 'currency' | 'count' | 'percentage'
  meaning: string
  attribution: 'sale-date' | 'movement-date' | 'cutoff-date' | 'event-date' | 'work-date'
}

export interface ReportingMetric<T = number> {
  key: ReportingMetricKey
  value: T | null
  quality: ReportingDataQuality
  sourceCount: number
  note?: string
}

export interface ReportingPeriodInput {
  kind: ReportingPeriodKind
  value?: string
  from?: string
  through?: string
}

export interface ReportingPeriodComparison {
  current: ReportingDateRange
  previous: ReportingDateRange | null
}

export type ReportingAthleteSource = {
  id: string
  status: AthleteStatus
  createdAt: string | number
  migrationNeedsReview?: boolean
  lifecycleEvents?: Record<string, ReportingAthleteEvent>
}

export type ReportingAthleteEvent = Pick<AthleteLifecycleEvent, 'id' | 'athleteId' | 'type' | 'fromStatus' | 'toStatus' | 'effectiveDate' | 'createdAt'>
export type ReportingVisitSource = Pick<Visit, 'id' | 'athleteId' | 'period' | 'visitedAt' | 'accessType'>
export type ReportingMembershipSource = {
  athleteId: string
  period: string
  status: PaymentStatus
  totalAmount?: number | null
  snapshot?: MembershipPeriodSnapshot
  installments?: Record<string, Pick<MembershipPaymentInstallment, 'id' | 'amountApplied' | 'method' | 'appliedAt'>>
  createdAt: ISOTimestamp
  updatedAt: ISOTimestamp
}
export type ReportingSaleSource = {
  id: string
  athleteId?: string | null
  createdAt: ISOTimestamp
  updatedAt: ISOTimestamp
  cancelledAt?: ISOTimestamp | null
  total: number
  status: SaleStatus
  items: Record<string, Pick<SaleItem, 'productId' | 'name' | 'quantity' | 'unitPrice' | 'unitCost'>>
  payments?: Record<string, Pick<SalePayment, 'id' | 'amountApplied' | 'method' | 'appliedAt' | 'groupPaymentId' | 'receivedAmount' | 'changeGiven' | 'creditBalance'>>
  paymentAdjustments?: Record<string, Pick<SalePaymentAdjustment, 'id' | 'saleId' | 'paymentId' | 'groupPaymentId' | 'kind' | 'amount' | 'fromMethod' | 'toMethod' | 'createdAt'>>
}

export type ReportingInventoryClosureSource = {
  id: string
  weekStart: string
  weekEnd: string
  status?: InventoryClosureStatus
  finalizedAt?: ISOTimestamp | null
  items: Record<string, InventoryClosureItem>
}

export type ReportingInventoryResolutionSource = {
  id: string
  adjustmentId: string
  closureId: string
  productId: string
  kind: InventoryResolutionKind
  units: number
  amount: number
  method?: PaymentMethod | null
  createdAt: ISOTimestamp
}

export type ReportingWorkEntrySource = {
  id: string
  employeeId: string
  employeeName: string
  date: string
  unit: CompensationUnit
  quantity: number
  rateSnapshot: number
  amount: number
  status: WorkEntryStatus
  payrollSettlementId?: string | null
}

export type ReportingPayrollSettlementSource = {
  id: string
  employeeId: string
  employeeName: string
  entryIds: Record<string, true>
  periodFrom: string
  periodThrough: string
  amount: number
  method: Exclude<PaymentMethod, 'store-credit'>
  paidAt: string
}

export type ReportingVisitPaymentSource = {
  id: string
  visitorId: string
  throughPeriod: string
  amount: number
  method: PaymentMethod
  appliedAt: ISOTimestamp
}

export type ReportingExpenseSource = {
  id: string
  date: string
  category: string
  subcategory?: string | null
  amount: number
  method: PaymentMethod
  status: ExpenseStatus
  payrollSettlementId?: string | null
  employeeId?: string | null
  periodFrom?: string | null
  periodThrough?: string | null
}

export type ReportingCashClosureSource = {
  id: string
  date: string
  movementFrom: string
  isBaseline?: boolean
  openingCash: number
  openingBank: number
  cashIncome: number
  bankIncome: number
  otherIncome: number
  cashExpenses: number
  bankExpenses: number
  otherExpenses: number
  expectedCash: number
  expectedBank: number
  countedCash: number
  countedBank: number
  cashVariance: number
  bankVariance: number
}
