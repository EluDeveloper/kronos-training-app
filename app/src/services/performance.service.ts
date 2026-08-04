import type { PerformanceRecord } from '@/types/domain'
import { createEntity, deleteEntity, subscribeValue, updateEntity, type ErrorHandler } from './realtime.service'

type PerformanceTree = Record<string, Record<string, Record<string, Omit<PerformanceRecord, 'id' | 'athleteId' | 'skillId'>>>>
export type NewPerformanceRecord = Omit<PerformanceRecord, 'id'>
export type PerformanceRecordUpdate = Pick<PerformanceRecord, 'type' | 'valueLbs' | 'valueKg' | 'recordedAt'>

export const performanceService = {
  subscribe(onChange: (items: PerformanceRecord[]) => void, onError: ErrorHandler) {
    return subscribeValue<PerformanceTree>('performance', tree => {
      onChange(Object.entries(tree ?? {}).flatMap(([athleteId, skills]) =>
        Object.entries(skills ?? {}).flatMap(([skillId, entries]) =>
          Object.entries(entries ?? {}).map(([id, record]) => ({ ...record, id, athleteId, skillId } as PerformanceRecord)),
        ),
      ))
    }, onError)
  },
  create(record: NewPerformanceRecord) {
    const { athleteId, skillId, ...data } = record

    return createEntity(`performance/${athleteId}/${skillId}`, data as unknown as Record<string, unknown>)
  },
  update(record: PerformanceRecord, data: PerformanceRecordUpdate) {
    return updateEntity(`performance/${record.athleteId}/${record.skillId}/${record.id}`, data as unknown as Record<string, unknown>)
  },
  delete: (record: PerformanceRecord) => deleteEntity(`performance/${record.athleteId}/${record.skillId}/${record.id}`),
}
