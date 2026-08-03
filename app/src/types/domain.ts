export type EntityId = string
export type ISODate = string
export type ISOTimestamp = string | number

export type ActiveStatus = 'active' | 'inactive'
export type PaymentStatus = 'paid' | 'pending' | 'not-applicable'
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other'
export type SaleStatus = 'paid' | 'credit' | 'cancelled'
export type ExpenseStatus = 'paid' | 'pending' | 'scheduled'
export type PlanAccessType = 'unlimited' | 'visit-pack' | 'pay-per-visit'

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
  inactiveAt?: ISODate | null
  inactiveReason?: string | null
  migrationNeedsReview?: boolean
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
  period: string
  status: PaymentStatus
  method?: PaymentMethod | null
  amount?: number | null
  appliedAt?: ISOTimestamp | null
  concept?: string | null
  visitCount?: number | null
}

export interface Visit extends AuditFields {
  id: EntityId
  athleteId: EntityId
  period: string
  visitedAt: ISOTimestamp
  planId: EntityId
  accessType: PlanAccessType
  unitPrice: number
  note?: string | null
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
}

export interface Sale extends AuditFields {
  id: EntityId
  athleteId?: EntityId | null
  customerName: string
  items: Record<EntityId, SaleItem>
  total: number
  status: SaleStatus
  payments?: Record<EntityId, SalePayment>
  cancelledAt?: ISOTimestamp | null
  inventoryRestoredAt?: ISOTimestamp | null
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
