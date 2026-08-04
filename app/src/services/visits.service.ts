import type { Visit } from '@/types/domain'
import { createEntity, deleteEntity, subscribeValue, type ErrorHandler } from './realtime.service'

type VisitTree = Record<string, Record<string, Record<string, Omit<Visit, 'id' | 'period'>>>>
export type NewVisit = Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>

export const visitsService = {
  subscribe(onChange: (items: Visit[]) => void, onError: ErrorHandler) {
    return subscribeValue<VisitTree>('visits', tree => {
      onChange(Object.entries(tree ?? {}).flatMap(([subjectId, periods]) =>
        Object.entries(periods ?? {}).flatMap(([period, visits]) =>
          Object.entries(visits ?? {}).map(([id, visit]) => ({
            ...visit,
            id,
            period,
            ...(!visit.athleteId && !visit.visitorId ? { athleteId: subjectId } : {}),
          } as Visit)),
        ),
      ))
    }, onError)
  },
  create(visit: NewVisit) {
    const { athleteId, visitorId, period, ...data } = visit
    const subjectId = visitorId || athleteId
    if (!subjectId)
      throw new Error('La visita requiere un atleta o visitante.')

    return createEntity(`visits/${subjectId}/${period}`, { ...data, athleteId: athleteId ?? null, visitorId: visitorId ?? null, period })
  },
  delete(visit: Visit) {
    const subjectId = visit.visitorId || visit.athleteId
    if (!subjectId)
      throw new Error('No fue posible identificar al propietario de la visita.')

    return deleteEntity(`visits/${subjectId}/${visit.period}/${visit.id}`)
  },
}
