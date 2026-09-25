import type { AthleteLifecycleEvent, AthleteStatus } from '@/types/domain'
import type { ReportingAthleteSource, ReportingFilters, ReportingMetric } from '@/types/reporting'
import { dateForBusinessTimeZone } from './reporting-periods'

export interface AthleteReport {
  summary: {
    active: ReportingMetric
    paused: ReportingMetric
    inactive: ReportingMetric
    enrollments: ReportingMetric
    pauses: ReportingMetric
    exits: ReportingMetric
    reactivations: ReportingMetric
    retention: ReportingMetric<number>
    events: ReportingMetric<number>
  }
  rows: Array<{ athleteId: string; effectiveDate: string; type: AthleteLifecycleEvent['type']; fromStatus: AthleteStatus | null; toStatus: AthleteStatus }>
  statusRows: Array<{ athleteId: string; status: AthleteStatus; quality: ReportingMetric['quality'] }>
}

export interface AthleteTimelinePoint {
  bucket: string
  enrollments: number
  pauses: number
  exits: number
  reactivations: number
  events: number
}

const metric = (key: ReportingMetric['key'], value: number | null, quality: ReportingMetric['quality'], sourceCount: number, note?: string): ReportingMetric => ({
  key, value, quality, sourceCount, ...(note ? { note } : {}),
})

const timestampValue = (value: string | number) => typeof value === 'number' ? value : Date.parse(value)

export function buildAthleteTimeline(rows: AthleteReport['rows'], granularity: 'day' | 'month' | 'year'): AthleteTimelinePoint[] {
  const points = new Map<string, AthleteTimelinePoint>()

  for (const row of rows) {
    const bucket = granularity === 'day' ? row.effectiveDate : granularity === 'month' ? row.effectiveDate.slice(0, 7) : row.effectiveDate.slice(0, 4)
    const point = points.get(bucket) ?? { bucket, enrollments: 0, pauses: 0, exits: 0, reactivations: 0, events: 0 }

    point.events += 1
    if (row.type === 'created') point.enrollments += 1
    if (row.type === 'paused') point.pauses += 1
    if (row.type === 'inactive') point.exits += 1
    if (row.type === 'reactivated') point.reactivations += 1
    points.set(bucket, point)
  }

  return [...points.values()].sort((left, right) => left.bucket.localeCompare(right.bucket))
}

export function buildAthleteReport(athletes: ReportingAthleteSource[], filters: ReportingFilters): AthleteReport {
  const statusAtCutoff = (athlete: ReportingAthleteSource) => {
    const history = Object.values(athlete.lifecycleEvents ?? {})
      .filter(event => event.effectiveDate <= filters.through)
      .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate) || timestampValue(left.createdAt) - timestampValue(right.createdAt))

    return history.length ? history.at(-1)!.toStatus : athlete.status
  }

  const selectedAthletes = athletes.filter(athlete => (!filters.athleteId || athlete.id === filters.athleteId)
    && (!filters.athleteStatus || statusAtCutoff(athlete) === filters.athleteStatus))

  const allEvents = selectedAthletes.flatMap(athlete => Object.values(athlete.lifecycleEvents ?? {}).map(event => ({ athlete, event })))
  const periodEvents = allEvents.filter(({ event }) => event.effectiveDate >= filters.from && event.effectiveDate <= filters.through)
  const legacyCount = selectedAthletes.filter(athlete => !Object.values(athlete.lifecycleEvents ?? {}).length || athlete.migrationNeedsReview).length
  const count = (type: AthleteLifecycleEvent['type']) => periodEvents.filter(({ event }) => event.type === type).length

  const statusCounts = (status: AthleteStatus) => selectedAthletes.filter(athlete => statusAtCutoff(athlete) === status).length

  const eventQuality = legacyCount ? 'partial-history' : 'exact'

  const rows = periodEvents.map(({ athlete, event }) => ({
    athleteId: athlete.id,
    effectiveDate: event.effectiveDate,
    type: event.type,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
  })).sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate) || left.athleteId.localeCompare(right.athleteId))

  return {
    summary: {
      active: metric('athletesActive', legacyCount ? null : statusCounts('active'), legacyCount ? 'partial-history' : 'exact', selectedAthletes.length, legacyCount ? 'El estado histórico puede estar incompleto para registros legados.' : undefined),
      paused: metric('athletesPaused', legacyCount ? null : statusCounts('paused'), legacyCount ? 'partial-history' : 'exact', selectedAthletes.length, legacyCount ? 'El estado histórico puede estar incompleto para registros legados.' : undefined),
      inactive: metric('athletesInactive', legacyCount ? null : statusCounts('inactive'), legacyCount ? 'partial-history' : 'exact', selectedAthletes.length, legacyCount ? 'El estado histórico puede estar incompleto para registros legados.' : undefined),
      enrollments: metric('athleteEnrollments', count('created') + selectedAthletes.filter(athlete => !Object.values(athlete.lifecycleEvents ?? {}).some(event => event.type === 'created') && between(dateForBusinessTimeZone(athlete.createdAt), filters)).length, eventQuality, periodEvents.length, legacyCount ? 'Las altas de legado usan createdAt y el histórico de transiciones es parcial.' : undefined),
      pauses: metric('athletePauses', count('paused'), eventQuality, periodEvents.length),
      exits: metric('athleteExits', count('inactive'), eventQuality, periodEvents.length),
      reactivations: metric('athleteReactivations', count('reactivated'), eventQuality, periodEvents.length),
      retention: metric('athleteRetention', null, 'unavailable', 0, 'No hay una cohorte y ventana de observación suficientes para calcular retención.'),
      events: metric('athleteEnrollments', periodEvents.length, eventQuality, periodEvents.length),
    },
    rows,
    statusRows: selectedAthletes.map(athlete => ({
      athleteId: athlete.id,
      status: statusAtCutoff(athlete),
      quality: !Object.values(athlete.lifecycleEvents ?? {}).length || athlete.migrationNeedsReview ? 'partial-history' : 'exact',
    })),
  }
}

const between = (date: string, filters: ReportingFilters) => date >= filters.from && date <= filters.through
