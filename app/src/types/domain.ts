export type EntityId = string
export type ISODate = string
export type ISOTimestamp = string | number

export type ActiveStatus = 'active' | 'inactive'
export type PaymentStatus = 'paid' | 'pending' | 'not-applicable'
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other' | 'store-credit'
export type SaleStatus = 'paid' | 'credit' | 'cancelled'
export type ExpenseStatus = 'paid' | 'pending' | 'scheduled'
export type PlanAccessType = 'unlimited' | 'visit-pack' | 'pay-per-visit'
export type MaritalStatus = 'single' | 'married' | 'domestic-partnership' | 'divorced' | 'widowed' | 'separated' | 'prefer-not-to-say'
export type ExerciseSymptom = 'dizziness' | 'fainting' | 'nausea' | 'shortness-of-breath' | 'none'

export interface AuditFields {
  createdAt: ISOTimestamp
  updatedAt: ISOTimestamp
}

export interface AthleteProfile {
  name: string
  phone: string
  birthDate?: ISODate | null
}

export interface Membership {
  schedule: string
  planId: EntityId
  agreedAmount: number
  paymentDay: number
  registrationDate: ISODate
}

export interface Athlete extends AuditFields {
  id: EntityId
  profile: AthleteProfile
  membership: Membership
  status: ActiveStatus
  kioskCode?: string | null
  inactiveAt?: ISODate | null
  inactiveReason?: string | null
  migrationNeedsReview?: boolean
}

export interface EmergencyContact {
  name: string
  phone: string
  relationship: string
}

export interface AthleteHealthConditions {
  asthma: boolean
  epilepsy: boolean
  diabetes: boolean
  other: boolean
  none: boolean
  otherDescription?: string | null
}

export interface AthleteExerciseSymptoms {
  dizziness: boolean
  fainting: boolean
  nausea: boolean
  shortnessOfBreath: boolean
  none: boolean
}

export interface AthleteHealthHistory {
  boneInjury: boolean
  cardiovascularDisease: boolean
  exerciseBreathingDifficulty: boolean
  conditions: AthleteHealthConditions
  anemia: boolean
  exerciseSymptoms: AthleteExerciseSymptoms
  sportsActivity: { practiced: boolean; description?: string | null }
  sportsFacility: { attended: boolean; description?: string | null }
}

export interface AthleteIntake extends AuditFields {
  athleteId: EntityId
  maritalStatus: MaritalStatus
  emergencyContact: EmergencyContact
  healthHistory: AthleteHealthHistory
}

export interface VisitorContact extends AuditFields {
  id: EntityId
  name: string
  phone: string
  pricePerVisit: number
}

export interface MembershipPlan extends AuditFields {
  id: EntityId
  name: string
  billingPeriod: 'monthly' | 'quarterly' | 'other'
  price: number
  status: ActiveStatus
  accessType?: PlanAccessType
  visitLimit?: number | null
  pricePerVisit?: number | null
}

export interface Payment extends AuditFields {
  athleteId: EntityId
  visitorId?: EntityId | null
  period: string
  status: PaymentStatus
  method?: PaymentMethod | null
  amount?: number | null
  appliedAt?: ISOTimestamp | null
  concept?: string | null
  visitCount?: number | null
  totalAmount?: number | null
  balance?: number | null
  installments?: Record<EntityId, MembershipPaymentInstallment>
}

export interface MembershipPaymentInstallment {
  id: EntityId
  amountApplied: number
  method: PaymentMethod
  appliedAt: ISOTimestamp
  balanceAfter: number
}

export interface Visit extends AuditFields {
  id: EntityId
  athleteId?: EntityId | null
  visitorId?: EntityId | null
  period: string
  visitedAt: ISOTimestamp
  planId?: EntityId | null
  accessType: PlanAccessType
  unitPrice: number
  note?: string | null
  paidAt?: ISOTimestamp | null
  visitPaymentId?: EntityId | null
  paymentPeriod?: string | null
}

export interface VisitPaymentReference {
  id: EntityId
  period: string
  visitedAt: ISOTimestamp
  unitPrice: number
}

export interface VisitPayment extends AuditFields {
  id: EntityId
  visitorId: EntityId
  customerName: string
  phone: string
  throughPeriod: string
  amount: number
  method: PaymentMethod
  appliedAt: ISOTimestamp
  visitRefs: Record<EntityId, VisitPaymentReference>
}

export interface Skill {
  id: EntityId
  name: string
  status: ActiveStatus
}

export interface PerformanceRecord {
  id: EntityId
  athleteId: EntityId
  skillId: EntityId
  valueLbs: number
  valueKg: number
  type: string
  recordedAt: ISODate
}

