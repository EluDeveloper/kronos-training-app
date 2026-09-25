import type { AthleteStatus, ExpenseStatus, InventoryResolutionKind, PaymentMethod } from '@/types/domain'
import type { WorkEntryStatus } from '@/types/workforce'
import type { ReportingDateRange, ReportingFilters, ReportingPeriodComparison, ReportingPeriodInput } from '@/types/reporting'

const datePattern = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
const methods: PaymentMethod[] = ['cash', 'transfer', 'card', 'other', 'store-credit']
const athleteStatuses: AthleteStatus[] = ['active', 'paused', 'inactive']
const membershipStatuses: NonNullable<ReportingFilters['membershipStatus']>[] = ['paid', 'pending', 'overdue', 'advance', 'unavailable']
const workStatuses: WorkEntryStatus[] = ['pending', 'approved', 'paid']
const inventoryResolutionKinds: InventoryResolutionKind[] = ['found', 'covered', 'written-off', 'corrected']
const financialAccounts: NonNullable<ReportingFilters['financialAccount']>[] = ['cash', 'bank', 'other', 'non-cash']
const expenseStatuses: ExpenseStatus[] = ['paid', 'pending', 'scheduled']

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function assertDate(value: string): string {
  if (!datePattern.test(value))
    throw new Error(`Fecha de reporte no válida: ${value}`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (date.toISOString().slice(0, 10) !== value)
    throw new Error(`Fecha de reporte no válida: ${value}`)

  return value
}

const dateFromUtc = (date: Date) => date.toISOString().slice(0, 10)

export function dateForBusinessTimeZone(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime()))
    throw new Error('La fecha del movimiento no es válida.')

  return dateTimeFormatter.format(date)
}

export function normalizeReportingFilters(input: {
  from: string
  through: string
  productIds?: string[]
  athleteId?: string | null
  status?: string | null
  athleteStatus?: AthleteStatus | null
  membershipStatus?: ReportingFilters['membershipStatus'] | null
  employeeId?: string | null
  workStatus?: WorkEntryStatus | null
  inventoryResolutionKind?: InventoryResolutionKind | null
  paymentMethod?: PaymentMethod | null
  financialAccount?: ReportingFilters['financialAccount'] | null
  expenseCategory?: string | null
  expenseStatus?: ExpenseStatus | null
}): ReportingFilters {
  const from = assertDate(input.from)
  const through = assertDate(input.through)
  if (from > through)
    throw new Error('El inicio del periodo debe ser anterior o igual al final.')
  if (input.paymentMethod && !methods.includes(input.paymentMethod))
    throw new Error('El método de pago del filtro no es válido.')
  if (input.athleteStatus && !athleteStatuses.includes(input.athleteStatus))
    throw new Error('El estado de atleta del filtro no es válido.')
  if (input.membershipStatus && !membershipStatuses.includes(input.membershipStatus))
    throw new Error('El estado de mensualidad del filtro no es válido.')
  if (input.workStatus && !workStatuses.includes(input.workStatus))
    throw new Error('El estado de trabajo del filtro no es válido.')
  if (input.inventoryResolutionKind && !inventoryResolutionKinds.includes(input.inventoryResolutionKind))
    throw new Error('El tipo de resolución de inventario no es válido.')
  if (input.financialAccount && !financialAccounts.includes(input.financialAccount))
    throw new Error('La cuenta financiera del filtro no es válida.')
  if (input.expenseStatus && !expenseStatuses.includes(input.expenseStatus))
    throw new Error('El estado de egreso del filtro no es válido.')

  const filters: ReportingFilters = {
    from,
    through,
    productIds: [...new Set((input.productIds ?? []).map(id => id.trim()).filter(Boolean))].sort(),
  }

  const athleteId = input.athleteId?.trim()
  const employeeId = input.employeeId?.trim()
  const status = input.status?.trim()
  const expenseCategory = input.expenseCategory?.trim()
  if (athleteId) filters.athleteId = athleteId
  if (status) filters.status = status
  if (input.athleteStatus) filters.athleteStatus = input.athleteStatus
  if (input.membershipStatus) filters.membershipStatus = input.membershipStatus
  if (employeeId) filters.employeeId = employeeId
  if (input.workStatus) filters.workStatus = input.workStatus
  if (input.inventoryResolutionKind) filters.inventoryResolutionKind = input.inventoryResolutionKind
  if (input.paymentMethod) filters.paymentMethod = input.paymentMethod
  if (input.financialAccount) filters.financialAccount = input.financialAccount
  if (expenseCategory) filters.expenseCategory = expenseCategory
  if (input.expenseStatus) filters.expenseStatus = input.expenseStatus

  return filters
}

export function serializeReportingFilters(filters: ReportingFilters): string {
  const query = new URLSearchParams()

  query.set('from', filters.from)
  query.set('through', filters.through)
  filters.productIds.forEach(id => query.append('productId', id))
  if (filters.athleteId) query.set('athleteId', filters.athleteId)
  if (filters.status) query.set('status', filters.status)
  if (filters.athleteStatus) query.set('athleteStatus', filters.athleteStatus)
  if (filters.membershipStatus) query.set('membershipStatus', filters.membershipStatus)
  if (filters.employeeId) query.set('employeeId', filters.employeeId)
  if (filters.workStatus) query.set('workStatus', filters.workStatus)
  if (filters.inventoryResolutionKind) query.set('inventoryResolutionKind', filters.inventoryResolutionKind)
  if (filters.paymentMethod) query.set('paymentMethod', filters.paymentMethod)
  if (filters.financialAccount) query.set('financialAccount', filters.financialAccount)
  if (filters.expenseCategory) query.set('expenseCategory', filters.expenseCategory)
  if (filters.expenseStatus) query.set('expenseStatus', filters.expenseStatus)

  return query.toString()
}

