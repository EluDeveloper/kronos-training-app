import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously, type User } from 'firebase/auth'
import { firebaseApp } from './config'

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null

export async function ensureAnonymousUser(): Promise<User | null> {
  if (!firebaseAuth)
    return null

  await setPersistence(firebaseAuth, browserLocalPersistence)

  if (firebaseAuth.currentUser)
    return firebaseAuth.currentUser

  const credential = await signInAnonymously(firebaseAuth)

  return credential.user
}
