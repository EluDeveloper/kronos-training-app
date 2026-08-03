import type { Visit } from '@/types/domain'
import { createEntity, deleteEntity, subscribeValue, type ErrorHandler } from './realtime.service'

type VisitTree = Record<string, Record<string, Record<string, Omit<Visit, 'id' | 'athleteId' | 'period'>>>>
export type NewVisit = Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>

export const visitsService = {
  subscribe(onChange: (items: Visit[]) => void, onError: ErrorHandler) {
    return subscribeValue<VisitTree>('visits', tree => {
      onChange(Object.entries(tree ?? {}).flatMap(([athleteId, periods]) =>
        Object.entries(periods ?? {}).flatMap(([period, visits]) =>
          Object.entries(visits ?? {}).map(([id, visit]) => ({ ...visit, id, athleteId, period } as Visit)),
        ),
      ))
    }, onError)
  },
  create(visit: NewVisit) {
    const { athleteId, period, ...data } = visit

    return createEntity(`visits/${athleteId}/${period}`, { ...data, athleteId, period })
  },
  delete: (visit: Visit) => deleteEntity(`visits/${visit.athleteId}/${visit.period}/${visit.id}`),
}
