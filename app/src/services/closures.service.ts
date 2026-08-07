import { get, ref, serverTimestamp, set } from 'firebase/database'
import type { CashClosure, InventoryClosure } from '@/types/domain'
import { businessPath, requireDatabase, subscribeCollection, type ErrorHandler } from './realtime.service'

export type CashClosureInput = Omit<CashClosure, 'id' | 'createdAt' | 'updatedAt'>
export type InventoryClosureInput = Omit<InventoryClosure, 'id' | 'createdAt' | 'updatedAt'>

async function saveDatedClosure(path: string, id: string, payload: Record<string, unknown>) {
  const entityRef = ref(requireDatabase(), businessPath(`${path}/${id}`))
  const snapshot = await get(entityRef)

  await set(entityRef, {
    ...payload,
    id,
    createdAt: snapshot.child('createdAt').val() ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return id
}

export const closuresService = {
  subscribeCash: (onChange: (items: CashClosure[]) => void, onError: ErrorHandler) => subscribeCollection<CashClosure>('cashClosures', onChange, onError),
  subscribeInventory: (onChange: (items: InventoryClosure[]) => void, onError: ErrorHandler) => subscribeCollection<InventoryClosure>('inventoryClosures', onChange, onError),
  saveCash: (closure: CashClosureInput) => saveDatedClosure('cashClosures', closure.date, closure as unknown as Record<string, unknown>),
  saveInventory: (closure: InventoryClosureInput) => saveDatedClosure('inventoryClosures', closure.weekStart, closure as unknown as Record<string, unknown>),
}
