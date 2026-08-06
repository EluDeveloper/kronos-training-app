<script setup lang="ts">
import PageHeader from '@/components/kronos/PageHeader.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import EmptyState from '@/components/kronos/EmptyState.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import BarcodeScanner from '@/components/kronos/BarcodeScanner.vue'
import ProductBarcodeLabelDialog from '@/components/kronos/ProductBarcodeLabelDialog.vue'
import { useCommerceStore } from '@/stores/commerce'
import { useAthletesStore } from '@/stores/athletes'
import { useVisitorsStore } from '@/stores/visitors'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import type { PaymentMethod, Product, Sale, SaleItem, SalePayment, StoreCreditEntry } from '@/types/domain'
import { buildGroupedSalePaymentReceipt, buildSalePaymentReceipt, buildSaleReceipt, paymentMethodLabel, type ReceiptData } from '@/utils/receipts'
import { formatCurrency, formatDate, saleAppliedAmount, saleBalance, timestampValue } from '@/utils/kronos'
import { generateInternalBarcode, normalizeProductBarcode, productBarcodes, productHasBarcode } from '@/utils/product-barcodes'

const commerce = useCommerceStore()
const athletes = useAthletesStore()
const visitors = useVisitorsStore()
const notifications = useNotificationsStore()
const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const canSell = computed(() => session.can('storeSell'))
const canCollect = computed(() => session.can('storeCollect'))
const canManageInventory = computed(() => session.can('storeInventory'))
const canCancelSales = computed(() => session.can('storeCancel'))
const tab = ref(canSell.value ? 'pos' : 'inventory')
const saving = ref(false)
const productDialog = ref(false)
const barcodeDialog = ref(false)
const barcodeLabelDialog = ref(false)
const stockDialog = ref(false)
const paymentDialog = ref(false)
const receiptDialog = ref(false)
const activeReceipt = ref<ReceiptData | null>(null)
const groupedPaymentSales = ref<Sale[]>([])
const editingProduct = ref<Product | null>(null)
const selectedProductId = ref('')
const selectedQuantity = ref(1)
const cartPage = ref(1)
const inventorySearch = ref('')
const inventoryStockFilter = ref<string | null>(null)
const inventoryPage = ref(1)
const creditSearch = ref('')
const creditPage = ref(1)
const salesSearch = ref('')
const salesStatusFilter = ref<string | null>(null)
const salesPage = ref(1)
const perPage = 15
const cart = ref<Record<string, SaleItem>>({})
const saleForm = reactive({ customerKey: '', customerName: '', method: 'cash' as PaymentMethod, initialPayment: 0, received: 0, creditApplied: 0, saveExcessAsCredit: false })
const productForm = reactive({ name: '', category: '', barcode: '', alternativeBarcodes: [] as string[], size: '', stock: 0, alertLevel: 2, unitCost: 0, salePrice: 0, status: 'active' as const })
const alternativeBarcodeInput = ref('')
const barcodeScanTarget = ref<'pos' | 'primary' | 'alternative'>('primary')
const barcodeLabel = reactive({ name: '', variant: '', price: 0, code: '' })
const stockForm = reactive({ product: null as Product | null, quantity: 1 })
const paymentForm = reactive({ sale: null as Sale | null, amount: 0, method: 'cash' as PaymentMethod, received: 0, saveExcessAsCredit: false })

const activeProducts = computed(() => commerce.products.filter(item => item.status === 'active'))

const customerItems = computed(() => [
  ...athletes.sorted.map(athlete => ({ title: athlete.profile.name, value: `athlete:${athlete.id}`, subtitle: `Miembro · ${athlete.profile.phone}` })),
  ...visitors.sorted.map(visitor => ({ title: visitor.name, value: `visitor:${visitor.id}`, subtitle: `Visitante · ${visitor.phone}` })),
])

const cartItems = computed(() => Object.values(cart.value))
const cartPageCount = computed(() => Math.max(1, Math.ceil(cartItems.value.length / perPage)))
const paginatedCartItems = computed(() => cartItems.value.slice((cartPage.value - 1) * perPage, cartPage.value * perPage))
const cartTotal = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))
const inventoryValue = computed(() => commerce.products.reduce((sum, item) => sum + item.stock * item.unitCost, 0))
const outstanding = computed(() => commerce.openCredit.reduce((sum, sale) => sum + saleBalance(sale), 0))
const selectedSaleAthleteId = computed(() => saleForm.customerKey.startsWith('athlete:') ? saleForm.customerKey.slice(8) : '')
const availableStoreCredit = computed(() => commerce.creditForAthlete(selectedSaleAthleteId.value))
const cashExcess = computed(() => saleForm.method === 'cash' ? Math.max(0, Number(saleForm.received || 0) - Number(saleForm.initialPayment || 0)) : 0)
const saleCreditDeposit = computed(() => saleForm.saveExcessAsCredit && selectedSaleAthleteId.value && Number(saleForm.initialPayment) + Number(saleForm.creditApplied) >= cartTotal.value ? cashExcess.value : 0)
const saleChange = computed(() => Math.max(0, cashExcess.value - saleCreditDeposit.value))
const paymentExcess = computed(() => paymentForm.method === 'cash' ? Math.max(0, Number(paymentForm.received || 0) - Number(paymentForm.amount || 0)) : 0)
const isGroupedPayment = computed(() => groupedPaymentSales.value.length > 1)
const paymentAthleteId = computed(() => groupedPaymentSales.value[0]?.athleteId ?? paymentForm.sale?.athleteId ?? '')

const paymentBalance = computed(() => isGroupedPayment.value
  ? groupedPaymentSales.value.reduce((total, sale) => total + saleBalance(sale), 0)
  : paymentForm.sale ? saleBalance(paymentForm.sale) : 0)

const paymentCreditDeposit = computed(() => paymentForm.saveExcessAsCredit && paymentAthleteId.value && Number(paymentForm.amount) >= paymentBalance.value ? paymentExcess.value : 0)
const paymentChange = computed(() => Math.max(0, paymentExcess.value - paymentCreditDeposit.value))
const paymentRemaining = computed(() => Math.max(0, paymentBalance.value - Number(paymentForm.amount || 0)))

const creditAccounts = computed(() => commerce.storeCredits
  .filter(account => account.balance > 0 || Object.keys(account.entries ?? {}).length)
  .map(account => ({
    ...account,
    athleteName: athletes.items.find(athlete => athlete.id === account.athleteId)?.profile.name ?? 'Atleta',
    history: Object.values(account.entries ?? {}).sort((a, b) => timestampValue(b.occurredAt) - timestampValue(a.occurredAt)),
  }))
  .sort((a, b) => a.athleteName.localeCompare(b.athleteName, 'es')))

const storePaymentHistory = computed(() => {
  const movements = commerce.sales
    .flatMap(sale => salePayments(sale).map(payment => ({ sale, payment })))
    .sort((a, b) => timestampValue(b.payment.appliedAt) - timestampValue(a.payment.appliedAt))

  const groupedTotals = new Map<string, number>()

  movements.forEach(entry => {
    if (entry.payment.groupPaymentId)
      groupedTotals.set(entry.payment.groupPaymentId, (groupedTotals.get(entry.payment.groupPaymentId) ?? 0) + Number(entry.payment.amountApplied || 0))
  })

  const seenGroups = new Set<string>()

  return movements
    .filter(entry => {
      if (!entry.payment.groupPaymentId)
        return true
      if (seenGroups.has(entry.payment.groupPaymentId))
        return false

      seenGroups.add(entry.payment.groupPaymentId)

      return true
    })
    .map(entry => ({
      ...entry,
      amount: entry.payment.groupPaymentId ? groupedTotals.get(entry.payment.groupPaymentId) ?? entry.payment.amountApplied : entry.payment.amountApplied,
    }))
    .slice(0, 50)
})

