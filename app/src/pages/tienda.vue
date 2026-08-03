<script setup lang="ts">
import PageHeader from '@/components/kronos/PageHeader.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import EmptyState from '@/components/kronos/EmptyState.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import { useCommerceStore } from '@/stores/commerce'
import { useAthletesStore } from '@/stores/athletes'
import { useNotificationsStore } from '@/stores/notifications'
import type { PaymentMethod, Product, Sale, SaleItem, SalePayment } from '@/types/domain'
import { buildSalePaymentReceipt, buildSaleReceipt, type ReceiptData } from '@/utils/receipts'
import { formatCurrency, formatDate, saleAppliedAmount, saleBalance, timestampValue } from '@/utils/kronos'

const commerce = useCommerceStore()
const athletes = useAthletesStore()
const notifications = useNotificationsStore()
const route = useRoute()
const tab = ref('pos')
const saving = ref(false)
const productDialog = ref(false)
const stockDialog = ref(false)
const paymentDialog = ref(false)
const receiptDialog = ref(false)
const activeReceipt = ref<ReceiptData | null>(null)
const editingProduct = ref<Product | null>(null)
const selectedProductId = ref('')
const selectedQuantity = ref(1)
const cart = ref<Record<string, SaleItem>>({})
const saleForm = reactive({ athleteId: '', customerName: '', method: 'cash' as PaymentMethod, initialPayment: 0 })
const productForm = reactive({ name: '', category: '', size: '', stock: 0, alertLevel: 2, unitCost: 0, salePrice: 0, status: 'active' as const })
const stockForm = reactive({ product: null as Product | null, quantity: 1 })
const paymentForm = reactive({ sale: null as Sale | null, amount: 0, method: 'cash' as PaymentMethod, received: 0 })

const activeProducts = computed(() => commerce.products.filter(item => item.status === 'active'))
const cartItems = computed(() => Object.values(cart.value))
const cartTotal = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))
const inventoryValue = computed(() => commerce.products.reduce((sum, item) => sum + item.stock * item.unitCost, 0))
const outstanding = computed(() => commerce.openCredit.reduce((sum, sale) => sum + saleBalance(sale), 0))
const recentSales = computed(() => [...commerce.sales].sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt)).slice(0, 20))
const customerName = (sale: Sale) => athletes.items.find(item => item.id === sale.athleteId)?.profile.name ?? sale.customerName
const athleteForSale = (sale: Sale) => athletes.items.find(item => item.id === sale.athleteId)
const salePayments = (sale: Sale) => Object.values(sale.payments ?? {}).sort((a, b) => timestampValue(b.appliedAt) - timestampValue(a.appliedAt))

function showSaleReceipt(sale: Sale) {
  activeReceipt.value = buildSaleReceipt(sale, athleteForSale(sale))
  receiptDialog.value = true
}

function showPaymentReceipt(sale: Sale, payment: SalePayment) {
  activeReceipt.value = buildSalePaymentReceipt(sale, payment, athleteForSale(sale))
  receiptDialog.value = true
}

watch(() => route.query.tab, requestedTab => {
  if (requestedTab === 'credit' || requestedTab === 'inventory' || requestedTab === 'sales' || requestedTab === 'pos')
    tab.value = requestedTab
}, { immediate: true })

watch(() => saleForm.athleteId, id => {
  if (id)
    saleForm.customerName = athletes.items.find(item => item.id === id)?.profile.name ?? ''
})
watch(cartTotal, total => {
  if (saleForm.initialPayment > total)
    saleForm.initialPayment = total
})

function addToCart() {
  const product = commerce.products.find(item => item.id === selectedProductId.value)
  const quantity = Number(selectedQuantity.value)
  const already = cart.value[product?.id ?? '']?.quantity ?? 0
  if (!product || quantity <= 0 || quantity + already > product.stock) {
    notifications.show('Selecciona un producto y una cantidad disponible.', 'warning')
    return
  }
  cart.value[product.id] = { productId: product.id, name: product.name, quantity: quantity + already, unitPrice: product.salePrice, unitCost: product.unitCost }
  selectedProductId.value = ''
  selectedQuantity.value = 1
}

