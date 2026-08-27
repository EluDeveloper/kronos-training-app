import { get, ref, serverTimestamp, set } from 'firebase/database'
import type { KioskPaymentNowMode, KioskSettings } from '@/types/domain'
import { parseKioskSettings } from '@/utils/store-kiosk'
import { businessPath, requireDatabase, subscribeValue, type ErrorHandler } from './realtime.service'

export interface KioskSettingsInput {
  paymentNowMode: KioskPaymentNowMode
  paymentNowUserIds?: Record<string, true> | null
}

function payload(input: KioskSettingsInput, updatedBy: string) {
  if (!updatedBy)
    throw new Error('No fue posible identificar al Admin que cambia la configuración.')

  if (input.paymentNowMode !== 'disabled'
    && input.paymentNowMode !== 'all-admins'
    && input.paymentNowMode !== 'selected-admins')
    throw new Error('La modalidad de Pagar ahora no es válida.')

  const selectedIds = Object.entries(input.paymentNowUserIds ?? {})
    .filter(([uid, allowed]) => Boolean(uid) && allowed === true)

  if (input.paymentNowMode === 'selected-admins' && !selectedIds.length)
    throw new Error('Selecciona al menos un Admin para habilitar Pagar ahora.')

  return {
    paymentNowMode: input.paymentNowMode,
    ...(input.paymentNowMode === 'selected-admins'
      ? { paymentNowUserIds: Object.fromEntries(selectedIds) as Record<string, true> }
      : {}),
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
