import {
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  type Database,
  type Unsubscribe,
} from 'firebase/database'
import { BUSINESS_ROOT, firebaseDatabase } from '@/firebase/database'

export type ErrorHandler = (error: Error) => void

export function requireDatabase(): Database {
  if (!firebaseDatabase)
    throw new Error('Firebase no está configurado.')

  return firebaseDatabase
}

export const businessPath = (path: string) => `${BUSINESS_ROOT}/${path}`

export function subscribeCollection<T extends { id: string }>(
  path: string,
  onChange: (items: T[]) => void,
  onError: ErrorHandler,
): Unsubscribe {
  const database = requireDatabase()

  return onValue(
    ref(database, businessPath(path)),
    snapshot => {
      const value = snapshot.val() as Record<string, Omit<T, 'id'>> | null
      const items = value
        ? Object.entries(value).map(([id, item]) => ({ ...item, id }) as T)
        : []

      onChange(items)
    },
    error => onError(error),
  )
}

export function subscribeValue<T>(path: string, onChange: (value: T | null) => void, onError: ErrorHandler): Unsubscribe {
  const database = requireDatabase()

  return onValue(
    ref(database, businessPath(path)),
    snapshot => onChange(snapshot.exists() ? snapshot.val() as T : null),
    error => onError(error),
  )
}

export async function createEntity(path: string, data: Record<string, unknown>) {
  const database = requireDatabase()
  const entityRef = push(ref(database, businessPath(path)))

  if (!entityRef.key)
    throw new Error('Firebase no pudo generar el identificador.')

  await set(entityRef, {
    ...data,
    id: entityRef.key,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return entityRef.key
}

export async function setEntity(path: string, data: Record<string, unknown>) {
  await set(ref(requireDatabase(), businessPath(path)), data)
}

export async function updateEntity(path: string, data: Record<string, unknown>) {
  await update(ref(requireDatabase(), businessPath(path)), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteEntity(path: string) {
  await remove(ref(requireDatabase(), businessPath(path)))
}

export { serverTimestamp }
