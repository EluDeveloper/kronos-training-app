import type { Employee, WorkEntry } from '@/types/workforce'

const currency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export function buildWorkEntry(employee: Employee, input: { id: string; date: string; quantity: number; note?: string; correctionReason?: string }, actorUid: string, createdAt: number): WorkEntry {
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error('La cantidad trabajada debe ser mayor que cero.')
  if (employee.compensationUnit === 'day' && quantity !== 1)
    throw new Error('Una asistencia por día debe tener cantidad 1.')

  return {
    id: input.id,
    employeeId: employee.id,
    employeeName: employee.name,
    date: input.date,
    unit: employee.compensationUnit,
    quantity,
    rateSnapshot: currency(employee.currentRate),
    amount: currency(quantity * employee.currentRate),
    status: 'pending',
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.correctionReason?.trim() ? { correctionReason: input.correctionReason.trim() } : {}),
    createdBy: actorUid,
    createdAt,
    updatedAt: createdAt,
  }
}

export function validateDailyWorkEntry(employee: Employee, entries: WorkEntry[], date: string, correctionReason?: string) {
  if (employee.kind !== 'cleaning' || employee.compensationUnit !== 'day')
    return
  const duplicate = entries.some(entry => entry.employeeId === employee.id && entry.date === date)
  if (duplicate && (correctionReason?.trim().length ?? 0) < 3)
    throw new Error('Ya existe una asistencia de limpieza ese día; documenta el motivo de corrección.')
}

export function selectSettlementEntries(entries: WorkEntry[], entryIds: string[]) {
  const uniqueIds = [...new Set(entryIds)]
  const selected = uniqueIds.map(id => entries.find(entry => entry.id === id)).filter((entry): entry is WorkEntry => Boolean(entry))
  if (!selected.length || selected.length !== uniqueIds.length)
    throw new Error('Selecciona al menos un registro de trabajo válido.')
  if (selected.some(entry => entry.status === 'paid'))
    throw new Error('Una línea ya liquidada no puede volver a pagarse.')
  if (new Set(selected.map(entry => entry.employeeId)).size !== 1)
    throw new Error('Una liquidación sólo puede incluir trabajo del mismo empleado.')

  const sorted = selected.slice().sort((left, right) => left.date.localeCompare(right.date))

  return {
    employeeId: sorted[0]!.employeeId,
    employeeName: sorted[0]!.employeeName,
    periodFrom: sorted[0]!.date,
    periodThrough: sorted.at(-1)!.date,
    amount: currency(sorted.reduce((sum, entry) => sum + entry.amount, 0)),
    entries: sorted,
  }
}

export function workforceTotals(entries: WorkEntry[]) {
  const accrued = currency(entries.reduce((sum, entry) => sum + entry.amount, 0))
  const paid = currency(entries.filter(entry => entry.status === 'paid').reduce((sum, entry) => sum + entry.amount, 0))

  return { accrued, paid, pending: currency(accrued - paid) }
}