const creditEntryLabel = (entry: StoreCreditEntry) => ({ deposit: 'Depósito', application: 'Aplicado', refund: 'Reintegro' })[entry.type]

const filteredInventory = computed(() => commerce.products
  .filter(product => {
    if (inventoryStockFilter.value === 'low') return product.stock > 0 && product.stock <= product.alertLevel
    if (inventoryStockFilter.value === 'out') return product.stock === 0
    if (inventoryStockFilter.value === 'available') return product.stock > product.alertLevel

    return true
  })
  .filter(product => `${product.name} ${product.category} ${productBarcodes(product).join(' ')} ${product.size ?? ''}`.toLocaleLowerCase('es').includes(inventorySearch.value.toLocaleLowerCase('es'))))

const inventoryPageCount = computed(() => Math.max(1, Math.ceil(filteredInventory.value.length / perPage)))
const paginatedInventory = computed(() => filteredInventory.value.slice((inventoryPage.value - 1) * perPage, inventoryPage.value * perPage))

const filteredCredit = computed(() => commerce.openCredit
  .filter(sale => `${customerName(sale)} ${Object.values(sale.items ?? {}).map(item => item.name).join(' ')}`.toLocaleLowerCase('es').includes(creditSearch.value.toLocaleLowerCase('es')))
  .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt)))

const groupedDebtAccounts = computed(() => {
  const groups = new Map<string, Sale[]>()

  commerce.openCredit.forEach(sale => {
    if (!sale.athleteId || saleBalance(sale) <= 0)
      return

    groups.set(sale.athleteId, [...(groups.get(sale.athleteId) ?? []), sale])
  })

  const search = creditSearch.value.trim().toLocaleLowerCase('es')

  return [...groups.entries()]
    .filter(([, sales]) => sales.length > 1)
    .map(([athleteId, sales]) => ({
      athleteId,
      athleteName: athletes.items.find(athlete => athlete.id === athleteId)?.profile.name ?? sales[0].customerName,
      sales: [...sales].sort((a, b) => timestampValue(a.createdAt) - timestampValue(b.createdAt)),
      total: sales.reduce((total, sale) => total + saleBalance(sale), 0),
    }))
    .filter(group => !search || `${group.athleteName} ${group.sales.flatMap(sale => Object.values(sale.items ?? {}).map(item => item.name)).join(' ')}`.toLocaleLowerCase('es').includes(search))
    .sort((a, b) => a.athleteName.localeCompare(b.athleteName, 'es'))
})

const creditPageCount = computed(() => Math.max(1, Math.ceil(filteredCredit.value.length / perPage)))
const paginatedCredit = computed(() => filteredCredit.value.slice((creditPage.value - 1) * perPage, creditPage.value * perPage))

const filteredSales = computed(() => [...commerce.sales]
  .filter(sale => !salesStatusFilter.value || sale.status === salesStatusFilter.value)
  .filter(sale => `${customerName(sale)} ${Object.values(sale.items ?? {}).map(item => item.name).join(' ')}`.toLocaleLowerCase('es').includes(salesSearch.value.toLocaleLowerCase('es')))
  .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt)))

const salesPageCount = computed(() => Math.max(1, Math.ceil(filteredSales.value.length / perPage)))
const paginatedSales = computed(() => filteredSales.value.slice((salesPage.value - 1) * perPage, salesPage.value * perPage))
const customerName = (sale: Sale) => visitors.items.find(item => item.id === sale.visitorId)?.name ?? athletes.items.find(item => item.id === sale.athleteId)?.profile.name ?? sale.customerName
const customerForSale = (sale: Sale) => visitors.items.find(item => item.id === sale.visitorId) ?? athletes.items.find(item => item.id === sale.athleteId)
const salePayments = (sale: Sale) => Object.values(sale.payments ?? {}).sort((a, b) => timestampValue(b.appliedAt) - timestampValue(a.appliedAt))

function showSaleReceipt(sale: Sale) {
  activeReceipt.value = buildSaleReceipt(sale, customerForSale(sale))
  receiptDialog.value = true
}

function showPaymentReceipt(sale: Sale, payment: SalePayment) {
  if (payment.groupPaymentId) {
    const entries = commerce.sales.flatMap(groupSale => Object.values(groupSale.payments ?? {})
      .filter(groupPayment => groupPayment.groupPaymentId === payment.groupPaymentId)
      .map(groupPayment => ({ sale: groupSale, payment: groupPayment })))

    activeReceipt.value = buildGroupedSalePaymentReceipt(entries, customerForSale(sale))
  }
  else {
    activeReceipt.value = buildSalePaymentReceipt(sale, payment, customerForSale(sale))
  }
  receiptDialog.value = true
}

watch(() => route.query.tab, requestedTab => {
  if (requestedTab === 'credit' || requestedTab === 'inventory' || requestedTab === 'sales' || (requestedTab === 'pos' && canSell.value))
    tab.value = requestedTab
}, { immediate: true })

watch(() => saleForm.customerKey, key => {
  if (key.startsWith('visitor:'))
    saleForm.customerName = visitors.items.find(item => item.id === key.slice(8))?.name ?? ''
  else if (key.startsWith('athlete:'))
    saleForm.customerName = athletes.items.find(item => item.id === key.slice(8))?.profile.name ?? ''
  else if (!key)
    saleForm.customerName = ''

  saleForm.creditApplied = 0
  saleForm.saveExcessAsCredit = false
})
watch(cartTotal, total => {
  saleForm.creditApplied = Math.min(Number(saleForm.creditApplied || 0), availableStoreCredit.value, total)
  saleForm.initialPayment = Math.min(Number(saleForm.initialPayment || 0), Math.max(0, total - saleForm.creditApplied))
})
watch(() => saleForm.creditApplied, value => {
  saleForm.creditApplied = Math.max(0, Math.min(Number(value || 0), availableStoreCredit.value, cartTotal.value))
  saleForm.initialPayment = Math.min(Number(saleForm.initialPayment || 0), Math.max(0, cartTotal.value - saleForm.creditApplied))
})
watch(() => saleForm.method, method => {
  saleForm.received = method === 'cash' ? Math.max(Number(saleForm.received || 0), Number(saleForm.initialPayment || 0)) : Number(saleForm.initialPayment || 0)
  if (method !== 'cash')
    saleForm.saveExcessAsCredit = false
})
watch(() => saleForm.initialPayment, value => {
  if (saleForm.method === 'cash' && Number(saleForm.received || 0) < Number(value || 0))
    saleForm.received = Number(value || 0)
})
watch(() => paymentForm.amount, (amount, previousAmount) => {
  if (paymentForm.method === 'cash' && Number(paymentForm.received || 0) === Number(previousAmount || 0))
    paymentForm.received = Number(amount || 0)
})
watch(() => paymentForm.method, method => {
  paymentForm.received = Number(paymentForm.amount || 0)
  if (method !== 'cash')
    paymentForm.saveExcessAsCredit = false
})
watch(() => cartItems.value.length, () => { cartPage.value = Math.min(cartPage.value, cartPageCount.value) })
watch([inventorySearch, inventoryStockFilter], () => { inventoryPage.value = 1 })
watch(creditSearch, () => { creditPage.value = 1 })
watch([salesSearch, salesStatusFilter], () => { salesPage.value = 1 })

function addProductToCart(product: Product, quantity: number) {
  if (!canSell.value)
    return false

  const already = cart.value[product.id]?.quantity ?? 0
  if (quantity <= 0 || quantity + already > product.stock)
    return false

  cart.value[product.id] = {
    productId: product.id,
    name: product.size ? `${product.name} · ${product.size}` : product.name,
    quantity: quantity + already,
    unitPrice: product.salePrice,
    unitCost: product.unitCost,
  }

  return true
}

