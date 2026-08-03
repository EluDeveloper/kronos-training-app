import { getDatabase, onValue, ref, type Database, type Unsubscribe } from 'firebase/database'
import type { AuthorizedDevice } from '@/types/domain'
import { firebaseApp } from './config'

export const firebaseDatabase: Database | null = firebaseApp ? getDatabase(firebaseApp) : null
export const BUSINESS_ROOT = 'v1'

export function subscribeToConnection(callback: (connected: boolean) => void): Unsubscribe {
  if (!firebaseDatabase) {
    callback(false)

    return () => undefined
  }

  return onValue(ref(firebaseDatabase, '.info/connected'), snapshot => callback(snapshot.val() === true))
}

export function subscribeToDeviceAuthorization(
  uid: string,
  onChange: (device: AuthorizedDevice | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!firebaseDatabase) {
    onChange(null)

    return () => undefined
  }

  return onValue(
    ref(firebaseDatabase, `${BUSINESS_ROOT}/authorizedDevices/${uid}`),
    snapshot => onChange(snapshot.exists() ? snapshot.val() as AuthorizedDevice : null),
    error => onError(error),
  )
}
