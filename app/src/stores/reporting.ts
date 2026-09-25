import type { Unsubscribe } from 'firebase/database'
import type { AppUser } from '@/types/access'
import type { ReportingDataset } from '@/services/reporting.service'
import type { ReportingSource } from '@/services/reporting-access'
import { reportingFirebaseService } from '@/services/reporting.firebase'
import { reportingSourcesFor } from '@/services/reporting-access'
import { resolveReportingLoadState } from '@/utils/reporting-load-state'

export type { ReportingLoadState } from '@/utils/reporting-load-state'

export const useReportingStore = defineStore('reporting', () => {
  const emptyDataset = (): ReportingDataset => ({ athletes: [], visits: [], sales: [], payments: [], inventoryClosures: [], inventoryResolutions: [], workEntries: [], payrollSettlements: [], visitPayments: [], expenses: [], cashClosures: [], sources: [], loadedSources: [] })
  const dataset = ref<ReportingDataset>(emptyDataset())
  const loading = ref(false)
  const loadedSources = ref<ReportingSource[]>([])
  const errors = ref<Partial<Record<ReportingSource, string>>>({})
  let stop: Unsubscribe | null = null

  const state = computed(() => resolveReportingLoadState({
    sources: dataset.value.sources,
    loadedSources: loadedSources.value,
    errors: Object.keys(errors.value) as ReportingSource[],
    isLoading: loading.value,
    hasAnyData: Boolean(dataset.value.athletes.length || dataset.value.visits.length || dataset.value.sales.length || dataset.value.payments.length || dataset.value.inventoryClosures.length || dataset.value.inventoryResolutions.length || dataset.value.workEntries.length || dataset.value.payrollSettlements.length || dataset.value.visitPayments.length || dataset.value.expenses.length || dataset.value.cashClosures.length),
  }))

  function connect(user: AppUser | null) {
    disconnect()
    errors.value = {}
    loadedSources.value = []
    dataset.value = emptyDataset()
    loading.value = true

    try {
      stop = reportingFirebaseService.subscribe(user, value => {
        dataset.value = value
        loadedSources.value = value.loadedSources
        loading.value = false
      }, (source, error) => {
        errors.value = { ...errors.value, [source]: error.message }
        loading.value = false
      })
      loading.value = false
    }
    catch (error) {
      errors.value = { athletes: error instanceof Error ? error.message : 'No fue posible consultar los datos.' }
      dataset.value.sources = reportingSourcesFor(user).filter(source => source === 'athletes' || source === 'visits' || source === 'store')
      loading.value = false
    }
  }

  function disconnect() {
    stop?.()
    stop = null
  }

  return { dataset, loading, loadedSources, errors, state, connect, disconnect }
})
