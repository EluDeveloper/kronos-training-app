import type { ReportingSource } from '@/services/reporting-access'

export type ReportingLoadState = 'idle' | 'loading' | 'ready' | 'partial' | 'empty' | 'error' | 'unavailable'

export function resolveReportingLoadState(input: {
  sources: ReportingSource[]
  loadedSources?: ReportingSource[]
  errors?: ReportingSource[]
  isLoading?: boolean
  hasAnyData: boolean
}): ReportingLoadState {
  const loadedSources = input.loadedSources ?? []
  const errors = input.errors ?? []

  if (!input.sources.length)
    return 'unavailable'
  if (input.isLoading)
    return 'loading'
  if (errors.length && !loadedSources.length)
    return 'error'
  if (errors.length)
    return 'partial'
  if (loadedSources.length < input.sources.length)
    return 'loading'

  return input.hasAnyData ? 'ready' : 'empty'
}
