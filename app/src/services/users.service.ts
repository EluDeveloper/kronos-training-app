import { get, onValue, ref, serverTimestamp, set, update, type Unsubscribe } from 'firebase/database'
import { createManagedPasswordUser } from '@/firebase/auth'
import { BUSINESS_ROOT } from '@/firebase/database'
import { normalizePermissions, type AppUser, type AuthConfiguration, type UserPermissions, type UserRole } from '@/types/access'
import { requireDatabase } from './realtime.service'

export interface ManagedUserInput {
  displayName: string
  email: string
  role: UserRole
  enabled: boolean
  permissions: UserPermissions
}

const profilePayload = (uid: string, input: ManagedUserInput, createdBy: string, mustChangePassword: boolean) => ({
  uid,
  displayName: input.displayName.trim(),
  email: input.email.trim().toLocaleLowerCase('es'),
  role: input.role,
  enabled: input.enabled,
  permissions: input.role === 'admin' ? null : normalizePermissions(input.permissions),
  mustChangePassword,
  createdBy,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

export const usersService = {
  async getProfile(uid: string) {
    const snapshot = await get(ref(requireDatabase(), `${BUSINESS_ROOT}/users/${uid}`))

    return snapshot.exists() ? snapshot.val() as AppUser : null
  },

  subscribeAuthConfiguration(onChange: (configuration: AuthConfiguration | null) => void, onError: (error: Error) => void): Unsubscribe {
    return onValue(
      ref(requireDatabase(), `${BUSINESS_ROOT}/authConfig`),
      snapshot => onChange(snapshot.exists() ? snapshot.val() as AuthConfiguration : null),
      error => onError(error),
    )
  },

  subscribeProfile(uid: string, onChange: (profile: AppUser | null) => void, onError: (error: Error) => void): Unsubscribe {
    return onValue(
      ref(requireDatabase(), `${BUSINESS_ROOT}/users/${uid}`),
      snapshot => onChange(snapshot.exists() ? snapshot.val() as AppUser : null),
      error => onError(error),
    )
  },

  subscribeAll(onChange: (users: AppUser[]) => void, onError: (error: Error) => void): Unsubscribe {
    return onValue(
      ref(requireDatabase(), `${BUSINESS_ROOT}/users`),
      snapshot => {
        const value = snapshot.val() as Record<string, AppUser> | null

        onChange(value ? Object.entries(value).map(([uid, user]) => ({ ...user, uid })) : [])
      },
      error => onError(error),
    )
  },

  async bootstrapAdmin(input: Omit<ManagedUserInput, 'role' | 'enabled' | 'permissions'>, password: string, authorizedDeviceUid: string) {
    return createManagedPasswordUser(input.email, password, input.displayName, async user => {
      const database = requireDatabase()

      const updates = {
        [`users/${user.uid}`]: profilePayload(user.uid, { ...input, role: 'admin', enabled: true, permissions: {} }, authorizedDeviceUid, false),
        'authConfig/initialized': true,
        'authConfig/initializedAt': serverTimestamp(),
      }

      await update(ref(database, BUSINESS_ROOT), updates)

      return user.uid
    })
  },

  async create(input: ManagedUserInput, password: string, createdBy: string) {
    return createManagedPasswordUser(input.email, password, input.displayName, async user => {
      await update(ref(requireDatabase(), `${BUSINESS_ROOT}/users/${user.uid}`), profilePayload(user.uid, input, createdBy, true))

      return user.uid
    })
  },

  async update(uid: string, input: Pick<ManagedUserInput, 'displayName' | 'role' | 'enabled' | 'permissions'>) {
    await update(ref(requireDatabase(), `${BUSINESS_ROOT}/users/${uid}`), {
      displayName: input.displayName.trim(),
      role: input.role,
      enabled: input.enabled,
      permissions: input.role === 'admin' ? null : normalizePermissions(input.permissions),
      updatedAt: serverTimestamp(),
    })
  },

  async completePasswordChange(uid: string) {
    await set(ref(requireDatabase(), `${BUSINESS_ROOT}/users/${uid}/mustChangePassword`), false)
  },
}
