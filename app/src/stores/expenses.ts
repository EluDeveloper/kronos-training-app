import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { expensesService, type NewExpense } from '@/services/expenses.service'
import type { Expense } from '@/types/domain'

export const useExpensesStore = defineStore('expenses', () => {
  const items = ref<Expense[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  function subscribe() {
    if (stop)
      return
    loading.value = true
    stop = expensesService.subscribe(value => {
      items.value = value
      loading.value = false
    }, subscriptionError => {
      error.value = subscriptionError.message
      loading.value = false
    })
  }

  const create = (expense: NewExpense) => expensesService.create(expense)
  const update = (id: string, expense: Partial<NewExpense>) => expensesService.update(id, expense)
  const remove = (id: string) => expensesService.delete(id)
  const dispose = () => { stop?.(); stop = null }

  return { items, loading, error, subscribe, create, update, remove, dispose }
})