export function parseReportingFilters(queryInput: string | URLSearchParams): ReportingFilters {
  const queryText = typeof queryInput === 'string' ? queryInput.split('#', 1)[0] : null
  const query = queryInput instanceof URLSearchParams ? queryInput : new URLSearchParams(queryText ?? '')
  const from = query.get('from')
  const through = query.get('through')
  if (!from || !through)
    throw new Error('La URL requiere fecha inicial y final del reporte.')
  const method = query.get('paymentMethod')
  if (method && !methods.includes(method as PaymentMethod))
    throw new Error('El método de pago del filtro no es válido.')

  return normalizeReportingFilters({
    from,
    through,
    productIds: query.getAll('productId'),
    athleteId: query.get('athleteId'),
    status: query.get('status'),
    athleteStatus: query.get('athleteStatus') as AthleteStatus | null,
    membershipStatus: query.get('membershipStatus') as ReportingFilters['membershipStatus'] | null,
    employeeId: query.get('employeeId'),
    workStatus: query.get('workStatus') as WorkEntryStatus | null,
    inventoryResolutionKind: query.get('inventoryResolutionKind') as InventoryResolutionKind | null,
    paymentMethod: method as PaymentMethod | null,
    financialAccount: query.get('financialAccount') as ReportingFilters['financialAccount'] | null,
    expenseCategory: query.get('expenseCategory'),
    expenseStatus: query.get('expenseStatus') as ExpenseStatus | null,
  })
}

export function reportingPeriodRange(input: ReportingPeriodInput): ReportingDateRange {
  if (input.kind === 'custom') {
    if (!input.from || !input.through)
      throw new Error('El periodo personalizado requiere fecha inicial y final.')
    const from = assertDate(input.from)
    const through = assertDate(input.through)
    if (from > through)
      throw new Error('El inicio del periodo debe ser anterior o igual al final.')

    return { from, through }
  }

  const value = input.value ?? ''
  if (input.kind === 'day') {
    const day = assertDate(value)

    return { from: day, through: day }
  }
  if (input.kind === 'week') {
    const day = assertDate(value)
    const date = new Date(`${day}T00:00:00.000Z`)
    const weekday = (date.getUTCDay() + 6) % 7

    date.setUTCDate(date.getUTCDate() - weekday)

    const from = dateFromUtc(date)

    date.setUTCDate(date.getUTCDate() + 6)

    return { from, through: dateFromUtc(date) }
  }
  if (input.kind === 'month') {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value))
      throw new Error('El mes del periodo no es válido.')
    const [year, month] = value.split('-').map(Number)

    return { from: `${value}-01`, through: dateFromUtc(new Date(Date.UTC(year!, month!, 0))) }
  }
  if (input.kind === 'quarter') {
    if (!/^\d{4}-Q[1-4]$/.test(value))
      throw new Error('El trimestre del periodo no es válido.')
    const year = Number(value.slice(0, 4))
    const firstMonth = (Number(value.at(-1)) - 1) * 3 + 1
    const throughMonth = firstMonth + 2
    const from = `${year}-${String(firstMonth).padStart(2, '0')}-01`
    const through = dateFromUtc(new Date(Date.UTC(year, throughMonth, 0)))

    return { from, through }
  }
  if (input.kind === 'year') {
    if (!/^\d{4}$/.test(value))
      throw new Error('El año del periodo no es válido.')

    return { from: `${value}-01-01`, through: `${value}-12-31` }
  }

  throw new Error('El tipo de periodo no es válido.')
}

export function reportingPeriodComparison(current: ReportingDateRange, comparison: 'previous-period' | 'year-over-year' | 'none'): ReportingPeriodComparison {
  assertDate(current.from)
  assertDate(current.through)
  if (current.from > current.through)
    throw new Error('El inicio del periodo debe ser anterior o igual al final.')
  if (comparison === 'none')
    return { current, previous: null }

  if (comparison === 'previous-period') {
    const dayCount = (Date.parse(`${current.through}T00:00:00.000Z`) - Date.parse(`${current.from}T00:00:00.000Z`)) / 86_400_000 + 1
    const previousThrough = new Date(Date.parse(`${current.from}T00:00:00.000Z`) - 86_400_000)
    const previousFrom = new Date(previousThrough.getTime() - (dayCount - 1) * 86_400_000)

    return { current, previous: { from: dateFromUtc(previousFrom), through: dateFromUtc(previousThrough) } }
  }

  const shiftYear = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    const safeDay = Math.min(day!, new Date(Date.UTC(year! - 1, month!, 0)).getUTCDate())

    return `${year! - 1}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
  }

  return { current, previous: { from: shiftYear(current.from), through: shiftYear(current.through) } }
}
