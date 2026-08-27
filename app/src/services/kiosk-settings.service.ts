import { get, ref, serverTimestamp, set } from 'firebase/database'
import type { KioskPaymentNowMode, KioskSettings } from '@/types/domain'
import { parseKioskSettings } from '@/utils/store-kiosk'
import { businessPath, requireDatabase, subscribeValue, type ErrorHandler } from './realtime.service'

export interface KioskSettingsInput {
  paymentNowMode: KioskPaymentNowMode
  paymentNowUserIds?: Record<string, true> | null
}

function payload(input: KioskSettingsInput, updatedBy: string) {
  return {
    paymentNowMode: input.paymentNowMode,
    ...(input.paymentNowMode === 'selected-admins' ? { paymentNowUserIds: input.paymentNowUserIds ?? {} } : {}),
    updatedBy,
    updatedAt: serverTimestamp(),
  }
}

export const kioskSettingsService = {
  subscribe(onChange: (settings: KioskSettings | null) => void, onError: ErrorHandler) {
    return subscribeValue<unknown>('settings/kiosk', value => onChange(parseKioskSettings(value)), onError)
  },

  async get() {
    const snapshot = await get(ref(requireDatabase(), businessPath('settings/kiosk')))

    return parseKioskSettings(snapshot.exists() ? snapshot.val() : null)
  },

  async save(input: KioskSettingsInput, updatedBy: string) {
    await set(ref(requireDatabase(), businessPath('settings/kiosk')), payload(input, updatedBy))
  },
}