function removeFromCart(id: string) {
  const next = { ...cart.value }
  delete next[id]
  cart.value = next
}

async function completeSale() {
  const total = cartTotal.value
  const initialPayment = Number(saleForm.initialPayment)
  if (!cartItems.value.length || !saleForm.customerName.trim() || initialPayment < 0 || initialPayment > total) {
    notifications.show('Agrega productos, cliente y un pago válido.', 'warning')
    return
  }
  saving.value = true
  try {
    const createdAt = Date.now()
    const paymentId = `initial-${createdAt}`
    const payments = initialPayment > 0 ? { [paymentId]: { id: paymentId, amountApplied: initialPayment, method: saleForm.method, receivedAmount: initialPayment, changeGiven: 0, appliedAt: createdAt } } : {}
    const salePayload = {
      athleteId: saleForm.athleteId || null,
      customerName: saleForm.customerName.trim(),
      items: cart.value,
      total,
      status: initialPayment >= total ? 'paid' : 'credit',
      payments,
    } as const
    const saleId = await commerce.createSale(salePayload)
    const createdSale: Sale = { ...salePayload, id: saleId, createdAt, updatedAt: createdAt }
    notifications.show(initialPayment >= total ? 'Venta cobrada y existencias actualizadas.' : 'Venta a crédito registrada.')
    showSaleReceipt(createdSale)
    cart.value = {}
    Object.assign(saleForm, { athleteId: '', customerName: '', method: 'cash', initialPayment: 0 })
  }
  catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No se pudo completar la venta.', 'error')
  }
  finally { saving.value = false }
}

function openProduct(product?: Product) {
  editingProduct.value = product ?? null
  Object.assign(productForm, product ? { name: product.name, category: product.category, size: product.size ?? '', stock: product.stock, alertLevel: product.alertLevel, unitCost: product.unitCost, salePrice: product.salePrice, status: product.status } : { name: '', category: '', size: '', stock: 0, alertLevel: 2, unitCost: 0, salePrice: 0, status: 'active' })
  productDialog.value = true
}

