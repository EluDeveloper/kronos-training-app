import type { Expense } from '@/types/domain'
import { createEntity, deleteEntity, subscribeCollection, updateEntity, type ErrorHandler } from './realtime.service'

export type NewExpense = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>

export const expensesService = {
  subscribe: (onChange: (items: Expense[]) => void, onError: ErrorHandler) => subscribeCollection<Expense>('expenses', onChange, onError),
  create: (expense: NewExpense) => createEntity('expenses', expense as unknown as Record<string, unknown>),
  update: (id: string, expense: Partial<NewExpense>) => updateEntity(`expenses/${id}`, expense as Record<string, unknown>),
  delete: (id: string) => deleteEntity(`expenses/${id}`),
}
