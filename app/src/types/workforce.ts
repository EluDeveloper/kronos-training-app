import type { AuditFields, EntityId, ISODate, ISOTimestamp, PaymentMethod } from '@/types/domain'

export type EmployeeKind = 'coach' | 'cleaning' | 'other'
export type CompensationUnit = 'class' | 'day' | 'fixed-period'
export type WorkEntryStatus = 'pending' | 'approved' | 'paid'

export interface CoachDirectoryEntry {
  id: EntityId
  name: string
  status: 'active' | 'inactive'
}

export interface EmployeeRate {
  id: EntityId
  unit: CompensationUnit
  amount: number
  effectiveFrom: ISODate
  createdBy: EntityId
  createdAt: ISOTimestamp
}

export interface Employee extends AuditFields {
  id: EntityId
  name: string
  phone?: string | null
  birthDate?: ISODate | null
  kind: EmployeeKind
  startDate: ISODate
  status: 'active' | 'inactive'
  notes?: string | null
  linkedUserId?: EntityId | null
  compensationUnit: CompensationUnit
  currentRate: number
  rateHistory: Record<EntityId, EmployeeRate>
}

export interface WorkEntry extends AuditFields {
  id: EntityId
  employeeId: EntityId
  employeeName: string
  date: ISODate
  unit: CompensationUnit
  quantity: number
  rateSnapshot: number
  amount: number
  status: WorkEntryStatus
  note?: string | null
  correctionReason?: string | null
  createdBy: EntityId
  approvedBy?: EntityId | null
  approvedAt?: ISOTimestamp | null
  payrollSettlementId?: EntityId | null
}

export interface PayrollSettlement extends AuditFields {
  id: EntityId
  employeeId: EntityId
  employeeName: string
  entryIds: Record<EntityId, true>
  periodFrom: ISODate
  periodThrough: ISODate
  amount: number
  method: Exclude<PaymentMethod, 'store-credit'>
  reference?: string | null
  paidAt: ISODate
  expenseId: EntityId
  createdBy: EntityId
}

export interface PayrollOperation extends AuditFields {
  id: EntityId
  status: 'pending'
  employeeId: EntityId
  employeeName: string
  entryIds: Record<EntityId, true>
  periodFrom: ISODate
  periodThrough: ISODate
  amount: number
  method: Exclude<PaymentMethod, 'store-credit'>
  reference?: string | null
  paidAt: ISODate
  createdBy: EntityId
}
