import type { CoachPerformanceRecord, PerformanceRecord } from '@/types/domain'
import type { CoachDirectoryEntry } from '@/types/workforce'
import { createEntity, deleteEntity, subscribeValue, updateEntity, type ErrorHandler } from './realtime.service'

type PerformanceTree = Record<string, Record<string, Record<string, Omit<PerformanceRecord, 'id' | 'athleteId' | 'skillId'>>>>
export type NewPerformanceRecord = Omit<PerformanceRecord, 'id'>
export type PerformanceRecordUpdate = Pick<PerformanceRecord, 'type' | 'valueLbs' | 'valueKg' | 'recordedAt'>
type CoachPerformanceTree = Record<string, Record<string, Record<string, Omit<CoachPerformanceRecord, 'id' | 'employeeId' | 'skillId'>>>>
export type NewCoachPerformanceRecord = Omit<CoachPerformanceRecord, 'id'>

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
  subscribeCoaches(onChange: (items: CoachDirectoryEntry[]) => void, onError: ErrorHandler) {
    return subscribeValue<Record<string, CoachDirectoryEntry>>('coachDirectory', tree => onChange(Object.values(tree ?? {})), onError)
  },
  subscribeCoachRecords(onChange: (items: CoachPerformanceRecord[]) => void, onError: ErrorHandler) {
    return subscribeValue<CoachPerformanceTree>('coachPerformance', tree => {
      onChange(Object.entries(tree ?? {}).flatMap(([employeeId, skills]) =>
        Object.entries(skills ?? {}).flatMap(([skillId, entries]) =>
          Object.entries(entries ?? {}).map(([id, record]) => ({ ...record, id, employeeId, skillId } as CoachPerformanceRecord)),
        ),
      ))
    }, onError)
  },
  createCoach(record: NewCoachPerformanceRecord) {
    const { employeeId, skillId, ...data } = record

    return createEntity(`coachPerformance/${employeeId}/${skillId}`, data as unknown as Record<string, unknown>)
  },
  updateCoach(record: CoachPerformanceRecord, data: PerformanceRecordUpdate) {
    return updateEntity(`coachPerformance/${record.employeeId}/${record.skillId}/${record.id}`, data as unknown as Record<string, unknown>)
  },
  deleteCoach: (record: CoachPerformanceRecord) => deleteEntity(`coachPerformance/${record.employeeId}/${record.skillId}/${record.id}`),
  create(record: NewPerformanceRecord) {
    const { athleteId, skillId, ...data } = record

    return createEntity(`performance/${athleteId}/${skillId}`, data as unknown as Record<string, unknown>)
  },
  update(record: PerformanceRecord, data: PerformanceRecordUpdate) {
    return updateEntity(`performance/${record.athleteId}/${record.skillId}/${record.id}`, data as unknown as Record<string, unknown>)
  },
  delete: (record: PerformanceRecord) => deleteEntity(`performance/${record.athleteId}/${record.skillId}/${record.id}`),
}
