import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { subscribeCollection } from '@/services/realtime.service'
import type { InventoryResolution } from '@/types/domain'

export const useInventoryRecoveriesStore = defineStore('inventory-recoveries', () => {
  const items = ref<InventoryResolution[]>([])
  let stop: Unsubscribe | null = null
  function subscribe() {
    if (stop) return
    stop = subscribeCollection<InventoryResolution>('inventoryRecoveries', value => { items.value = value }, () => { items.value = [] })
  }
  const dispose = () => { stop?.(); stop = null }

  return { items, subscribe, dispose }
})