export interface Product extends AuditFields {
  id: EntityId
  name: string
  category: string
  barcode?: string | null
  barcodes?: Record<string, true> | null
  size?: string | null
  stock: number
  alertLevel: number
  unitCost: number
  salePrice: number
  status: ActiveStatus
  inventoryAdjustments?: Record<EntityId, ISOTimestamp>
}

export interface SaleItem {
  productId: EntityId
  name: string
  quantity: number
  unitPrice: number
  unitCost: number
}

export interface SalePayment {
  id: EntityId
  amountApplied: number
  method: PaymentMethod
  receivedAmount?: number
  changeGiven?: number
  creditBalance?: number
  appliedAt: ISOTimestamp
  membershipPeriod?: string | null
  membershipInstallmentId?: EntityId | null
  groupPaymentId?: EntityId | null
}

export interface Sale extends AuditFields {
  id: EntityId
  athleteId?: EntityId | null
  visitorId?: EntityId | null
  customerName: string
  items: Record<EntityId, SaleItem>
  total: number
  status: SaleStatus
  source?: 'pos' | 'kiosk'
  approvedBy?: EntityId | null
  payments?: Record<EntityId, SalePayment>
  cancelledAt?: ISOTimestamp | null
  inventoryRestoredAt?: ISOTimestamp | null
  storeCreditRestoredAt?: ISOTimestamp | null
}

export interface CombinedStorePayment {
  sale: Sale
  payment: SalePayment
}

export type StoreCreditEntryType = 'deposit' | 'application' | 'refund'

export interface StoreCreditEntry {
  id: EntityId
  type: StoreCreditEntryType
  amount: number
  saleId: EntityId
  description: string
  occurredAt: ISOTimestamp
  balanceAfter: number
}

export interface StoreCreditAccount extends AuditFields {
  athleteId: EntityId
  balance: number
  entries: Record<EntityId, StoreCreditEntry>
}

export interface Expense extends AuditFields {
  id: EntityId
  date: ISODate
  category: string
  subcategory?: string | null
  description: string
  amount: number
  method: PaymentMethod
  status: ExpenseStatus
  registeredBy: string
  receiptUrl?: string | null
}

export interface CashClosure extends AuditFields {
  id: ISODate
  date: ISODate
  movementFrom: ISODate
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
  notes?: string | null
  closedBy: EntityId
  closedByName: string
}

export interface InventoryClosureItem {
  productId: EntityId
  name: string
  category: string
  systemStock: number
  countedStock: number
  variance: number
  unitCost: number
  varianceValue: number
}

export interface InventoryClosure extends AuditFields {
  id: ISODate
  weekStart: ISODate
  weekEnd: ISODate
  items: Record<EntityId, InventoryClosureItem>
  totalSystemUnits: number
  totalCountedUnits: number
  varianceUnits: number
  lossValue: number
  gainValue: number
  notes?: string | null
  closedBy: EntityId
  closedByName: string
}

export interface WorkoutBlock {
  duration: string
  title: string
  details: string[]
}

export interface Workout extends AuditFields {
  id: EntityId
  date: ISODate
  focus: string
  blocks: WorkoutBlock[]
}

export interface AuthorizedDevice {
  enabled: boolean
  label?: string
  createdAt?: ISOTimestamp
  lastSeenAt?: ISOTimestamp
}

export const calculateAge = (birthDate?: ISODate | null, referenceDate = new Date()) => {
  if (!birthDate)
    return null

  const [year, month, day] = birthDate.split('-').map(Number)
  if (!year || !month || !day)
    return null

  let age = referenceDate.getFullYear() - year

  const hasNotHadBirthday = referenceDate.getMonth() + 1 < month
    || (referenceDate.getMonth() + 1 === month && referenceDate.getDate() < day)

  if (hasNotHadBirthday)
    age -= 1

  return age >= 0 ? age : null
}

export const currentPeriod = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export const planAccessType = (plan?: MembershipPlan | null): PlanAccessType => {
  if (plan?.accessType)
    return plan.accessType

  const name = plan?.name.toLocaleLowerCase('es') ?? ''
  if (name.includes('cupon') || name.includes('10 visita'))
    return 'visit-pack'
  if (name.includes('por visita') || name.includes('visita individual'))
    return 'pay-per-visit'

  return 'unlimited'
}

export const planVisitLimit = (plan?: MembershipPlan | null) => planAccessType(plan) === 'visit-pack'
  ? Math.max(1, Number(plan?.visitLimit || 10))
  : null

export const planVisitPrice = (plan?: MembershipPlan | null) => planAccessType(plan) === 'pay-per-visit'
  ? Math.max(0, Number(plan?.pricePerVisit ?? plan?.price ?? 0))
  : 0
