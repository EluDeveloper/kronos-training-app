import { onValue, ref, serverTimestamp, set, type Unsubscribe } from 'firebase/database'
import { BUSINESS_ROOT } from '@/firebase/database'
import type { NotificationConsent } from '@/utils/payment-notification'
import { parseNotificationConsent } from '@/utils/payment-notification'
import { requireDatabase } from './realtime.service'

const preferencePath = (athleteId: string) => `${BUSINESS_ROOT}/notificationPreferences/${athleteId}`

export const notificationPreferencesService = {
  subscribe(athleteId: string, onChange: (preference: NotificationConsent | null) => void, onError: (error: Error) => void): Unsubscribe {
    return onValue(
      ref(requireDatabase(), preferencePath(athleteId)),
      snapshot => onChange(snapshot.exists() ? parseNotificationConsent(snapshot.val(), athleteId) : null),
      error => onError(error),
    )
  },

  async save(preference: NotificationConsent) {
    if (!preference.athleteId.trim())
      throw new Error('El atleta es obligatorio.')

    await set(ref(requireDatabase(), preferencePath(preference.athleteId)), {
      athleteId: preference.athleteId,
      receiptStatus: preference.receiptStatus,
      reminderStatus: preference.reminderStatus,
      consentedPhoneE164: preference.consentedPhoneE164,
      consentedAt: preference.consentedAt,
      consentSource: preference.consentSource,
      recordedBy: preference.recordedBy,
      optedOutAt: preference.optedOutAt,
      optOutSource: preference.optOutSource,
      createdAt: preference.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: preference.updatedBy,
    })
  },
}
