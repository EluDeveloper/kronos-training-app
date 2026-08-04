import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { productsService, type NewProduct } from '@/services/products.service'
import { salesService, type NewSale } from '@/services/sales.service'
import { storeCreditsService } from '@/services/store-credits.service'
import type { Product, Sale, StoreCreditAccount } from '@/types/domain'

export const useCommerceStore = defineStore('commerce', () => {
  const products = ref<Product[]>([])
  const sales = ref<Sale[]>([])
  const storeCredits = ref<StoreCreditAccount[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stopProducts: Unsubscribe | null = null
  let stopSales: Unsubscribe | null = null
  let stopStoreCredits: Unsubscribe | null = null

  const openCredit = computed(() => sales.value.filter(item => item.status === 'credit'))
  const lowStock = computed(() => products.value.filter(item => item.status === 'active' && item.stock <= item.alertLevel))

  function subscribe() {
    if (stopProducts || stopSales || stopStoreCredits)
      return
    loading.value = true
    stopProducts = productsService.subscribe(value => { products.value = value; loading.value = false }, handleError)
    stopSales = salesService.subscribe(value => { sales.value = value; loading.value = false }, handleError)
    stopStoreCredits = storeCreditsService.subscribe(value => { storeCredits.value = value; loading.value = false }, handleError)
  }

  function handleError(subscriptionError: Error) {
    error.value = subscriptionError.message
    loading.value = false
  }

  const createProduct = (product: NewProduct) => productsService.create(product)
  const updateProduct = (id: string, product: Partial<NewProduct>) => productsService.update(id, product)
  const addStock = (id: string, quantity: number) => productsService.addStock(id, quantity)
  const createSale = (sale: NewSale, creditDeposit = 0, creditApplied = 0) => salesService.create(sale, creditDeposit, creditApplied)
  const addPayment = (saleId: string, amount: number, method: string, received?: number, change?: number, creditDeposit = 0) => salesService.addPayment(saleId, amount, method, received, change, creditDeposit)
  const cancelSale = (saleId: string) => salesService.cancel(saleId)
  const creditForAthlete = (athleteId?: string | null) => storeCredits.value.find(account => account.athleteId === athleteId)?.balance ?? 0
  const dispose = () => { stopProducts?.(); stopSales?.(); stopStoreCredits?.(); stopProducts = null; stopSales = null; stopStoreCredits = null }

  return { products, sales, storeCredits, openCredit, lowStock, loading, error, subscribe, createProduct, updateProduct, addStock, createSale, addPayment, cancelSale, creditForAthlete, dispose }
})
