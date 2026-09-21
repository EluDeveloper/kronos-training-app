import { limitToLast, onValue, orderByChild, query, ref } from 'firebase/database'
import { BUSINESS_ROOT } from '@/firebase/database'
import type { NotificationStatusSubscribe } from '@/utils/notification-status'
import { requireDatabase } from './realtime.service'

const subscribe: NotificationStatusSubscribe = (athleteId, onData, onError) => {
  if (!/^[\w-]{1,128}$/.test(athleteId))
    throw new Error('Invalid athlete id')

  return onValue(query(
    ref(requireDatabase(), `${BUSINESS_ROOT}/notificationStatus/${athleteId}`),
    orderByChild('updatedAt'), limitToLast(20),
  ), snapshot => onData(snapshot.val()), onError)
}

export const notificationStatusService = { subscribe }
