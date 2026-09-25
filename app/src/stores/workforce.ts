import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { workforceService } from '@/services/workforce.service'
import type { Employee, PayrollSettlement, WorkEntry } from '@/types/workforce'

export const useWorkforceStore = defineStore('workforce', () => {
  const employees = ref<Employee[]>([])
  const entries = ref<WorkEntry[]>([])
  const settlements = ref<PayrollSettlement[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stops: Unsubscribe[] = []

  function subscribe() {
    if (stops.length)
      return
    loading.value = true

    const fail = (cause: Error) => { error.value = cause.message; loading.value = false }

    stops = [
      workforceService.subscribeEmployees(value => { employees.value = value.sort((a, b) => a.name.localeCompare(b.name, 'es')); loading.value = false }, fail),
      workforceService.subscribeEntries(value => { entries.value = value.sort((a, b) => b.date.localeCompare(a.date)) }, fail),
      workforceService.subscribeSettlements(value => { settlements.value = value.sort((a, b) => b.paidAt.localeCompare(a.paidAt)) }, fail),
    ]
  }

  const dispose = () => { stops.forEach(stop => stop()); stops = [] }

  return {
    employees, entries, settlements, loading, error, subscribe, dispose,
    saveEmployee: workforceService.saveEmployee,
    createWorkEntry: workforceService.createWorkEntry,
    approveWorkEntry: workforceService.approveWorkEntry,
    settle: workforceService.settle,
  }
})
