import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { productsService, type NewProduct } from '@/services/products.service'
import { salesService, type NewSale } from '@/services/sales.service'
import type { Product, Sale } from '@/types/domain'

export const useCommerceStore = defineStore('commerce', () => {
  const products = ref<Product[]>([])
  const sales = ref<Sale[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stopProducts: Unsubscribe | null = null
  let stopSales: Unsubscribe | null = null

  const openCredit = computed(() => sales.value.filter(item => item.status === 'credit'))
  const lowStock = computed(() => products.value.filter(item => item.status === 'active' && item.stock <= item.alertLevel))

  function subscribe() {
    if (stopProducts || stopSales)
      return
    loading.value = true
    stopProducts = productsService.subscribe(value => { products.value = value; loading.value = false }, handleError)
    stopSales = salesService.subscribe(value => { sales.value = value; loading.value = false }, handleError)
  }

  function handleError(subscriptionError: Error) {
    error.value = subscriptionError.message
    loading.value = false
  }

  const createProduct = (product: NewProduct) => productsService.create(product)
  const updateProduct = (id: string, product: Partial<NewProduct>) => productsService.update(id, product)
  const addStock = (id: string, quantity: number) => productsService.addStock(id, quantity)
  const createSale = (sale: NewSale) => salesService.create(sale)
  const addPayment = (saleId: string, amount: number, method: string, received?: number, change?: number) => salesService.addPayment(saleId, amount, method, received, change)
  const cancelSale = (saleId: string) => salesService.cancel(saleId)
  const dispose = () => { stopProducts?.(); stopSales?.(); stopProducts = null; stopSales = null }

  return { products, sales, openCredit, lowStock, loading, error, subscribe, createProduct, updateProduct, addStock, createSale, addPayment, cancelSale, dispose }
})
