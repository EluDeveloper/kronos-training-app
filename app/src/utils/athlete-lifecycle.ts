import type { Athlete, AthleteLifecycleEvent, AthleteStatus, ISODate, ISOTimestamp } from '@/types/domain'

export interface AthleteTransitionCommand {
  id: string
  toStatus: AthleteStatus
  effectiveDate: ISODate
  expectedReturnDate?: ISODate | null
  reason: string
  notes?: string | null
}

export interface AthleteTransition {
  event: AthleteLifecycleEvent
  patch: Pick<Athlete, 'status' | 'pausedAt' | 'expectedReturnDate' | 'inactiveAt' | 'inactiveReason' | 'updatedAt'>
}

const datePattern = /^\d{4}-(?:0[1-9]|1[0-2])-(?:[0-2]\d|3[01])$/

export function buildAthleteTransition(
  fromStatus: AthleteStatus,
  command: AthleteTransitionCommand,
  actorUid: string,
  createdAt: ISOTimestamp,
  athleteId: string,
): AthleteTransition {
  if (fromStatus === command.toStatus)
    throw new Error('Selecciona una transición de estado válida.')
  if (!datePattern.test(command.effectiveDate))
    throw new Error('La fecha efectiva no es válida.')

  const reason = command.reason.trim()
  if (reason.length < 3)
    throw new Error('El motivo de la transición es obligatorio.')
  if (!command.id || !actorUid || !athleteId)
    throw new Error('No fue posible auditar la transición.')
  if (command.toStatus === 'paused' && command.expectedReturnDate
    && (!datePattern.test(command.expectedReturnDate) || command.expectedReturnDate < command.effectiveDate))
    throw new Error('La fecha esperada de regreso debe ser igual o posterior a la pausa.')

  const event: AthleteLifecycleEvent = {
    id: command.id,
    athleteId,
    type: command.toStatus === 'paused' ? 'paused' : command.toStatus === 'inactive' ? 'inactive' : 'reactivated',
    fromStatus,
    toStatus: command.toStatus,
    effectiveDate: command.effectiveDate,
    ...(command.toStatus === 'paused' && command.expectedReturnDate ? { expectedReturnDate: command.expectedReturnDate } : {}),
    reason,
    ...(command.notes?.trim() ? { notes: command.notes.trim() } : {}),
    createdBy: actorUid,
    createdAt,
  }

  return {
    event,
    patch: {
      status: command.toStatus,
      pausedAt: command.toStatus === 'paused' ? command.effectiveDate : null,
      expectedReturnDate: command.toStatus === 'paused' ? command.expectedReturnDate ?? null : null,
      inactiveAt: command.toStatus === 'inactive' ? command.effectiveDate : null,
      inactiveReason: command.toStatus === 'inactive' ? reason : null,
      updatedAt: createdAt,
    },
  }
}
