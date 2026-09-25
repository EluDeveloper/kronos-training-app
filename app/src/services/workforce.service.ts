import { get, push, ref, set, update, type Unsubscribe } from 'firebase/database'
import type { PaymentMethod } from '@/types/domain'
import type { CompensationUnit, Employee, EmployeeKind, PayrollOperation, PayrollSettlement, WorkEntry } from '@/types/workforce'
import { buildWorkEntry, selectSettlementEntries, validateDailyWorkEntry } from '@/utils/workforce-payroll'
import { businessPath, requireDatabase, subscribeCollection, type ErrorHandler } from './realtime.service'

export interface EmployeeInput {
  name: string
  phone?: string | null
  kind: EmployeeKind
  startDate: string
  status: 'active' | 'inactive'
  notes?: string | null
  linkedUserId?: string | null
  compensationUnit: CompensationUnit
  currentRate: number
}

const currency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export const workforceService = {
  subscribeEmployees: (onChange: (items: Employee[]) => void, onError: ErrorHandler): Unsubscribe => subscribeCollection<Employee>('employees', onChange, onError),
  subscribeEntries: (onChange: (items: WorkEntry[]) => void, onError: ErrorHandler): Unsubscribe => subscribeCollection<WorkEntry>('workEntries', onChange, onError),
  subscribeSettlements: (onChange: (items: PayrollSettlement[]) => void, onError: ErrorHandler): Unsubscribe => subscribeCollection<PayrollSettlement>('payrollSettlements', onChange, onError),

  async saveEmployee(input: EmployeeInput, actorUid: string, employeeId?: string) {
    const database = requireDatabase()
    const id = employeeId ?? push(ref(database, businessPath('employees'))).key
    if (!id)
      throw new Error('No fue posible generar el empleado.')
    const employeeRef = ref(database, businessPath(`employees/${id}`))
    const snapshot = await get(employeeRef)
    const previous = snapshot.exists() ? snapshot.val() as Employee : null
    const now = Date.now()
    const rate = currency(input.currentRate)
    if (rate <= 0)
      throw new Error('La tarifa debe ser mayor que cero.')
    const rateHistory = { ...(previous?.rateHistory ?? {}) }
    if (!previous || previous.currentRate !== rate || previous.compensationUnit !== input.compensationUnit) {
      const rateId = `rate-${now}`

      rateHistory[rateId] = { id: rateId, unit: input.compensationUnit, amount: rate, effectiveFrom: input.startDate, createdBy: actorUid, createdAt: now }
    }
    await update(ref(database, businessPath('')), {
      [`employees/${id}`]: {
        ...input,
        id,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        notes: input.notes?.trim() || null,
        linkedUserId: input.linkedUserId || null,
        currentRate: rate,
        rateHistory,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      },
    })

    return id
  },

  async createWorkEntry(employeeId: string, input: { date: string; quantity: number; note?: string; correctionReason?: string }, actorUid: string) {
    const database = requireDatabase()

    const [employeeSnapshot, entriesSnapshot] = await Promise.all([
      get(ref(database, businessPath(`employees/${employeeId}`))),
      get(ref(database, businessPath('workEntries'))),
    ])

    if (!employeeSnapshot.exists())
      throw new Error('El empleado ya no existe.')
    const employee = employeeSnapshot.val() as Employee
    if (employee.status !== 'active')
      throw new Error('Sólo se puede registrar trabajo para empleados activos.')
    const entries = entriesSnapshot.exists() ? Object.values(entriesSnapshot.val() as Record<string, WorkEntry>) : []

    validateDailyWorkEntry(employee, entries, input.date, input.correctionReason)

    const id = push(ref(database, businessPath('workEntries'))).key
    if (!id)
      throw new Error('No fue posible generar la asistencia.')
    const entry = buildWorkEntry(employee, { ...input, id }, actorUid, Date.now())

    await update(ref(database, businessPath('')), { [`workEntries/${id}`]: entry })

    return id
  },

  async approveWorkEntry(entryId: string, actorUid: string) {
    const database = requireDatabase()
    const snapshot = await get(ref(database, businessPath(`workEntries/${entryId}`)))
    if (!snapshot.exists())
      throw new Error('El registro de trabajo ya no existe.')
    const entry = snapshot.val() as WorkEntry
    if (entry.status === 'paid')
      throw new Error('Una línea liquidada no puede modificarse.')
    const now = Date.now()

    await update(ref(database, businessPath(`workEntries/${entryId}`)), { status: 'approved', approvedBy: actorUid, approvedAt: now, updatedAt: now })
  },

  async settle(entryIds: string[], input: { paidAt: string; method: Exclude<PaymentMethod, 'store-credit'>; reference?: string }, actorUid: string) {
    const database = requireDatabase()

    const [entriesSnapshot, operationsSnapshot, completionsSnapshot] = await Promise.all([
      get(ref(database, businessPath('workEntries'))),
      get(ref(database, businessPath('payrollOperations'))),
      get(ref(database, businessPath('payrollOperationCompletions'))),
    ])

    const entries = entriesSnapshot.exists() ? Object.values(entriesSnapshot.val() as Record<string, WorkEntry>) : []
    const key = [...new Set(entryIds)].sort().join('|')
    const operations = operationsSnapshot.exists() ? Object.values(operationsSnapshot.val() as Record<string, PayrollOperation>) : []
    const previous = operations.find(operation => Object.keys(operation.entryIds).sort().join('|') === key)
    const completions = completionsSnapshot.exists() ? completionsSnapshot.val() as Record<string, { completedAt: number }> : {}
    if (previous && completions[previous.id])
      return previous.id
    const selection = selectSettlementEntries(entries, entryIds)
    const settlementId = previous?.id ?? push(ref(database, businessPath('payrollOperations'))).key
    if (!settlementId)
      throw new Error('No fue posible generar la liquidación.')
    const expenseId = `payroll-${settlementId}`
    const now = Date.now()

    const operation: PayrollOperation = previous ?? {
      id: settlementId,
      status: 'pending',
      employeeId: selection.employeeId,
      employeeName: selection.employeeName,
      entryIds: Object.fromEntries(selection.entries.map(entry => [entry.id, true])),
      periodFrom: selection.periodFrom,
      periodThrough: selection.periodThrough,
      amount: selection.amount,
      method: input.method,
      reference: input.reference?.trim() || null,
      paidAt: input.paidAt,
      createdBy: actorUid,
      createdAt: now,
      updatedAt: now,
    }

    if (!previous)
      await set(ref(database, businessPath(`payrollOperations/${settlementId}`)), operation)

    const settlement: PayrollSettlement = {
      id: settlementId,
      employeeId: operation.employeeId,
      employeeName: operation.employeeName,
      entryIds: operation.entryIds,
      periodFrom: operation.periodFrom,
      periodThrough: operation.periodThrough,
      amount: operation.amount,
      method: operation.method,
      reference: operation.reference ?? null,
      paidAt: operation.paidAt,
      expenseId,
      createdBy: actorUid,
      createdAt: now,
      updatedAt: now,
    }

    const updates: Record<string, unknown> = {
      [`payrollSettlements/${settlementId}`]: settlement,
      [`expenses/${expenseId}`]: {
        id: expenseId,
        date: operation.paidAt,
        category: 'Nómina',
        subcategory: 'Liquidación de trabajo',
        description: `Liquidación ${operation.employeeName} · ${operation.periodFrom} a ${operation.periodThrough}`,
        amount: operation.amount,
        method: operation.method,
        status: 'paid',
        registeredBy: actorUid,
        payrollSettlementId: settlementId,
        employeeId: operation.employeeId,
        employeeName: operation.employeeName,
        periodFrom: operation.periodFrom,
        periodThrough: operation.periodThrough,
        createdAt: now,
        updatedAt: now,
      },
      [`payrollOperationCompletions/${settlementId}`]: { operationId: settlementId, completedBy: actorUid, completedAt: now },
    }

    selection.entries.forEach(entry => {
      updates[`workEntries/${entry.id}/status`] = 'paid'
      updates[`workEntries/${entry.id}/payrollSettlementId`] = settlementId
      updates[`workEntries/${entry.id}/updatedAt`] = now
    })
    await update(ref(database, businessPath('')), updates)

    return settlementId
  },
}
