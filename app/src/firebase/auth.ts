import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth'
import { deleteApp, initializeApp } from 'firebase/app'
import { firebaseApp, firebaseOptions } from './config'

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null

export function authErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''

  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
    'auth/invalid-email': 'Captura un correo electrónico válido.',
    'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
    'auth/operation-not-allowed': 'Habilita el acceso por correo y contraseña en Firebase Authentication.',
    'auth/too-many-requests': 'Firebase bloqueó temporalmente los intentos. Espera unos minutos.',
    'auth/user-disabled': 'Esta cuenta está deshabilitada en Firebase Authentication.',
    'auth/user-not-found': 'El correo o la contraseña no son correctos.',
    'auth/weak-password': 'La contraseña no cumple la política de seguridad configurada.',
    'auth/wrong-password': 'El correo o la contraseña no son correctos.',
    'auth/requires-recent-login': 'Vuelve a iniciar sesión antes de cambiar la contraseña.',
  }

  return messages[code] ?? (error instanceof Error ? error.message : 'Firebase no pudo completar la operación.')
}

export async function configureAuthPersistence() {
  if (!firebaseAuth)
    return

  await setPersistence(firebaseAuth, browserLocalPersistence)
}

export function observeAuthState(callback: (user: User | null) => void) {
  if (!firebaseAuth) {
    callback(null)

    return () => undefined
  }

  return onAuthStateChanged(firebaseAuth, callback)
}

export async function signInWithPassword(email: string, password: string) {
  if (!firebaseAuth)
    throw new Error('Firebase no está configurado.')

  return signInWithEmailAndPassword(firebaseAuth, email.trim().toLocaleLowerCase('es'), password)
}

export async function startAnonymousSession(): Promise<User> {
  if (!firebaseAuth)
    throw new Error('Firebase no está configurado.')

  if (firebaseAuth.currentUser?.isAnonymous)
    return firebaseAuth.currentUser

  const credential = await signInAnonymously(firebaseAuth)

  return credential.user
}

export async function signOutCurrentUser() {
  if (firebaseAuth)
    await signOut(firebaseAuth)
}

export async function requestPasswordReset(email: string) {
  if (!firebaseAuth)
    throw new Error('Firebase no está configurado.')

  await sendPasswordResetEmail(firebaseAuth, email.trim().toLocaleLowerCase('es'))
}

export async function changeCurrentPassword(password: string) {
  if (!firebaseAuth?.currentUser || firebaseAuth.currentUser.isAnonymous)
    throw new Error('No hay una cuenta activa para cambiar la contraseña.')

  await updatePassword(firebaseAuth.currentUser, password)
}

export async function createManagedPasswordUser<T>(
  email: string,
  password: string,
  displayName: string,
  onCreated: (user: User) => Promise<T>,
): Promise<T> {
  const appName = `kronos-user-creation-${crypto.randomUUID()}`
  const secondaryApp = initializeApp(firebaseOptions, appName)
  const secondaryAuth = getAuth(secondaryApp)
  let createdUser: User | null = null

  try {
    await setPersistence(secondaryAuth, inMemoryPersistence)

    const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim().toLocaleLowerCase('es'), password)

    createdUser = credential.user
    await updateProfile(createdUser, { displayName: displayName.trim() })

    return await onCreated(createdUser)
  }
  catch (error) {
    if (createdUser) {
      try {
        await deleteUser(createdUser)
      }
      catch {
        // La cuenta huérfana podrá deshabilitarse desde Firebase Console.
      }
    }

    throw error
  }
  finally {
    await deleteApp(secondaryApp)
  }
}
