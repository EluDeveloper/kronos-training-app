import type { Workout } from '@/types/domain'
import { deleteEntity, serverTimestamp, setEntity, subscribeCollection, type ErrorHandler } from './realtime.service'

export type NewWorkout = Omit<Workout, 'id' | 'createdAt' | 'updatedAt'>

export const workoutsService = {
  subscribe: (onChange: (items: Workout[]) => void, onError: ErrorHandler) => subscribeCollection<Workout>('workouts', onChange, onError),
  save: (workout: NewWorkout) => setEntity(`workouts/${workout.date}`, {
    ...workout,
    id: workout.date,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
  delete: (date: string) => deleteEntity(`workouts/${date}`),
}
