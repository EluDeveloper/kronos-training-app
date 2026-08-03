import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { performanceService, type NewPerformanceRecord } from '@/services/performance.service'
import { skillsService } from '@/services/skills.service'
import type { PerformanceRecord, Skill } from '@/types/domain'

export const usePerformanceStore = defineStore('performance', () => {
  const records = ref<PerformanceRecord[]>([])
  const skills = ref<Skill[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stopRecords: Unsubscribe | null = null
  let stopSkills: Unsubscribe | null = null

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
  const remove = (record: PerformanceRecord) => performanceService.delete(record)
  const createSkill = (name: string) => skillsService.create(name)
  const dispose = () => { stopRecords?.(); stopSkills?.(); stopRecords = null; stopSkills = null }

  return { records, skills, loading, error, subscribe, create, remove, createSkill, dispose }
})