function addToCart() {
  if (!canSell.value)
    return notifications.show('No tienes permiso para realizar ventas.', 'warning')

  const product = commerce.products.find(item => item.id === selectedProductId.value)
  const quantity = Number(selectedQuantity.value)
  if (!product || !addProductToCart(product, quantity)) {
    notifications.show('Selecciona un producto y una cantidad disponible.', 'warning')

    return
  }
  selectedProductId.value = ''
  selectedQuantity.value = 1
}

function removeFromCart(id: string) {
  const next = { ...cart.value }

  delete next[id]
  cart.value = next
}

async function completeSale() {
  if (!canSell.value)
    return notifications.show('No tienes permiso para realizar ventas.', 'warning')

  const total = cartTotal.value
  const initialPayment = Number(saleForm.initialPayment)
  const creditApplied = Number(saleForm.creditApplied || 0)
  const received = saleForm.method === 'cash' ? Number(saleForm.received || 0) : initialPayment
  if (!cartItems.value.length || !saleForm.customerName.trim() || initialPayment < 0 || creditApplied < 0 || creditApplied > availableStoreCredit.value || initialPayment + creditApplied > total || received < initialPayment) {
    notifications.show('Agrega productos, cliente y un pago válido.', 'warning')

    return
  }
  saving.value = true
  try {
    const createdAt = Date.now()
    const payments: Record<string, SalePayment> = {}
    if (creditApplied > 0) {
      const creditPaymentId = `credit-${createdAt}`

      payments[creditPaymentId] = { id: creditPaymentId, amountApplied: creditApplied, method: 'store-credit', receivedAmount: creditApplied, changeGiven: 0, creditBalance: availableStoreCredit.value - creditApplied + saleCreditDeposit.value, appliedAt: createdAt }
    }
    if (initialPayment > 0) {
      const paymentId = `initial-${createdAt}`

      payments[paymentId] = { id: paymentId, amountApplied: initialPayment, method: saleForm.method, receivedAmount: received, changeGiven: saleChange.value, ...(saleCreditDeposit.value > 0 ? { creditBalance: availableStoreCredit.value - creditApplied + saleCreditDeposit.value } : {}), appliedAt: createdAt }
    }

    const salePayload = {
      athleteId: saleForm.customerKey.startsWith('athlete:') ? saleForm.customerKey.slice(8) : null,
      visitorId: saleForm.customerKey.startsWith('visitor:') ? saleForm.customerKey.slice(8) : null,
      customerName: saleForm.customerName.trim(),
      items: cart.value,
      total,
      status: initialPayment + creditApplied >= total ? 'paid' : 'credit',
      payments,
    } as const

    const saleId = await commerce.createSale(salePayload, saleCreditDeposit.value, creditApplied)
    const createdSale: Sale = { ...salePayload, id: saleId, createdAt, updatedAt: createdAt }

    const creditMessage = saleCreditDeposit.value > 0 ? ` Saldo a favor generado: ${formatCurrency(saleCreditDeposit.value)}.` : ''

    notifications.show(`${initialPayment + creditApplied >= total ? 'Venta cobrada y existencias actualizadas.' : 'Venta a crédito registrada.'}${creditMessage}`)
    showSaleReceipt(createdSale)
    cart.value = {}
    Object.assign(saleForm, { customerKey: '', customerName: '', method: 'cash', initialPayment: 0, received: 0, creditApplied: 0, saveExcessAsCredit: false })
  }
  catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No se pudo completar la venta.', 'error')
  }
  finally { saving.value = false }
}

function openProduct(product?: Product) {
  if (!canManageInventory.value)
    return notifications.show('No tienes permiso para administrar inventario.', 'warning')

  editingProduct.value = product ?? null

  const primaryBarcode = normalizeProductBarcode(product?.barcode)

  Object.assign(productForm, product ? { name: product.name, category: product.category, barcode: primaryBarcode, alternativeBarcodes: productBarcodes(product).filter(code => code !== primaryBarcode), size: product.size ?? '', stock: product.stock, alertLevel: product.alertLevel, unitCost: product.unitCost, salePrice: product.salePrice, status: product.status } : { name: '', category: '', barcode: '', alternativeBarcodes: [], size: '', stock: 0, alertLevel: 2, unitCost: 0, salePrice: 0, status: 'active' })
  alternativeBarcodeInput.value = ''
  barcodeScanTarget.value = 'primary'
  productDialog.value = true
}

function openNewProduct() {
  openProduct()
}

async function saveProduct() {
  if (!canManageInventory.value)
    return notifications.show('No tienes permiso para administrar inventario.', 'warning')

  const barcode = normalizeProductBarcode(productForm.barcode)
  const alternativeBarcodes = [...new Set(productForm.alternativeBarcodes.map(normalizeProductBarcode).filter(code => code && code !== barcode))]
  const allBarcodes = [barcode, ...alternativeBarcodes].filter(Boolean)
  if (!productForm.name.trim() || !productForm.category.trim() || productForm.stock < 0 || productForm.unitCost < 0 || productForm.salePrice < 0 || allBarcodes.some(code => !/^[a-z0-9-]{4,64}$/i.test(code))) {
    notifications.show('Completa los datos del producto con valores válidos.', 'warning')

    return
  }

  const codesUsedByOtherProducts = new Set(commerce.products
    .filter(product => product.id !== editingProduct.value?.id)
    .flatMap(productBarcodes))

  if (allBarcodes.some(code => codesUsedByOtherProducts.has(code)))
    return notifications.show('Uno de los códigos ya pertenece a otro producto. Cada código debe identificar una sola variante y precio.', 'warning')

  saving.value = true
  try {
    const payload = {
      name: productForm.name.trim(),
      category: productForm.category.trim(),
      barcode: barcode || null,
      barcodes: alternativeBarcodes.length ? Object.fromEntries(alternativeBarcodes.map(code => [code, true as const])) as Record<string, true> : null,
      size: productForm.size.trim() || null,
      stock: Number(productForm.stock),
      alertLevel: Number(productForm.alertLevel),
      unitCost: Number(productForm.unitCost),
      salePrice: Number(productForm.salePrice),
      status: productForm.status,
    }

    if (editingProduct.value)
      await commerce.updateProduct(editingProduct.value.id, payload)
    else
      await commerce.createProduct(payload)
    notifications.show(editingProduct.value ? 'Producto actualizado.' : 'Producto creado.')
    productDialog.value = false
  }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo guardar.', 'error') }
  finally { saving.value = false }
}

function openBarcodeScanner(target: 'pos' | 'primary' | 'alternative') {
  if (target === 'pos' && !canSell.value)
    return notifications.show('No tienes permiso para realizar ventas.', 'warning')

  barcodeScanTarget.value = target
  barcodeDialog.value = true
}

function addAlternativeBarcode(value = alternativeBarcodeInput.value) {
  const code = normalizeProductBarcode(value)
  const primary = normalizeProductBarcode(productForm.barcode)
  if (!code || !/^[a-z0-9-]{4,64}$/i.test(code))
    return notifications.show('El código debe contener entre 4 y 64 letras, números o guiones.', 'warning')
  if (code === primary || productForm.alternativeBarcodes.includes(code))
    return notifications.show('Ese código ya está agregado a este producto.', 'warning')
  if (commerce.products.some(product => product.id !== editingProduct.value?.id && productBarcodes(product).includes(code)))
    return notifications.show('Ese código ya pertenece a otro producto.', 'warning')

  productForm.alternativeBarcodes.push(code)
  alternativeBarcodeInput.value = ''
}

function removeAlternativeBarcode(code: string) {
  productForm.alternativeBarcodes = productForm.alternativeBarcodes.filter(item => item !== code)
}

