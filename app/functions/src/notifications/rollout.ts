export type NotificationRollout =
  | {
    mode: 'disabled'
    reason: 'MODE_DISABLED' | 'INVALID_CONFIGURATION' | 'PRODUCTION_BLOCKED'
  }
  | {
    mode: 'qa'
    athleteId: string
  }

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

const ATHLETE_ID_PATTERN = /^[\w-]{1,128}$/

export function resolveNotificationRollout(
  environment: RuntimeEnvironment,
): NotificationRollout {
  const requestedMode = environment.KRONOS_NOTIFICATION_ROLLOUT_MODE ?? ''

  if (requestedMode === '' || requestedMode === 'disabled')
    return { mode: 'disabled', reason: 'MODE_DISABLED' }

  if (requestedMode === 'production')
    return { mode: 'disabled', reason: 'PRODUCTION_BLOCKED' }

  const athleteId = environment.KRONOS_NOTIFICATION_QA_ATHLETE_ID ?? ''
  if (requestedMode === 'qa' && ATHLETE_ID_PATTERN.test(athleteId))
    return { mode: 'qa', athleteId }

  return { mode: 'disabled', reason: 'INVALID_CONFIGURATION' }
}

export function isNotificationAthleteAllowed(
  rollout: NotificationRollout,
  athleteId: string,
): boolean {
  return rollout.mode === 'qa'
    && ATHLETE_ID_PATTERN.test(athleteId)
    && athleteId === rollout.athleteId
}
