import type { Product } from '@/types/domain'
import { increment, ref, update } from 'firebase/database'
import { createEntity, requireDatabase, subscribeCollection, updateEntity, businessPath, serverTimestamp, type ErrorHandler } from './realtime.service'

export type NewProduct = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>

export const productsService = {
  subscribe: (onChange: (items: Product[]) => void, onError: ErrorHandler) => subscribeCollection<Product>('products', onChange, onError),
  create: (product: NewProduct) => createEntity('products', product as unknown as Record<string, unknown>),
  update: (id: string, product: Partial<NewProduct>) => updateEntity(`products/${id}`, product as Record<string, unknown>),
  addStock(id: string, quantity: number) {
    return update(ref(requireDatabase(), businessPath(`products/${id}`)), {
      stock: increment(quantity),
      updatedAt: serverTimestamp(),
    })
  },
}