function useScannedBarcode(code: string) {
  const normalizedCode = normalizeProductBarcode(code)

  if (barcodeScanTarget.value === 'pos') {
    const product = activeProducts.value.find(item => productHasBarcode(item, normalizedCode))
    if (!product)
      return notifications.show(`No existe un producto activo con el código ${normalizedCode}.`, 'warning')
    if (!addProductToCart(product, 1))
      return notifications.show(`No hay existencias suficientes de ${product.name}.`, 'warning')

    barcodeDialog.value = false
    notifications.show(`${product.size ? `${product.name} · ${product.size}` : product.name} agregado al carrito.`)
  }
  else if (barcodeScanTarget.value === 'alternative') {
    addAlternativeBarcode(normalizedCode)
    barcodeDialog.value = false
    notifications.show('Código de barras capturado.')
  }
  else {
    productForm.barcode = normalizedCode
    barcodeDialog.value = false
    notifications.show('Código de barras capturado.')
  }
}

function createInternalBarcode() {
  const formBarcodes = Object.fromEntries(productForm.alternativeBarcodes.map(code => [code, true])) as Record<string, true>
  const code = generateInternalBarcode([...commerce.products, { barcode: productForm.barcode, barcodes: formBarcodes }])

  if (!normalizeProductBarcode(productForm.barcode))
    productForm.barcode = code
  else
    productForm.alternativeBarcodes.push(code)
  openBarcodeLabel(code)
  notifications.show('Código interno generado. Guarda el producto para activarlo.')
}

function openBarcodeLabel(code: string, product?: Product) {
  Object.assign(barcodeLabel, {
    name: product?.name ?? (productForm.name.trim() || 'Producto'),
    variant: product?.size ?? productForm.size.trim(),
    price: product?.salePrice ?? Number(productForm.salePrice || 0),
    code,
  })
  barcodeLabelDialog.value = true
}

async function openKiosk() {
  try {
    if (document.fullscreenEnabled && !document.fullscreenElement)
      await document.documentElement.requestFullscreen()
  }
  catch {
    // El modo de página completa mantiene el panel oculto aunque iPadOS no conceda Fullscreen API.
  }

  await router.push('/kiosco')
}

function openStock(product: Product) {
  if (!canManageInventory.value)
    return notifications.show('No tienes permiso para ingresar inventario.', 'warning')

  stockForm.product = product
  stockForm.quantity = 1
  stockDialog.value = true
}
async function saveStock() {
  if (!canManageInventory.value)
    return notifications.show('No tienes permiso para ingresar inventario.', 'warning')

  if (!stockForm.product || Number(stockForm.quantity) <= 0)
    return notifications.show('La entrada debe ser mayor a cero.', 'warning')
  saving.value = true
  try { await commerce.addStock(stockForm.product.id, Number(stockForm.quantity)); notifications.show('Existencia actualizada.'); stockDialog.value = false }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo actualizar.', 'error') }
  finally { saving.value = false }
}

function openPayment(sale: Sale) {
  if (!canCollect.value)
    return notifications.show('No tienes permiso para aplicar abonos.', 'warning')

  groupedPaymentSales.value = []
  paymentForm.sale = sale
  paymentForm.amount = saleBalance(sale)
  paymentForm.received = saleBalance(sale)
  paymentForm.method = 'cash'
  paymentForm.saveExcessAsCredit = false
  paymentDialog.value = true
}

function openGroupedPayment(sales: Sale[]) {
  if (!canCollect.value)
    return notifications.show('No tienes permiso para cobrar adeudos.', 'warning')
  if (sales.length < 2 || !sales[0]?.athleteId || sales.some(sale => sale.athleteId !== sales[0].athleteId))
    return notifications.show('El cobro conjunto requiere al menos dos adeudos del mismo atleta.', 'warning')

  groupedPaymentSales.value = [...sales].sort((a, b) => timestampValue(a.createdAt) - timestampValue(b.createdAt))
  paymentForm.sale = null
  paymentForm.amount = groupedPaymentSales.value.reduce((total, sale) => total + saleBalance(sale), 0)
  paymentForm.received = paymentForm.amount
  paymentForm.method = 'cash'
  paymentForm.saveExcessAsCredit = false
  paymentDialog.value = true
}

async function applyPayment() {
  if (!canCollect.value)
    return notifications.show('No tienes permiso para aplicar abonos.', 'warning')

  const amount = Number(paymentForm.amount)
  const received = paymentForm.method === 'cash' ? Number(paymentForm.received || 0) : amount
  const sale = paymentForm.sale
  if (!sale && !isGroupedPayment.value)
    return notifications.show('No se encontró la venta pendiente.', 'warning')
  if (!Number.isFinite(amount) || amount <= 0 || amount > paymentBalance.value)
    return notifications.show(`El abono debe ser mayor a $0 y no superar ${formatCurrency(paymentBalance.value)}.`, 'warning')
  if (isGroupedPayment.value && Math.abs(amount - paymentBalance.value) > 0.01)
    return notifications.show('El cobro conjunto debe liquidar el saldo completo seleccionado.', 'warning')
  if (!Number.isFinite(received) || received < amount)
    return notifications.show(`El efectivo recibido (${formatCurrency(received)}) es menor que el abono (${formatCurrency(amount)}).`, 'warning')
  saving.value = true
  try {
    if (isGroupedPayment.value) {
      const result = await commerce.addGroupedPayment(groupedPaymentSales.value.map(item => item.id), amount, paymentForm.method, received, paymentChange.value, paymentCreditDeposit.value)
      const firstSale = result.entries[0]?.sale

      if (!firstSale)
        throw new Error('No fue posible generar el recibo del cobro conjunto.')

      activeReceipt.value = buildGroupedSalePaymentReceipt(result.entries, customerForSale(firstSale))
      notifications.show(paymentCreditDeposit.value > 0 ? `Adeudos liquidados. Se guardaron ${formatCurrency(paymentCreditDeposit.value)} como saldo a favor.` : `${groupedPaymentSales.value.length} adeudos liquidados en un solo cobro.`)
      paymentDialog.value = false
      receiptDialog.value = true

      return
    }

    if (!sale)
      throw new Error('No se encontró la venta pendiente.')

    const result = await commerce.addPayment(sale.id, amount, paymentForm.method, received, paymentChange.value, paymentCreditDeposit.value)

    notifications.show(paymentCreditDeposit.value > 0 ? `Abono aplicado. Se guardaron ${formatCurrency(paymentCreditDeposit.value)} como saldo a favor.` : 'Abono aplicado al saldo correcto.')
    paymentDialog.value = false
    showPaymentReceipt(result.sale, result.payment)
  }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo aplicar el abono.', 'error') }
  finally { saving.value = false }
}

async function cancelSale(sale: Sale) {
  if (!canCancelSales.value)
    return notifications.show('No tienes permiso para cancelar ventas.', 'warning')

  const accepted = await notifications.requestConfirmation({
    title: 'Cancelar venta',
    message: `¿Deseas cancelar la venta de ${customerName(sale)}?`,
    detail: 'La venta se marcará como cancelada y las existencias se devolverán automáticamente al inventario.',
    confirmText: 'Cancelar venta',
    color: 'error',
    icon: 'ri-close-circle-line',
  })

  if (!accepted) return
  try { await commerce.cancelSale(sale.id); notifications.show('Venta cancelada e inventario restituido.', 'info') }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo cancelar.', 'error') }
}

onMounted(() => { commerce.subscribe(); athletes.subscribe(); visitors.subscribe() })
onUnmounted(() => { commerce.dispose(); athletes.dispose(); visitors.dispose() })
</script>

