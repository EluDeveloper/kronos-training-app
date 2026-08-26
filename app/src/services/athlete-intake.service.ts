import type { AthleteIntake } from '@/types/domain'
import type { AthleteIntakePayload } from '@/utils/athlete-intake'
import { serverTimestamp, setEntity, subscribeValue, updateEntity, type ErrorHandler } from './realtime.service'

export const athleteIntakeService = {
  subscribe: (athleteId: string, onChange: (value: AthleteIntake | null) => void, onError: ErrorHandler) => subscribeValue<AthleteIntake>(`athleteIntake/${athleteId}`, onChange, onError),
  create: (intake: AthleteIntakePayload) => setEntity(`athleteIntake/${intake.athleteId}`, {
    ...intake,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
  update: (athleteId: string, intake: Omit<AthleteIntakePayload, 'athleteId'>) => updateEntity(`athleteIntake/${athleteId}`, intake as unknown as Record<string, unknown>),
}
