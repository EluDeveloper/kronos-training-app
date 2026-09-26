import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { performanceService, type NewCoachPerformanceRecord, type NewPerformanceRecord, type PerformanceRecordUpdate } from '@/services/performance.service'
import { skillsService } from '@/services/skills.service'
import type { CoachPerformanceRecord, PerformanceRecord, Skill } from '@/types/domain'
import type { CoachDirectoryEntry } from '@/types/workforce'

export const usePerformanceStore = defineStore('performance', () => {
  const records = ref<PerformanceRecord[]>([])
  const coachRecords = ref<CoachPerformanceRecord[]>([])
  const coaches = ref<CoachDirectoryEntry[]>([])
  const skills = ref<Skill[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stopRecords: Unsubscribe | null = null
  let stopSkills: Unsubscribe | null = null
  let stopCoachRecords: Unsubscribe | null = null
  let stopCoaches: Unsubscribe | null = null

  function subscribe() {
    if (stopRecords || stopSkills)
      return
    loading.value = true
    stopRecords = performanceService.subscribe(value => {
      records.value = value
      loading.value = false
    }, handleError)
    stopSkills = skillsService.subscribe(value => { skills.value = value }, handleError)
  }

  function handleError(subscriptionError: Error) {
    error.value = subscriptionError.message
    loading.value = false
  }

  const create = (record: NewPerformanceRecord) => performanceService.create(record)
  const createCoach = (record: NewCoachPerformanceRecord) => performanceService.createCoach(record)
  const update = (record: PerformanceRecord, data: PerformanceRecordUpdate) => performanceService.update(record, data)
  const updateCoach = (record: CoachPerformanceRecord, data: PerformanceRecordUpdate) => performanceService.updateCoach(record, data)
  const remove = (record: PerformanceRecord) => performanceService.delete(record)
  const removeCoach = (record: CoachPerformanceRecord) => performanceService.deleteCoach(record)
  const createSkill = (name: string) => skillsService.create(name)
  function subscribeCoaches() {
    if (stopCoaches || stopCoachRecords) return
    stopCoaches = performanceService.subscribeCoaches(value => { coaches.value = value }, handleError)
    stopCoachRecords = performanceService.subscribeCoachRecords(value => { coachRecords.value = value }, handleError)
  }
  const dispose = () => { stopRecords?.(); stopSkills?.(); stopCoaches?.(); stopCoachRecords?.(); stopRecords = null; stopSkills = null; stopCoaches = null; stopCoachRecords = null }

  return { records, coachRecords, coaches, skills, loading, error, subscribe, subscribeCoaches, create, createCoach, update, updateCoach, remove, removeCoach, createSkill, dispose }
})