<template>
  <PageHeader
    title="Tienda"
    eyebrow="Comercio"
    description="Punto de venta, inventario y cuentas por cobrar sin duplicar ingresos."
  >
    <template
      v-if="canManageInventory || session.isAdmin"
      #actions
    >
      <VBtn
        v-if="session.isAdmin"
        prepend-icon="ri-scan-2-line"
        @click="openKiosk"
      >
        Abrir kiosco
      </VBtn>
      <VBtn
        v-if="canManageInventory"
        variant="tonal"
        prepend-icon="ri-add-box-line"
        @click="openNewProduct"
      >
        Nuevo producto
      </VBtn>
    </template>
  </PageHeader>
  <VRow class="mb-2">
    <VCol
      cols="12"
      md="4"
    >
      <MetricCard
        label="Valor de inventario"
        :value="formatCurrency(inventoryValue)"
        icon="ri-archive-stack-line"
      />
    </VCol><VCol
      cols="12"
      md="4"
    >
      <MetricCard
        label="Stock bajo"
        :value="commerce.lowStock.length"
        icon="ri-alarm-warning-line"
        color="warning"
      />
    </VCol><VCol
      cols="12"
      md="4"
    >
      <MetricCard
        label="Por cobrar"
        :value="formatCurrency(outstanding)"
        icon="ri-hand-coin-line"
        color="error"
      />
    </VCol>
  </VRow>

  <VTabs
    v-model="tab"
    class="mb-5"
  >
    <VTab
      v-if="canSell"
      value="pos"
    >
      Punto de venta
    </VTab><VTab value="inventory">
      Inventario
    </VTab><VTab value="credit">
      Deudas y abonos
    </VTab><VTab value="sales">
      Ventas
    </VTab>
  </VTabs>

  <VWindow v-model="tab">
    <VWindowItem
      v-if="canSell"
      value="pos"
    >
      <VRow>
        <VCol
          cols="12"
          lg="7"
        >
          <VCard
            class="kronos-card"
            rounded="xl"
          >
            <VCardTitle class="pa-6">
              Armar venta
            </VCardTitle>
            <VCardText>
              <div class="pos-product-controls">
                <VAutocomplete
                  v-model="selectedProductId"
                  :items="activeProducts"
                  :item-title="item => item.size ? `${item.name} · ${item.size}` : item.name"
                  item-value="id"
                  label="Buscar producto"
                  prepend-inner-icon="ri-search-line"
                  :item-props="item => ({ subtitle: `${item.stock} disponibles · ${formatCurrency(item.salePrice)}` })"
                  clearable
                  auto-select-first
                />
                <VTextField
                  v-model.number="selectedQuantity"
                  type="number"
                  min="1"
                  label="Cantidad"
                />
                <VBtn
                  block
                  height="56"
                  variant="tonal"
                  @click="addToCart"
                >
                  Agregar
                </VBtn>
                <VBtn
                  class="pos-scan-button"
                  block
                  height="56"
                  prepend-icon="ri-camera-line"
                  @click="openBarcodeScanner('pos')"
                >
                  Leer código
                </VBtn>
              </div>
              <template v-if="cartItems.length">
                <VTable>
                  <thead><tr><th>PRODUCTO</th><th>CANT.</th><th>IMPORTE</th><th /></tr></thead><tbody>
                    <tr
                      v-for="item in paginatedCartItems"
                      :key="item.productId"
                    >
                      <td>{{ item.name }}</td><td>{{ item.quantity }}</td><td>{{ formatCurrency(item.quantity * item.unitPrice) }}</td><td>
                        <VBtn
                          icon="ri-close-line"
                          variant="text"
                          size="small"
                          @click="removeFromCart(item.productId)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </VTable><VPagination
                  v-if="cartPageCount > 1"
                  v-model="cartPage"
                  :length="cartPageCount"
                  :total-visible="5"
                  class="mt-4"
                />
              </template>
              <EmptyState
                v-else
                class="pos-cart-empty"
                icon="ri-shopping-basket-line"
                title="Carrito vacío"
                description="Selecciona productos disponibles para iniciar."
              />
            </VCardText>
          </VCard>
        </VCol>

        <VCol
          cols="12"
          lg="5"
        >
          <VCard
            class="kronos-card checkout-card pa-6"
            rounded="xl"
          >
            <p class="text-overline text-kronos-cyan mb-1">
              Cobro
            </p>
            <p class="text-h3 font-weight-bold mb-7">
              {{ formatCurrency(cartTotal) }}
            </p>
            <div class="d-flex flex-column ga-5">
              <VAutocomplete
                v-model="saleForm.customerKey"
                :items="customerItems"
                label="Buscar miembro o visitante (opcional)"
                prepend-inner-icon="ri-search-line"
                clearable
              />
              <VTextField
                v-model="saleForm.customerName"
                label="Nombre del cliente"
              />
              <VAlert
                v-if="selectedSaleAthleteId"
                color="secondary"
                variant="tonal"
              >
                Saldo a favor disponible: <strong>{{ formatCurrency(availableStoreCredit) }}</strong>
              </VAlert>
              <VTextField
                v-if="selectedSaleAthleteId && availableStoreCredit > 0"
                v-model.number="saleForm.creditApplied"
                type="number"
                min="0"
                :max="Math.min(availableStoreCredit, cartTotal)"
                label="Aplicar saldo a favor"
                prefix="$"
              />
              <VSelect
                v-model="saleForm.method"
                :items="[{title:'Efectivo',value:'cash'},{title:'Transferencia',value:'transfer'},{title:'Tarjeta',value:'card'},{title:'Otro',value:'other'}]"
                label="Método"
              />
              <VTextField
                v-model.number="saleForm.initialPayment"
                type="number"
                min="0"
                :max="Math.max(0, cartTotal - saleForm.creditApplied)"
                label="Pago aplicado"
                prefix="$"
              />
              <VTextField
                v-if="saleForm.method === 'cash'"
                v-model.number="saleForm.received"
                type="number"
                min="0"
                label="Efectivo recibido"
                prefix="$"
              />
              <VSwitch
                v-if="selectedSaleAthleteId && cashExcess > 0 && saleForm.initialPayment + saleForm.creditApplied >= cartTotal"
                v-model="saleForm.saveExcessAsCredit"
                color="secondary"
                hide-details
                label="Guardar excedente como saldo a favor"
              />
              <VAlert
                v-if="saleForm.initialPayment + saleForm.creditApplied < cartTotal"
                type="info"
                variant="tonal"
              >
                Saldo a crédito: {{ formatCurrency(cartTotal - saleForm.initialPayment - saleForm.creditApplied) }}
              </VAlert>
              <VAlert
                v-else-if="saleCreditDeposit > 0"
                color="success"
                variant="tonal"
              >
                Se abonarán {{ formatCurrency(saleCreditDeposit) }} al saldo a favor del atleta.
              </VAlert>
              <VAlert
                v-else-if="saleChange > 0"
                color="warning"
                variant="tonal"
              >
                Cambio a entregar: {{ formatCurrency(saleChange) }}
              </VAlert>
              <VBtn
                block
                size="large"
                :loading="saving"
                :disabled="!cartItems.length"
                @click="completeSale"
              >
                Completar venta
              </VBtn>
            </div>
          </VCard>
        </VCol>
      </VRow>
    </VWindowItem>

    <VWindowItem value="inventory">
      <VCard
        class="kronos-card"
        rounded="xl"
      >
        <VCardText>
          <VRow class="mb-2">
            <VCol
              cols="12"
              md="8"
            >
              <VTextField
                v-model="inventorySearch"
                label="Buscar producto, código, categoría o talla"
                prepend-inner-icon="ri-search-line"
                clearable
              />
            </VCol><VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="inventoryStockFilter"
                :items="[{title:'Disponible',value:'available'},{title:'Stock bajo',value:'low'},{title:'Agotado',value:'out'}]"
                label="Existencia"
                clearable
              />
            </VCol>
          </VRow><EmptyState
            v-if="!filteredInventory.length"
            icon="ri-archive-line"
            title="Sin productos"
            description="Crea el primer producto o cambia los filtros."
          /><template v-else>
            <VTable class="text-no-wrap">
              <thead><tr><th>PRODUCTO</th><th>CÓDIGO</th><th>CATEGORÍA</th><th>STOCK</th><th>COSTO</th><th>PRECIO</th><th v-if="canManageInventory" /></tr></thead><tbody>
                <tr
                  v-for="product in paginatedInventory"
                  :key="product.id"
                >
                  <td>
                    <strong>{{ product.name }}</strong><div class="text-caption text-medium-emphasis">
                      {{ product.size || 'Sin talla' }}
                    </div>
                  </td><td>
                    <div class="d-flex align-center ga-1">
                      <span class="text-caption">{{ product.barcode || 'Sin código' }}</span>
                      <VChip
                        v-if="productBarcodes(product).length > (product.barcode ? 1 : 0)"
                        size="x-small"
                        color="secondary"
                        variant="tonal"
                      >
                        +{{ productBarcodes(product).length - (product.barcode ? 1 : 0) }}
                      </VChip>
                    </div>
                  </td><td>{{ product.category }}</td><td>
                    <VChip
                      size="small"
                      :color="product.stock <= product.alertLevel ? 'warning' : 'success'"
                    >
                      {{ product.stock }}
                    </VChip>
                  </td><td>{{ formatCurrency(product.unitCost) }}</td><td>{{ formatCurrency(product.salePrice) }}</td><td
                    v-if="canManageInventory"
                    class="text-end"
                  >
                    <VBtn
                      icon="ri-add-box-line"
                      variant="text"
                      title="Entrada de inventario"
                      @click="openStock(product)"
                    /><VBtn
                      icon="ri-edit-line"
                      variant="text"
                      title="Editar producto"
                      @click="openProduct(product)"
                    />
                  </td>
                </tr>
              </tbody>
            </VTable><div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-5">
              <span class="text-caption text-medium-emphasis">{{ filteredInventory.length }} productos · máximo 15 por página</span><VPagination
                v-model="inventoryPage"
                :length="inventoryPageCount"
                :total-visible="5"
              />
            </div>
          </template>
        </VCardText>
      </VCard>
    </VWindowItem>

    <VWindowItem value="credit">
      <VCard
        class="kronos-card"
        rounded="xl"
      >
        <VCardText>
          <VTextField
            v-model="creditSearch"
            label="Buscar cliente o producto adeudado"
            prepend-inner-icon="ri-search-line"
            clearable
            class="mb-5"
          />
          <VCard
            v-if="groupedDebtAccounts.length"
            class="grouped-debt-panel mb-5"
            variant="outlined"
            rounded="lg"
          >
            <VCardItem
              title="Cobro conjunto"
              subtitle="Atletas con dos o más adeudos pendientes"
              prepend-icon="ri-stack-line"
            />
            <VCardText class="pt-0 d-flex flex-column ga-3">
              <div
                v-for="group in groupedDebtAccounts"
                :key="group.athleteId"
                class="grouped-debt-row"
              >
                <div>
                  <p class="font-weight-bold mb-1">
                    {{ group.athleteName }}
                  </p>
                  <p class="text-body-2 text-medium-emphasis mb-0">
                    {{ group.sales.length }} adeudos · {{ formatCurrency(group.total) }} pendientes
                  </p>
                </div>
                <VBtn
                  v-if="canCollect"
                  prepend-icon="ri-hand-coin-line"
                  @click="openGroupedPayment(group.sales)"
                >
                  Cobrar juntos
                </VBtn>
              </div>
            </VCardText>
          </VCard>
          <EmptyState
            v-if="!filteredCredit.length"
            icon="ri-checkbox-circle-line"
            title="Sin saldos pendientes"
            description="No hay coincidencias o todas las ventas están liquidadas."
          /><template v-else>
            <VTable class="text-no-wrap">
              <thead><tr><th>CLIENTE</th><th>FECHA</th><th>TOTAL</th><th>ABONADO</th><th>SALDO</th><th /></tr></thead><tbody>
                <tr
                  v-for="sale in paginatedCredit"
                  :key="sale.id"
                >
                  <td>{{ customerName(sale) }}</td><td>{{ formatDate(sale.createdAt) }}</td><td>{{ formatCurrency(sale.total) }}</td><td>{{ formatCurrency(saleAppliedAmount(sale)) }}</td><td><strong class="text-error">{{ formatCurrency(saleBalance(sale)) }}</strong></td><td class="d-flex ga-1">
                    <VMenu>
                      <template #activator="{ props }">
                        <VBtn
                          v-bind="props"
                          size="small"
                          variant="tonal"
                          prepend-icon="ri-receipt-line"
                        >
                          Recibos
                        </VBtn>
                      </template><VList>
                        <VListItem
                          title="Recibo de venta"
                          prepend-icon="ri-shopping-bag-3-line"
                          @click="showSaleReceipt(sale)"
                        /><VListItem
                          v-for="payment in salePayments(sale)"
                          :key="payment.id"
                          :title="`Abono ${formatCurrency(payment.amountApplied)}`"
                          :subtitle="formatDate(payment.appliedAt)"
                          prepend-icon="ri-hand-coin-line"
                          @click="showPaymentReceipt(sale, payment)"
                        />
                      </VList>
                    </VMenu><VBtn
                      v-if="canCollect"
                      size="small"
                      @click="openPayment(sale)"
                    >
                      Aplicar abono
                    </VBtn>
                  </td>
                </tr>
              </tbody>
            </VTable><div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-5">
              <span class="text-caption text-medium-emphasis">{{ filteredCredit.length }} deudas · máximo 15 por página</span><VPagination
                v-model="creditPage"
                :length="creditPageCount"
                :total-visible="5"
              />
            </div>
          </template>
        </VCardText>
      </VCard>

      <VCard
        class="kronos-card mt-5"
        rounded="xl"
      >
        <VCardItem
          title="Saldos a favor por atleta"
          :subtitle="`${creditAccounts.length} cuentas con movimientos`"
        />
        <VCardText>
          <EmptyState
            v-if="!creditAccounts.length"
            icon="ri-safe-2-line"
            title="Sin saldos a favor"
            description="Los excedentes que un atleta decida conservar aparecerán aquí."
          />
          <VTable v-else>
            <thead>
              <tr>
                <th>ATLETA</th><th class="text-right">
                  SALDO DISPONIBLE
                </th><th>ÚLTIMO MOVIMIENTO</th><th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="account in creditAccounts"
                :key="account.athleteId"
              >
                <td class="font-weight-bold">
                  {{ account.athleteName }}
                </td>
                <td class="text-right text-success font-weight-bold">
                  {{ formatCurrency(account.balance) }}
                </td>
                <td>{{ account.history[0] ? formatDate(account.history[0].occurredAt) : '—' }}</td>
                <td class="text-right">
                  <VMenu>
                    <template #activator="{ props }">
                      <VBtn
                        v-bind="props"
                        size="small"
                        variant="tonal"
                        prepend-icon="ri-history-line"
                      >
                        Historial
                      </VBtn>
                    </template>
                    <VList min-width="340">
                      <VListItem
                        v-for="entry in account.history"
                        :key="entry.id"
                        :title="`${creditEntryLabel(entry)} · ${formatCurrency(entry.amount)}`"
                        :subtitle="`${formatDate(entry.occurredAt)} · Saldo ${formatCurrency(entry.balanceAfter)}`"
                        :prepend-icon="entry.type === 'application' ? 'ri-subtract-line' : 'ri-add-line'"
                      />
                    </VList>
                  </VMenu>
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCardText>
      </VCard>

      <VCard
        class="kronos-card mt-5"
        rounded="xl"
      >
        <VCardItem
          title="Histórico de abonos en tienda"
          :subtitle="`${storePaymentHistory.length} movimientos recientes`"
        />
        <VCardText>
          <EmptyState
            v-if="!storePaymentHistory.length"
            icon="ri-hand-coin-line"
            title="Sin abonos registrados"
            description="Los pagos de ventas aparecerán aquí."
          />
          <VTable v-else>
            <thead>
              <tr>
                <th>CLIENTE</th><th>FECHA</th><th>MÉTODO</th><th class="text-right">
                  ABONO
                </th><th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in storePaymentHistory"
                :key="`${entry.sale.id}-${entry.payment.id}`"
              >
                <td>{{ customerName(entry.sale) }}</td>
                <td>{{ formatDate(entry.payment.appliedAt) }}</td>
                <td>{{ paymentMethodLabel(entry.payment.method) }}</td>
                <td class="text-right font-weight-bold text-success">
                  {{ formatCurrency(entry.amount) }}
                  <div
                    v-if="entry.payment.groupPaymentId"
                    class="text-caption text-medium-emphasis"
                  >
                    Cobro conjunto
                  </div>
                </td>
                <td class="text-right">
                  <VBtn
                    icon="ri-receipt-line"
                    variant="text"
                    title="Generar recibo"
                    @click="showPaymentReceipt(entry.sale, entry.payment)"
                  />
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCardText>
      </VCard>
    </VWindowItem>

    <VWindowItem value="sales">
      <VCard
        class="kronos-card"
        rounded="xl"
      >
        <VCardText>
          <VRow class="mb-2">
            <VCol
              cols="12"
              md="8"
            >
              <VTextField
                v-model="salesSearch"
                label="Buscar cliente o producto"
                prepend-inner-icon="ri-search-line"
                clearable
              />
            </VCol><VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="salesStatusFilter"
                :items="[{title:'Pagada',value:'paid'},{title:'Crédito',value:'credit'},{title:'Cancelada',value:'cancelled'}]"
                label="Estado"
                clearable
              />
            </VCol>
          </VRow><EmptyState
            v-if="!filteredSales.length"
            icon="ri-receipt-line"
            title="Sin ventas"
            description="No hay ventas que coincidan con los filtros."
          /><template v-else>
            <VTable class="text-no-wrap">
              <thead><tr><th>FECHA</th><th>CLIENTE</th><th>TOTAL</th><th>ESTADO</th><th /></tr></thead><tbody>
                <tr
                  v-for="sale in paginatedSales"
                  :key="sale.id"
                >
                  <td>{{ formatDate(sale.createdAt) }}</td><td>
                    {{ customerName(sale) }}
                    <div v-if="sale.source === 'kiosk'">
                      <VChip
                        class="mt-1"
                        size="x-small"
                        color="secondary"
                        variant="tonal"
                      >
                        Kiosco
                      </VChip>
                    </div>
                  </td><td>{{ formatCurrency(sale.total) }}</td><td>
                    <VChip
                      size="small"
                      :color="sale.status === 'paid' ? 'success' : sale.status === 'credit' ? 'warning' : 'error'"
                    >
                      {{ sale.status === 'paid' ? 'Pagada' : sale.status === 'credit' ? 'Crédito' : 'Cancelada' }}
                    </VChip>
                  </td><td>
                    <VMenu>
                      <template #activator="{ props }">
                        <VBtn
                          v-bind="props"
                          icon="ri-receipt-line"
                          variant="text"
                          title="Recibos"
                        />
                      </template><VList>
                        <VListItem
                          title="Recibo de venta"
                          prepend-icon="ri-shopping-bag-3-line"
                          @click="showSaleReceipt(sale)"
                        /><VListItem
                          v-for="payment in salePayments(sale)"
                          :key="payment.id"
                          :title="`Abono ${formatCurrency(payment.amountApplied)}`"
                          :subtitle="formatDate(payment.appliedAt)"
                          prepend-icon="ri-hand-coin-line"
                          @click="showPaymentReceipt(sale, payment)"
                        />
                      </VList>
                    </VMenu><VBtn
                      v-if="canCancelSales && sale.status !== 'cancelled'"
                      icon="ri-close-circle-line"
                      color="error"
                      variant="text"
                      title="Cancelar venta"
                      @click="cancelSale(sale)"
                    />
                  </td>
                </tr>
              </tbody>
            </VTable><div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-5">
              <span class="text-caption text-medium-emphasis">{{ filteredSales.length }} ventas · máximo 15 por página</span><VPagination
                v-model="salesPage"
                :length="salesPageCount"
                :total-visible="5"
              />
            </div>
          </template>
        </VCardText>
      </VCard>
    </VWindowItem>
  </VWindow>

  <VDialog
    v-model="productDialog"
    max-width="820"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        :title="editingProduct ? 'Editar producto' : 'Nuevo producto'"
        subtitle="Información comercial, existencias y nivel de alerta."
      /><VCardText class="pa-6">
        <VRow>
          <VCol
            cols="12"
            md="7"
          >
            <VTextField
              v-model="productForm.name"
              label="Nombre"
            />
          </VCol><VCol
            cols="12"
            md="5"
          >
            <VTextField
              v-model="productForm.category"
              label="Categoría"
            />
          </VCol><VCol cols="12">
            <VTextField
              v-model="productForm.barcode"
              label="Código principal"
              hint="Debe corresponder exactamente a esta variante y precio."
              persistent-hint
              prepend-inner-icon="ri-barcode-line"
            >
              <template #append>
                <VBtn
                  icon="ri-camera-line"
                  variant="text"
                  aria-label="Escanear código de barras"
                  @click="openBarcodeScanner('primary')"
                />
                <VBtn
                  v-if="productForm.barcode"
                  icon="ri-printer-line"
                  variant="text"
                  aria-label="Imprimir etiqueta del código principal"
                  @click="openBarcodeLabel(normalizeProductBarcode(productForm.barcode))"
                />
              </template>
            </VTextField>
          </VCol><VCol cols="12">
            <VAlert
              color="secondary"
              variant="tonal"
              class="mb-4"
            >
              Usa varios códigos únicamente cuando todos representan el mismo producto, variante, precio e inventario. Para otro tamaño o precio, crea otro producto.
            </VAlert>
            <div class="d-flex flex-wrap ga-3 align-start">
              <VTextField
                v-model="alternativeBarcodeInput"
                class="flex-grow-1"
                label="Código alternativo"
                hint="Ejemplo: otro empaque del mismo producto exacto"
                persistent-hint
                prepend-inner-icon="ri-barcode-line"
                @keyup.enter="addAlternativeBarcode"
              />
              <VBtn
                height="56"
                variant="tonal"
                icon="ri-camera-line"
                aria-label="Escanear código alternativo"
                @click="openBarcodeScanner('alternative')"
              />
              <VBtn
                height="56"
                variant="tonal"
                prepend-icon="ri-add-line"
                @click="addAlternativeBarcode"
              >
                Agregar
              </VBtn>
            </div>
            <div
              v-if="productForm.alternativeBarcodes.length"
              class="d-flex flex-wrap ga-2 mt-2"
            >
              <VChip
                v-for="code in productForm.alternativeBarcodes"
                :key="code"
                closable
                color="secondary"
                variant="tonal"
                @click:close="removeAlternativeBarcode(code)"
              >
                {{ code }}
                <VBtn
                  class="ms-1"
                  icon="ri-printer-line"
                  size="x-small"
                  variant="text"
                  aria-label="Imprimir etiqueta"
                  @click.stop="openBarcodeLabel(code)"
                />
              </VChip>
            </div>
            <VBtn
              class="mt-4"
              variant="outlined"
              prepend-icon="ri-barcode-box-line"
              @click="createInternalBarcode"
            >
              Generar código interno y etiqueta
            </VBtn>
          </VCol><VCol
            cols="12"
            md="4"
          >
            <VTextField
              v-model="productForm.size"
              label="Talla / variante"
            />
          </VCol><VCol
            cols="12"
            md="4"
          >
            <VTextField
              v-model.number="productForm.stock"
              type="number"
              min="0"
              label="Stock"
            />
          </VCol><VCol
            cols="12"
            md="4"
          >
            <VTextField
              v-model.number="productForm.alertLevel"
              type="number"
              min="0"
              label="Alerta"
              hint="Avisar al llegar a esta cantidad"
              persistent-hint
            />
          </VCol><VCol
            cols="12"
            md="6"
          >
            <VTextField
              v-model.number="productForm.unitCost"
              type="number"
              min="0"
              label="Costo"
              prefix="$"
            />
          </VCol><VCol
            cols="12"
            md="6"
          >
            <VTextField
              v-model.number="productForm.salePrice"
              type="number"
              min="0"
              label="Precio"
              prefix="$"
            />
          </VCol>
        </VRow>
      </VCardText><VCardActions class="pa-6 pt-0">
        <VSpacer /><VBtn
          variant="text"
          @click="productDialog=false"
        >
          Cancelar
        </VBtn><VBtn
          :loading="saving"
          @click="saveProduct"
        >
          Guardar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <VDialog
    v-model="barcodeDialog"
    max-width="680"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        :title="barcodeScanTarget === 'pos' ? 'Leer producto para venta' : 'Escanear código de barras'"
        :subtitle="barcodeScanTarget === 'pos' ? 'Centra el código; el producto exacto se agregará al carrito.' : 'Centra el código dentro del recuadro.'"
      />
      <VCardText class="pa-6">
        <BarcodeScanner
          :active="barcodeDialog"
          @detected="useScannedBarcode"
        />
      </VCardText>
      <VCardActions class="pa-6 pt-0">
        <VSpacer />
        <VBtn
          variant="text"
          @click="barcodeDialog = false"
        >
          Cancelar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <VDialog
    v-model="stockDialog"
    max-width="430"
  >
    <VCard rounded="xl">
      <VCardTitle class="pa-6">
        Entrada de inventario
      </VCardTitle><VCardText>
        <p class="mb-4">
          {{ stockForm.product?.name }}
        </p><VTextField
          v-model.number="stockForm.quantity"
          type="number"
          min="1"
          label="Unidades a agregar"
        />
      </VCardText><VCardActions class="pa-6 pt-0">
        <VSpacer /><VBtn
          variant="text"
          @click="stockDialog=false"
        >
          Cancelar
        </VBtn><VBtn
          :loading="saving"
          @click="saveStock"
        >
          Aplicar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <VDialog
    v-model="paymentDialog"
    max-width="600"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        :title="isGroupedPayment ? 'Cobrar adeudos juntos' : 'Aplicar abono'"
        :subtitle="isGroupedPayment ? (athletes.items.find(athlete => athlete.id === paymentAthleteId)?.profile.name ?? 'Atleta') : paymentForm.sale ? customerName(paymentForm.sale) : 'Venta pendiente'"
      />
      <VCardText class="pa-6 d-flex flex-column ga-5">
        <VAlert
          type="info"
          variant="tonal"
        >
          {{ isGroupedPayment ? `${groupedPaymentSales.length} adeudos · Total conjunto:` : 'Saldo actual:' }} {{ formatCurrency(paymentBalance) }}
        </VAlert>
        <div
          v-if="isGroupedPayment"
          class="grouped-payment-detail"
        >
          <div
            v-for="sale in groupedPaymentSales"
            :key="sale.id"
            class="d-flex justify-space-between align-start ga-4"
          >
            <div>
              <p class="text-body-2 font-weight-medium mb-0">
                {{ Object.values(sale.items ?? {}).map(item => `${item.quantity} × ${item.name}`).join(', ') }}
              </p>
              <p class="text-caption text-medium-emphasis mb-0">
                {{ formatDate(sale.createdAt) }}
              </p>
            </div>
            <strong class="text-no-wrap">{{ formatCurrency(saleBalance(sale)) }}</strong>
          </div>
        </div>
        <VTextField
          v-model.number="paymentForm.amount"
          type="number"
          min="0.01"
          :max="paymentBalance"
          step="0.01"
          :label="isGroupedPayment ? 'Total a cobrar' : 'Abono que se aplicará'"
          prefix="$"
          :readonly="isGroupedPayment"
          :hint="isGroupedPayment ? 'El cobro liquidará todos los adeudos mostrados.' : 'Este monto se descontará del saldo pendiente.'"
          persistent-hint
        />
        <VSelect
          v-model="paymentForm.method"
          :items="[{title:'Efectivo',value:'cash'},{title:'Transferencia',value:'transfer'},{title:'Tarjeta',value:'card'},{title:'Otro',value:'other'}]"
          label="Método"
        />
        <VTextField
          v-if="paymentForm.method === 'cash'"
          v-model.number="paymentForm.received"
          type="number"
          min="0"
          step="0.01"
          label="Efectivo recibido"
          prefix="$"
          hint="Monto que entregó el cliente; debe ser igual o mayor al abono."
          persistent-hint
        />
        <VAlert
          v-if="paymentForm.amount > 0 && paymentForm.amount <= paymentBalance && (paymentForm.method !== 'cash' || paymentForm.received >= paymentForm.amount)"
          color="secondary"
          variant="tonal"
        >
          Después del abono quedarán {{ formatCurrency(paymentRemaining) }} pendientes.
        </VAlert>
        <VSwitch
          v-if="paymentAthleteId && paymentExcess > 0 && paymentForm.amount >= paymentBalance"
          v-model="paymentForm.saveExcessAsCredit"
          color="secondary"
          hide-details
          label="Guardar excedente como saldo a favor"
        />
        <VAlert
          v-if="paymentCreditDeposit > 0"
          color="success"
          variant="tonal"
        >
          Se guardarán {{ formatCurrency(paymentCreditDeposit) }} como saldo a favor.
        </VAlert>
        <VAlert
          v-else-if="paymentChange > 0"
          color="warning"
          variant="tonal"
        >
          Cambio a entregar: {{ formatCurrency(paymentChange) }}
        </VAlert>
      </VCardText>
      <VCardActions class="pa-6 pt-0">
        <VSpacer /><VBtn
          variant="text"
          @click="paymentDialog=false"
        >
          Cancelar
        </VBtn><VBtn
          :loading="saving"
          @click="applyPayment"
        >
          {{ isGroupedPayment ? 'Cobrar adeudos' : 'Aplicar abono' }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <ReceiptDialog
    v-model="receiptDialog"
    :receipt="activeReceipt"
  />
  <ProductBarcodeLabelDialog
    v-model="barcodeLabelDialog"
    :name="barcodeLabel.name"
    :variant="barcodeLabel.variant"
    :price="barcodeLabel.price"
    :code="barcodeLabel.code"
    @error="notifications.show($event, 'error')"
  />
</template>

<style scoped>
.pos-product-controls {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(96px, 112px) minmax(104px, 120px) minmax(148px, 172px);
  gap: 16px;
  align-items: start;
  margin-block-end: 24px;
}

.pos-product-controls .v-btn {
  min-inline-size: 0;
  white-space: nowrap;
}

.pos-cart-empty {
  inline-size: 100%;
}

.grouped-debt-panel {
  border-color: rgba(151, 213, 222, 0.28);
}

.grouped-debt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(151, 213, 222, 0.16);
  border-radius: 14px;
  background: rgba(151, 213, 222, 0.05);
}

.grouped-payment-detail {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(151, 213, 222, 0.18);
  border-radius: 14px;
}

@media (max-width: 600px) {
  .grouped-debt-row {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (max-width: 700px) {
  .pos-product-controls {
    grid-template-columns: minmax(0, 1fr) minmax(132px, 160px);
  }
}

@media (max-width: 480px) {
  .pos-product-controls {
    grid-template-columns: 1fr;
  }
}
</style>