async function saveProduct() {
  if (!productForm.name.trim() || !productForm.category.trim() || productForm.stock < 0 || productForm.unitCost < 0 || productForm.salePrice < 0) {
    notifications.show('Completa los datos del producto con valores válidos.', 'warning')
    return
  }
  saving.value = true
  try {
    const payload = { ...productForm, name: productForm.name.trim(), category: productForm.category.trim(), size: productForm.size.trim() || null, stock: Number(productForm.stock), alertLevel: Number(productForm.alertLevel), unitCost: Number(productForm.unitCost), salePrice: Number(productForm.salePrice) }
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

function openStock(product: Product) { stockForm.product = product; stockForm.quantity = 1; stockDialog.value = true }
async function saveStock() {
  if (!stockForm.product || Number(stockForm.quantity) <= 0)
    return notifications.show('La entrada debe ser mayor a cero.', 'warning')
  saving.value = true
  try { await commerce.addStock(stockForm.product.id, Number(stockForm.quantity)); notifications.show('Existencia actualizada.'); stockDialog.value = false }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo actualizar.', 'error') }
  finally { saving.value = false }
}

function openPayment(sale: Sale) { paymentForm.sale = sale; paymentForm.amount = saleBalance(sale); paymentForm.received = saleBalance(sale); paymentForm.method = 'cash'; paymentDialog.value = true }
async function applyPayment() {
  const sale = paymentForm.sale
  const amount = Number(paymentForm.amount)
  if (!sale || amount <= 0 || amount > saleBalance(sale))
    return notifications.show('El abono excede el saldo o no es válido.', 'warning')
  saving.value = true
  try {
    const result = await commerce.addPayment(sale.id, amount, paymentForm.method, Number(paymentForm.received || amount), Math.max(0, Number(paymentForm.received || amount) - amount))
    notifications.show('Abono aplicado al saldo correcto.')
    paymentDialog.value = false
    showPaymentReceipt(result.sale, result.payment)
  }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo aplicar el abono.', 'error') }
  finally { saving.value = false }
}

async function cancelSale(sale: Sale) {
  if (!confirm(`¿Cancelar la venta de ${customerName(sale)} y devolver existencias?`)) return
  try { await commerce.cancelSale(sale.id); notifications.show('Venta cancelada e inventario restituido.', 'info') }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo cancelar.', 'error') }
}

onMounted(() => { commerce.subscribe(); athletes.subscribe() })
onUnmounted(() => { commerce.dispose(); athletes.dispose() })
</script>

<template>
  <PageHeader title="Tienda" eyebrow="Comercio" description="Punto de venta, inventario y cuentas por cobrar sin duplicar ingresos.">
    <template #actions><VBtn variant="tonal" prepend-icon="ri-add-box-line" @click="openProduct()">Nuevo producto</VBtn></template>
  </PageHeader>
  <VRow class="mb-2"><VCol cols="12" md="4"><MetricCard label="Valor de inventario" :value="formatCurrency(inventoryValue)" icon="ri-archive-stack-line" /></VCol><VCol cols="12" md="4"><MetricCard label="Stock bajo" :value="commerce.lowStock.length" icon="ri-alarm-warning-line" color="warning" /></VCol><VCol cols="12" md="4"><MetricCard label="Por cobrar" :value="formatCurrency(outstanding)" icon="ri-hand-coin-line" color="error" /></VCol></VRow>

  <VTabs v-model="tab" class="mb-5"><VTab value="pos">Punto de venta</VTab><VTab value="inventory">Inventario</VTab><VTab value="credit">Deudas y abonos</VTab><VTab value="sales">Ventas</VTab></VTabs>

  <VWindow v-model="tab">
    <VWindowItem value="pos">
      <VRow>
        <VCol cols="12" lg="7">
          <VCard class="kronos-card" rounded="xl">
            <VCardTitle class="pa-6">Armar venta</VCardTitle>
            <VCardText>
              <VRow>
                <VCol cols="12" md="7"><VAutocomplete v-model="selectedProductId" :items="activeProducts" item-title="name" item-value="id" label="Buscar producto" prepend-inner-icon="ri-search-line" :item-props="item => ({ subtitle: `${item.stock} disponibles · ${formatCurrency(item.salePrice)}` })" clearable auto-select-first /></VCol>
                <VCol cols="6" md="2"><VTextField v-model.number="selectedQuantity" type="number" min="1" label="Cantidad" /></VCol>
                <VCol cols="6" md="3"><VBtn block height="56" variant="tonal" @click="addToCart">Agregar</VBtn></VCol>
              </VRow>
              <VTable v-if="cartItems.length"><thead><tr><th>PRODUCTO</th><th>CANT.</th><th>IMPORTE</th><th></th></tr></thead><tbody><tr v-for="item in cartItems" :key="item.productId"><td>{{ item.name }}</td><td>{{ item.quantity }}</td><td>{{ formatCurrency(item.quantity * item.unitPrice) }}</td><td><VBtn icon="ri-close-line" variant="text" size="small" @click="removeFromCart(item.productId)" /></td></tr></tbody></VTable>
              <EmptyState v-else icon="ri-shopping-basket-line" title="Carrito vacío" description="Selecciona productos disponibles para iniciar." />
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="12" lg="5">
          <VCard class="kronos-card checkout-card pa-6" rounded="xl">
            <p class="text-overline text-kronos-cyan mb-1">Cobro</p>
            <p class="text-h3 font-weight-bold mb-7">{{ formatCurrency(cartTotal) }}</p>
            <div class="d-flex flex-column ga-5">
              <VAutocomplete v-model="saleForm.athleteId" :items="athletes.sorted" item-title="profile.name" item-value="id" label="Buscar atleta (opcional)" prepend-inner-icon="ri-search-line" clearable auto-select-first />
              <VTextField v-model="saleForm.customerName" label="Nombre del cliente" />
              <VSelect v-model="saleForm.method" :items="[{title:'Efectivo',value:'cash'},{title:'Transferencia',value:'transfer'},{title:'Tarjeta',value:'card'},{title:'Otro',value:'other'}]" label="Método" />
              <VTextField v-model.number="saleForm.initialPayment" type="number" min="0" :max="cartTotal" label="Pago inicial" prefix="$" />
              <VAlert v-if="saleForm.initialPayment < cartTotal" type="info" variant="tonal">Saldo a crédito: {{ formatCurrency(cartTotal - saleForm.initialPayment) }}</VAlert>
              <VBtn block size="large" :loading="saving" :disabled="!cartItems.length" @click="completeSale">Completar venta</VBtn>
            </div>
          </VCard>
        </VCol>
      </VRow>
    </VWindowItem>

    <VWindowItem value="inventory"><VCard class="kronos-card" rounded="xl"><VTable v-if="commerce.products.length" class="text-no-wrap"><thead><tr><th>PRODUCTO</th><th>CATEGORÍA</th><th>STOCK</th><th>COSTO</th><th>PRECIO</th><th></th></tr></thead><tbody><tr v-for="product in commerce.products" :key="product.id"><td><strong>{{ product.name }}</strong><div class="text-caption text-medium-emphasis">{{ product.size || 'Sin talla' }}</div></td><td>{{ product.category }}</td><td><VChip size="small" :color="product.stock <= product.alertLevel ? 'warning' : 'success'">{{ product.stock }}</VChip></td><td>{{ formatCurrency(product.unitCost) }}</td><td>{{ formatCurrency(product.salePrice) }}</td><td class="text-end"><VBtn icon="ri-add-box-line" variant="text" @click="openStock(product)" /><VBtn icon="ri-edit-line" variant="text" @click="openProduct(product)" /></td></tr></tbody></VTable><EmptyState v-else icon="ri-archive-line" title="Sin inventario" description="Crea el primer producto de la tienda." /></VCard></VWindowItem>

    <VWindowItem value="credit"><VCard class="kronos-card" rounded="xl"><VTable v-if="commerce.openCredit.length" class="text-no-wrap"><thead><tr><th>CLIENTE</th><th>FECHA</th><th>TOTAL</th><th>ABONADO</th><th>SALDO</th><th></th></tr></thead><tbody><tr v-for="sale in commerce.openCredit" :key="sale.id"><td>{{ customerName(sale) }}</td><td>{{ formatDate(sale.createdAt) }}</td><td>{{ formatCurrency(sale.total) }}</td><td>{{ formatCurrency(saleAppliedAmount(sale)) }}</td><td><strong class="text-error">{{ formatCurrency(saleBalance(sale)) }}</strong></td><td class="d-flex ga-1"><VMenu><template #activator="{ props }"><VBtn v-bind="props" size="small" variant="tonal" prepend-icon="ri-receipt-line">Recibos</VBtn></template><VList><VListItem title="Recibo de venta" prepend-icon="ri-shopping-bag-3-line" @click="showSaleReceipt(sale)" /><VListItem v-for="payment in salePayments(sale)" :key="payment.id" :title="`Abono ${formatCurrency(payment.amountApplied)}`" :subtitle="formatDate(payment.appliedAt)" prepend-icon="ri-hand-coin-line" @click="showPaymentReceipt(sale, payment)" /></VList></VMenu><VBtn size="small" @click="openPayment(sale)">Aplicar abono</VBtn></td></tr></tbody></VTable><EmptyState v-else icon="ri-checkbox-circle-line" title="Sin saldos pendientes" description="Todas las ventas registradas están liquidadas." /></VCard></VWindowItem>

    <VWindowItem value="sales"><VCard class="kronos-card" rounded="xl"><VTable v-if="recentSales.length" class="text-no-wrap"><thead><tr><th>FECHA</th><th>CLIENTE</th><th>TOTAL</th><th>ESTADO</th><th></th></tr></thead><tbody><tr v-for="sale in recentSales" :key="sale.id"><td>{{ formatDate(sale.createdAt) }}</td><td>{{ customerName(sale) }}</td><td>{{ formatCurrency(sale.total) }}</td><td><VChip size="small" :color="sale.status === 'paid' ? 'success' : sale.status === 'credit' ? 'warning' : 'error'">{{ sale.status === 'paid' ? 'Pagada' : sale.status === 'credit' ? 'Crédito' : 'Cancelada' }}</VChip></td><td><VMenu><template #activator="{ props }"><VBtn v-bind="props" icon="ri-receipt-line" variant="text" title="Recibos" /></template><VList><VListItem title="Recibo de venta" prepend-icon="ri-shopping-bag-3-line" @click="showSaleReceipt(sale)" /><VListItem v-for="payment in salePayments(sale)" :key="payment.id" :title="`Abono ${formatCurrency(payment.amountApplied)}`" :subtitle="formatDate(payment.appliedAt)" prepend-icon="ri-hand-coin-line" @click="showPaymentReceipt(sale, payment)" /></VList></VMenu><VBtn v-if="sale.status !== 'cancelled'" icon="ri-close-circle-line" color="error" variant="text" @click="cancelSale(sale)" /></td></tr></tbody></VTable><EmptyState v-else icon="ri-receipt-line" title="Sin ventas" description="Las ventas completadas aparecerán aquí." /></VCard></VWindowItem>
  </VWindow>

  <VDialog v-model="productDialog" max-width="650"><VCard rounded="xl"><VCardTitle class="pa-6">{{ editingProduct ? 'Editar producto' : 'Nuevo producto' }}</VCardTitle><VCardText><VRow><VCol cols="12" md="7"><VTextField v-model="productForm.name" label="Nombre" /></VCol><VCol cols="12" md="5"><VTextField v-model="productForm.category" label="Categoría" /></VCol><VCol cols="12" md="4"><VTextField v-model="productForm.size" label="Talla / variante" /></VCol><VCol cols="12" md="4"><VTextField v-model.number="productForm.stock" type="number" min="0" label="Stock" /></VCol><VCol cols="12" md="4"><VTextField v-model.number="productForm.alertLevel" type="number" min="0" label="Alerta" /></VCol><VCol cols="12" md="6"><VTextField v-model.number="productForm.unitCost" type="number" min="0" label="Costo" prefix="$" /></VCol><VCol cols="12" md="6"><VTextField v-model.number="productForm.salePrice" type="number" min="0" label="Precio" prefix="$" /></VCol></VRow></VCardText><VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="productDialog=false">Cancelar</VBtn><VBtn :loading="saving" @click="saveProduct">Guardar</VBtn></VCardActions></VCard></VDialog>
  <VDialog v-model="stockDialog" max-width="430"><VCard rounded="xl"><VCardTitle class="pa-6">Entrada de inventario</VCardTitle><VCardText><p class="mb-4">{{ stockForm.product?.name }}</p><VTextField v-model.number="stockForm.quantity" type="number" min="1" label="Unidades a agregar" /></VCardText><VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="stockDialog=false">Cancelar</VBtn><VBtn :loading="saving" @click="saveStock">Aplicar</VBtn></VCardActions></VCard></VDialog>
  <VDialog v-model="paymentDialog" max-width="480"><VCard rounded="xl"><VCardTitle class="pa-6">Aplicar abono</VCardTitle><VCardText><VAlert type="info" variant="tonal" class="mb-5">Saldo actual: {{ formatCurrency(paymentForm.sale ? saleBalance(paymentForm.sale) : 0) }}</VAlert><VTextField v-model.number="paymentForm.amount" type="number" min="0" label="Monto aplicado" prefix="$" /><VSelect v-model="paymentForm.method" :items="[{title:'Efectivo',value:'cash'},{title:'Transferencia',value:'transfer'},{title:'Tarjeta',value:'card'},{title:'Otro',value:'other'}]" label="Método" /><VTextField v-if="paymentForm.method === 'cash'" v-model.number="paymentForm.received" type="number" min="0" label="Efectivo recibido" prefix="$" /></VCardText><VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="paymentDialog=false">Cancelar</VBtn><VBtn :loading="saving" @click="applyPayment">Aplicar</VBtn></VCardActions></VCard></VDialog>
  <ReceiptDialog v-model="receiptDialog" :receipt="activeReceipt" />
</template>
