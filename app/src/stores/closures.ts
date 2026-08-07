import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { closuresService, type CashClosureInput, type InventoryClosureInput } from '@/services/closures.service'
import type { CashClosure, InventoryClosure } from '@/types/domain'

export const useClosuresStore = defineStore('closures', () => {
  const cash = ref<CashClosure[]>([])
  const inventory = ref<InventoryClosure[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stopCash: Unsubscribe | null = null
  let stopInventory: Unsubscribe | null = null

  function subscribe() {
    if (stopCash || stopInventory)
      return

    loading.value = true
    error.value = null
    let cashLoaded = false
    let inventoryLoaded = false
    const finish = () => {
      loading.value = !(cashLoaded && inventoryLoaded)
    }
    const fail = (subscriptionError: Error) => {
      error.value = subscriptionError.message
      loading.value = false
    }

    stopCash = closuresService.subscribeCash(items => {
      cash.value = items.sort((left, right) => right.date.localeCompare(left.date))
      cashLoaded = true
      finish()
    }, fail)
    stopInventory = closuresService.subscribeInventory(items => {
      inventory.value = items.sort((left, right) => right.weekStart.localeCompare(left.weekStart))
      inventoryLoaded = true
      finish()
    }, fail)
  }

  const saveCash = (closure: CashClosureInput) => closuresService.saveCash(closure)
  const saveInventory = (closure: InventoryClosureInput) => closuresService.saveInventory(closure)

  function dispose() {
    stopCash?.()
    stopInventory?.()
    stopCash = null
    stopInventory = null
  }

  return { cash, inventory, loading, error, subscribe, saveCash, saveInventory, dispose }
})
