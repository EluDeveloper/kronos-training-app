<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import BarcodeScanner from '@/components/kronos/BarcodeScanner.vue'
import { useAthletesStore } from '@/stores/athletes'
import { useCommerceStore } from '@/stores/commerce'
import { useKioskSettingsStore } from '@/stores/kiosk-settings'
import { useSessionStore } from '@/stores/session'
import { kioskSettingsService } from '@/services/kiosk-settings.service'
import { usersService } from '@/services/users.service'
import type { Athlete, PaymentMethod, Product, SaleItem } from '@/types/domain'
import { parseKioskCodePayload } from '@/utils/kiosk-code'
import { formatCurrency } from '@/utils/kronos'
import { productBarcodes, productHasBarcode } from '@/utils/product-barcodes'
import { isKioskPaymentNowAllowed, KIOSK_SUCCESS_RESET_MS } from '@/utils/store-kiosk'

type KioskStep = 'shopping' | 'identify' | 'payment' | 'success'

const athletes = useAthletesStore()
const commerce = useCommerceStore()
const kioskSettings = useKioskSettingsStore()
const session = useSessionStore()
const router = useRouter()
const step = ref<KioskStep>('shopping')
const cart = ref<Record<string, SaleItem>>({})
const manualProductId = ref('')
const manualProductDialog = ref(false)
const manualAdminEmail = ref('')
const manualAdminPassword = ref('')
const showManualAdminPassword = ref(false)
const cameraEnabled = ref(true)
const athleteScannerEnabled = ref(false)
const athleteCodeInput = ref<{ focus: () => void } | null>(null)
const athleteCode = ref('')
const selectedAthlete = ref<Athlete | null>(null)
const saving = ref(false)
const paymentDialog = ref(false)
const exitDialog = ref(false)
const showPaymentPassword = ref(false)
const showExitPassword = ref(false)
const paymentMethod = ref<PaymentMethod>('cash')
const receivedAmount = ref(0)
const paymentEmail = ref('')
const paymentPassword = ref('')
const exitEmail = ref('')
const exitPassword = ref('')
const exitAuthorized = ref(false)
const feedback = reactive({ visible: false, message: '', color: 'info' })
const completedSale = ref<{ customerName: string; total: number; paid: boolean; saleId: string } | null>(null)
let resetTimer: number | null = null
let successTimer: number | null = null

const cartItems = computed(() => Object.values(cart.value))
const cartTotal = computed(() => cartItems.value.reduce((total, item) => total + item.quantity * item.unitPrice, 0))
const itemCount = computed(() => cartItems.value.reduce((total, item) => total + item.quantity, 0))
const changeAmount = computed(() => paymentMethod.value === 'cash' ? Math.max(0, Number(receivedAmount.value || 0) - cartTotal.value) : 0)
const productsWithBarcode = computed(() => commerce.products.filter(product => product.status === 'active' && productBarcodes(product).length))

const paymentNowAvailable = computed(() => kioskSettings.loaded
  && !kioskSettings.error
  && isKioskPaymentNowAllowed(kioskSettings.settings, session.profile))

const manualProductItems = computed(() => commerce.products
  .filter(product => product.status === 'active')
  .map(product => ({
    title: product.size ? `${product.name} · ${product.size}` : product.name,
    value: product.id,
    subtitle: `${product.stock} disponibles · ${formatCurrency(product.salePrice)} · ${productBarcodes(product).length ? `${productBarcodes(product).length} código(s)` : 'Sin código'}`,
  })))

function showFeedback(message: string, color: 'success' | 'warning' | 'error' | 'info' = 'info') {
  feedback.message = message
  feedback.color = color
  feedback.visible = true
}

function productStock(productId: string) {
  return commerce.products.find(product => product.id === productId)?.stock ?? 0
}

function addProduct(product: Product) {
  const currentQuantity = cart.value[product.id]?.quantity ?? 0
  if (currentQuantity >= product.stock) {
    showFeedback(`Ya agregaste todas las existencias disponibles de ${product.name}.`, 'warning')

    return
  }

  cart.value[product.id] = {
    productId: product.id,
    name: product.size ? `${product.name} · ${product.size}` : product.name,
    quantity: currentQuantity + 1,
    unitPrice: product.salePrice,
    unitCost: product.unitCost,
  }

  if ('vibrate' in navigator)
    navigator.vibrate(80)
  showFeedback(`${product.name} agregado.`, 'success')
}

function addBarcode(rawCode: string) {
  const code = rawCode.trim()

  if (!code)
    return

  const product = commerce.products.find(item => item.status === 'active' && productHasBarcode(item, code))
  if (!product) {
    showFeedback(`No encontramos un producto activo con el código ${code}.`, 'warning')

    return
  }

  addProduct(product)
}

function requestManualProduct() {
  manualProductId.value = ''
  manualAdminEmail.value = session.authEmail ?? ''
  manualAdminPassword.value = ''
  showManualAdminPassword.value = false
  manualProductDialog.value = true
}

async function addManualProduct() {
  const product = commerce.products.find(item => item.status === 'active' && item.id === manualProductId.value)
  if (!product)
    return showFeedback('Selecciona un producto disponible.', 'warning')

  saving.value = true
  try {
    await session.verifyAdminCredentials(manualAdminEmail.value, manualAdminPassword.value)
    addProduct(product)
    manualProductId.value = ''
    manualAdminPassword.value = ''
    manualProductDialog.value = false
  }
  catch (error) {
    showFeedback(error instanceof Error ? error.message : 'No fue posible autorizar la selección manual.', 'error')
  }
  finally { saving.value = false }
}

function changeQuantity(item: SaleItem, difference: number) {
  const quantity = item.quantity + difference
  if (quantity <= 0) {
    const next = { ...cart.value }

    delete next[item.productId]
    cart.value = next

    return
  }
  if (quantity > productStock(item.productId)) {
    showFeedback('No hay más existencias disponibles.', 'warning')

    return
  }

  cart.value[item.productId] = { ...item, quantity }
}

function continueToIdentification() {
  if (!cartItems.value.length)
    return showFeedback('Escanea al menos un producto para continuar.', 'warning')

  cameraEnabled.value = false
  athleteScannerEnabled.value = true
  athleteCode.value = ''
  selectedAthlete.value = null
  step.value = 'identify'
}

function focusManualAthleteCode() {
  athleteScannerEnabled.value = false
  void nextTick(() => athleteCodeInput.value?.focus())
}

function handleAthleteScannerError(message: string) {
  showFeedback(`${message} Puedes ingresar tu código manualmente.`, 'warning')
  focusManualAthleteCode()
}

function identifyAthlete(rawCode = athleteCode.value) {
  const code = parseKioskCodePayload(rawCode)

  const athlete = code
    ? athletes.items.find(item => item.status === 'active' && item.kioskCode === code)
    : null

  if (!code || !athlete) {
    showFeedback('El código no es válido. Pide al administrador que revise o regenere tu código.', 'error')

    return
  }

  athleteCode.value = code
  athleteScannerEnabled.value = false
  selectedAthlete.value = athlete
  receivedAmount.value = cartTotal.value
  paymentMethod.value = 'cash'
  step.value = 'payment'
}

function backToShopping() {
  selectedAthlete.value = null
  athleteScannerEnabled.value = false
  athleteCode.value = ''
  step.value = 'shopping'
  cameraEnabled.value = true
}

function useAnotherAthlete() {
  selectedAthlete.value = null
  athleteCode.value = ''
  receivedAmount.value = 0
  athleteScannerEnabled.value = true
  step.value = 'identify'
}

function openPaymentApproval() {
  if (!paymentNowAvailable.value) {
    showFeedback('Pagar ahora está deshabilitado por la configuración del Kiosco.', 'warning')

    return
  }

  paymentMethod.value = 'cash'
  receivedAmount.value = cartTotal.value
  paymentEmail.value = session.authEmail ?? ''
  paymentPassword.value = ''
  showPaymentPassword.value = false
  paymentDialog.value = true
}

async function createKioskSale(paid: boolean, approvedBy?: string) {
  const athlete = selectedAthlete.value
  if (!athlete || !cartItems.value.length)
    throw new Error('La compra perdió sus datos. Inicia nuevamente.')

  const total = cartTotal.value
  const appliedAt = Date.now()
  const paymentId = `kiosk-${crypto.randomUUID()}`
  const received = paymentMethod.value === 'cash' ? Number(receivedAmount.value) : total

  const payments = paid ? {
    [paymentId]: {
      id: paymentId,
      amountApplied: total,
      method: paymentMethod.value,
      receivedAmount: received,
      changeGiven: paid ? changeAmount.value : 0,
      appliedAt,
    },
  } : {}

  const saleId = await commerce.createSale({
    athleteId: athlete.id,
    visitorId: null,
    customerName: athlete.profile.name,
    items: { ...cart.value },
    total,
    status: paid ? 'paid' : 'credit',
    payments,
    source: 'kiosk',
    ...(paid && approvedBy ? { approvedBy } : {}),
  })

  completedSale.value = { customerName: athlete.profile.name, total, paid, saleId }
  cart.value = {}
  selectedAthlete.value = null
  athleteCode.value = ''
  step.value = 'success'
  paymentDialog.value = false
  scheduleSuccessReset()
}

async function payLater() {
  saving.value = true
  try {
    await createKioskSale(false)
  }
  catch (error) {
    showFeedback(error instanceof Error ? error.message : 'No fue posible registrar la compra.', 'error')
  }
  finally { saving.value = false }
}

async function approvePayment() {
  if (paymentMethod.value === 'cash' && Number(receivedAmount.value) < cartTotal.value) {
    showFeedback('El efectivo recibido no cubre el total de la compra.', 'warning')

    return
  }

  saving.value = true
  try {
    const approvedBy = await session.verifyAdminCredentials(paymentEmail.value, paymentPassword.value)

    if (approvedBy !== session.uid)
      throw new Error('Confirma el pago con la misma cuenta Admin que mantiene abierta esta sesión.')

    const [latestSettings, approvedProfile] = await Promise.all([
      kioskSettingsService.get(),
      usersService.getProfile(approvedBy),
    ])

    if (!isKioskPaymentNowAllowed(latestSettings, approvedProfile))
      throw new Error('Este Admin no está autorizado para confirmar Pagar ahora.')

    await createKioskSale(true, approvedBy)
  }
  catch (error) {
    showFeedback(error instanceof Error ? error.message : 'No fue posible autorizar el pago.', 'error')
  }
  finally {
    paymentPassword.value = ''
    saving.value = false
  }
}

function resetSale() {
  if (successTimer) {
    window.clearTimeout(successTimer)
    successTimer = null
  }
  cart.value = {}
  selectedAthlete.value = null
  completedSale.value = null
  athleteCode.value = ''
  manualProductId.value = ''
  manualProductDialog.value = false
  manualAdminPassword.value = ''
  paymentDialog.value = false
  paymentPassword.value = ''
  paymentEmail.value = ''
  athleteScannerEnabled.value = false
  step.value = 'shopping'
  cameraEnabled.value = true
}

function scheduleSuccessReset() {
  if (successTimer)
    window.clearTimeout(successTimer)
  successTimer = window.setTimeout(resetSale, KIOSK_SUCCESS_RESET_MS)
}

function schedulePrivacyReset() {
  if (resetTimer)
    window.clearTimeout(resetTimer)
  resetTimer = window.setTimeout(() => {
    if (cartItems.value.length || step.value !== 'shopping') {
      resetSale()
      showFeedback('La compra se reinició por inactividad para proteger tus datos.', 'info')
    }
  }, 180_000)
}

function requestExit() {
  exitEmail.value = session.authEmail ?? ''
  exitPassword.value = ''
  showExitPassword.value = false
  exitDialog.value = true
}

async function authorizeExit() {
  saving.value = true
  try {
    await session.verifyAdminCredentials(exitEmail.value, exitPassword.value)
    exitAuthorized.value = true
    exitDialog.value = false
    cameraEnabled.value = false
    if (document.fullscreenElement)
      await document.exitFullscreen()
    await router.replace('/tienda')
  }
  catch (error) {
    showFeedback(error instanceof Error ? error.message : 'No fue posible cerrar el kiosco.', 'error')
  }
  finally { saving.value = false }
}

function preventWindowClose(event: BeforeUnloadEvent) {
  if (exitAuthorized.value)
    return

  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => exitAuthorized.value)

onMounted(() => {
  commerce.subscribe()
  athletes.subscribe()
  kioskSettings.subscribe()
  window.addEventListener('pointerdown', schedulePrivacyReset)
  window.addEventListener('keydown', schedulePrivacyReset)
  window.addEventListener('beforeunload', preventWindowClose)
  schedulePrivacyReset()
})

onBeforeUnmount(() => {
  cameraEnabled.value = false
  commerce.dispose()
  athletes.dispose()
  kioskSettings.dispose()
  window.removeEventListener('pointerdown', schedulePrivacyReset)
  window.removeEventListener('keydown', schedulePrivacyReset)
  window.removeEventListener('beforeunload', preventWindowClose)
  if (resetTimer)
    window.clearTimeout(resetTimer)
  if (successTimer)
    window.clearTimeout(successTimer)
})
</script>

<template>
  <main class="kiosk-shell">
    <header class="kiosk-header">
      <div>
        <p class="kiosk-eyebrow mb-1">
          KRONOS TRAINING
        </p>
        <h1 class="text-h4 font-weight-bold mb-0">
          Kiosco de tienda
        </h1>
      </div>
      <VBtn
        variant="tonal"
        color="secondary"
        prepend-icon="ri-lock-line"
        @click="requestExit"
      >
        Cerrar kiosco
      </VBtn>
    </header>

    <section
      v-if="step === 'shopping'"
      class="kiosk-shopping"
    >
      <div class="kiosk-camera-panel">
        <div class="mb-4">
          <p class="text-h5 font-weight-bold mb-1">
            Escanea tus productos
          </p>
          <p class="text-body-1 text-medium-emphasis mb-0">
            Coloca el código de barras frente a la cámara. Cada lectura agrega una unidad.
          </p>
        </div>
        <BarcodeScanner
          :active="cameraEnabled"
          @detected="addBarcode"
        />
        <div class="manual-product mt-4 pa-4">
          <p class="font-weight-bold mb-1">
            Selección manual protegida
          </p>
          <p class="text-body-2 text-medium-emphasis mb-3">
            Si un código no puede leerse, solicita ayuda. Un Admin verificará el producto, la variante y el precio antes de agregarlo.
          </p>
          <VBtn
            variant="tonal"
            prepend-icon="ri-admin-line"
            @click="requestManualProduct"
          >
            Solicitar selección manual
          </VBtn>
        </div>
        <VAlert
          v-if="!productsWithBarcode.length && !commerce.loading"
          class="mt-4"
          color="warning"
          variant="tonal"
        >
          Todavía no hay productos activos con código de barras. Agrégalos desde Inventario.
        </VAlert>
      </div>

      <VCard
        class="kiosk-cart"
        rounded="xl"
      >
        <VCardItem class="pa-6">
          <template #title>
            <div class="d-flex align-center justify-space-between">
              <span>Tu compra</span>
              <VChip
                color="secondary"
                variant="tonal"
              >
                {{ itemCount }} productos
              </VChip>
            </div>
          </template>
        </VCardItem>
        <VDivider />
        <VCardText class="kiosk-cart-items pa-6">
          <div
            v-if="!cartItems.length"
            class="empty-cart"
          >
            <VIcon
              icon="ri-shopping-basket-line"
              size="54"
              color="secondary"
            />
            <p class="font-weight-bold mt-4 mb-1">
              Tu carrito está vacío
            </p>
            <p class="text-body-2 text-medium-emphasis mb-0">
              Escanea el primer producto para comenzar.
            </p>
          </div>
          <div
            v-for="item in cartItems"
            :key="item.productId"
            class="cart-line"
          >
            <div class="flex-grow-1">
              <p class="font-weight-bold mb-1">
                {{ item.name }}
              </p>
              <p class="text-body-2 text-medium-emphasis mb-0">
                {{ formatCurrency(item.unitPrice) }} c/u
              </p>
            </div>
            <div class="quantity-control">
              <VBtn
                icon="ri-subtract-line"
                size="small"
                variant="tonal"
                @click="changeQuantity(item, -1)"
              />
              <strong>{{ item.quantity }}</strong>
              <VBtn
                icon="ri-add-line"
                size="small"
                variant="tonal"
                @click="changeQuantity(item, 1)"
              />
            </div>
            <strong class="line-total">{{ formatCurrency(item.quantity * item.unitPrice) }}</strong>
          </div>
        </VCardText>
        <VDivider />
        <VCardActions class="kiosk-total pa-6">
          <div>
            <p class="text-caption text-medium-emphasis mb-1">
              Total
            </p>
            <p class="text-h3 font-weight-bold mb-0">
              {{ formatCurrency(cartTotal) }}
            </p>
          </div>
          <VBtn
            size="x-large"
            :disabled="!cartItems.length"
            append-icon="ri-arrow-right-line"
            @click="continueToIdentification"
          >
            Continuar
          </VBtn>
        </VCardActions>
      </VCard>
    </section>

    <section
      v-else-if="step === 'identify'"
      class="kiosk-center"
    >
      <VCard
        class="kiosk-step-card"
        rounded="xl"
      >
        <VCardText class="pa-8 text-center">
          <VAvatar
            color="secondary"
            variant="tonal"
            size="76"
            class="mb-6"
          >
            <VIcon
              icon="ri-user-3-line"
              size="38"
            />
          </VAvatar>
          <p class="text-h4 font-weight-bold mb-2">
            Identifica tu compra
          </p>
          <p class="text-body-1 text-medium-emphasis mb-7">
            Escanea la credencial QR o ingresa manualmente el código personal de 6 dígitos.
          </p>
          <div class="d-flex flex-column flex-sm-row align-center justify-center ga-3 mb-5">
            <p class="font-weight-bold mb-0">
              Escanea tu credencial QR
            </p>
            <VBtn
              size="small"
              :prepend-icon="athleteScannerEnabled ? 'ri-close-line' : 'ri-qr-scan-2-line'"
              variant="tonal"
              @click="athleteScannerEnabled ? focusManualAthleteCode() : athleteScannerEnabled = true"
            >
              {{ athleteScannerEnabled ? 'Cerrar cámara' : 'Reactivar cámara' }}
            </VBtn>
          </div>
          <VExpandTransition>
            <div
              v-if="athleteScannerEnabled"
              class="athlete-scanner mx-auto mb-6"
            >
              <BarcodeScanner
                :active="athleteScannerEnabled"
                format="qr"
                purpose="la credencial QR"
                @detected="identifyAthlete"
                @error="handleAthleteScannerError"
              />
            </div>
          </VExpandTransition>
          <p class="text-overline text-medium-emphasis mb-3">
            O ingresa tu código
          </p>
          <VTextField
            ref="athleteCodeInput"
            v-model="athleteCode"
            class="kiosk-code-input mx-auto"
            type="password"
            inputmode="numeric"
            maxlength="6"
            label="Código personal de 6 dígitos"
            prepend-inner-icon="ri-key-2-line"
            :autofocus="!athleteScannerEnabled"
            @keyup.enter="identifyAthlete"
          />
          <div class="d-flex flex-column flex-sm-row justify-center ga-3 mt-3">
            <VBtn
              size="large"
              variant="text"
              prepend-icon="ri-arrow-left-line"
              @click="backToShopping"
            >
              Volver al carrito
            </VBtn>
            <VBtn
              size="large"
              append-icon="ri-arrow-right-line"
              @click="identifyAthlete"
            >
              Continuar
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </section>

    <section
      v-else-if="step === 'payment'"
      class="kiosk-center"
    >
      <VCard
        class="kiosk-step-card"
        rounded="xl"
      >
        <VCardText class="pa-8 text-center">
          <VAvatar
            color="success"
            variant="tonal"
            size="76"
            class="mb-5"
          >
            <VIcon
              icon="ri-user-smile-line"
              size="38"
            />
          </VAvatar>
          <p class="text-h4 font-weight-bold mb-2">
            Hola, {{ selectedAthlete?.profile.name.split(' ')[0] }}
          </p>
          <p class="text-body-1 text-medium-emphasis mb-6">
            Elige cómo quieres registrar esta compra.
          </p>
          <div class="payment-total pa-6 mb-6">
            <span class="text-body-2 text-medium-emphasis">Total de la compra</span>
            <strong class="text-h2">{{ formatCurrency(cartTotal) }}</strong>
          </div>
          <VRow>
            <VCol
              cols="12"
              sm="6"
            >
              <VBtn
                block
                size="x-large"
                height="72"
                variant="tonal"
                color="secondary"
                prepend-icon="ri-time-line"
                :loading="saving"
                @click="payLater"
              >
                Pagar después
              </VBtn>
              <p class="text-caption text-medium-emphasis mt-2 mb-0">
                Se registrará como saldo pendiente.
              </p>
            </VCol>
            <VCol
              cols="12"
              sm="6"
            >
              <VBtn
                block
                size="x-large"
                height="72"
                prepend-icon="ri-hand-coin-line"
                :disabled="!paymentNowAvailable"
                @click="openPaymentApproval"
              >
                Pagar ahora
              </VBtn>
              <p class="text-caption text-medium-emphasis mt-2 mb-0">
                {{ paymentNowAvailable ? 'Un administrador autorizado confirmará el pago.' : 'Deshabilitado por la configuración del Kiosco.' }}
              </p>
            </VCol>
          </VRow>
          <VBtn
            class="mt-6"
            variant="text"
            prepend-icon="ri-arrow-left-line"
            @click="useAnotherAthlete"
          >
            Usar otro código
          </VBtn>
        </VCardText>
      </VCard>
    </section>

    <section
      v-else
      class="kiosk-center"
    >
      <VCard
        class="kiosk-step-card"
        rounded="xl"
      >
        <VCardText class="pa-8 text-center">
          <VAvatar
            :color="completedSale?.paid ? 'success' : 'secondary'"
            variant="tonal"
            size="92"
            class="mb-6"
          >
            <VIcon
              :icon="completedSale?.paid ? 'ri-check-double-line' : 'ri-file-list-3-line'"
              size="48"
            />
          </VAvatar>
          <p class="text-h3 font-weight-bold mb-3">
            {{ completedSale?.paid ? 'Pago confirmado' : 'Compra registrada' }}
          </p>
          <p class="text-h6 mb-2">
            Gracias, {{ completedSale?.customerName }}
          </p>
          <p class="text-body-1 text-medium-emphasis mb-7">
            <template v-if="completedSale?.paid">
              Tu compra por {{ formatCurrency(completedSale?.total ?? 0) }} quedó pagada.
            </template>
            <template v-else>
              La compra por {{ formatCurrency(completedSale?.total ?? 0) }} quedó registrada en tu saldo pendiente.
            </template>
          </p>
          <VBtn
            size="x-large"
            prepend-icon="ri-shopping-basket-line"
            @click="resetSale"
          >
            Nueva compra
          </VBtn>
          <p class="text-caption text-medium-emphasis mt-4 mb-0">
            Esta pantalla se reiniciará automáticamente en 5 segundos.
          </p>
        </VCardText>
      </VCard>
    </section>

    <VDialog
      v-model="manualProductDialog"
      max-width="620"
      persistent
    >
      <VCard
        class="kronos-card"
        rounded="xl"
      >
        <VCardItem
          class="pa-6 pb-2"
          title="Agregar producto manualmente"
          subtitle="Sólo un Admin puede confirmar esta selección."
        />
        <VCardText class="pa-6 d-flex flex-column ga-5">
          <VAlert
            color="warning"
            variant="tonal"
            icon="ri-error-warning-line"
          >
            Confirma físicamente el producto, su variante y su precio. Si son distintos, deben existir como productos separados.
          </VAlert>
          <VAutocomplete
            v-model="manualProductId"
            :items="manualProductItems"
            label="Producto exacto"
            prepend-inner-icon="ri-search-line"
            clearable
          />
          <VTextField
            v-model="manualAdminEmail"
            type="email"
            label="Correo del Admin"
            prepend-inner-icon="ri-mail-line"
            autocomplete="username"
          />
          <VTextField
            v-model="manualAdminPassword"
            :type="showManualAdminPassword ? 'text' : 'password'"
            label="Contraseña del Admin"
            prepend-inner-icon="ri-lock-password-line"
            autocomplete="current-password"
            :append-inner-icon="showManualAdminPassword ? 'ri-eye-off-line' : 'ri-eye-line'"
            @click:append-inner="showManualAdminPassword = !showManualAdminPassword"
            @keyup.enter="addManualProduct"
          />
        </VCardText>
        <VCardActions class="pa-6 pt-0">
          <VSpacer />
          <VBtn
            variant="text"
            :disabled="saving"
            @click="manualProductDialog = false"
          >
            Cancelar
          </VBtn>
          <VBtn
            :loading="saving"
            :disabled="!manualProductId || !manualAdminEmail || !manualAdminPassword"
            prepend-icon="ri-check-line"
            @click="addManualProduct"
          >
            Autorizar y agregar
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog
      v-model="paymentDialog"
      max-width="580"
      persistent
    >
      <VCard
        class="kronos-card"
        rounded="xl"
      >
        <VCardItem
          class="pa-6 pb-2"
          title="Confirmar pago"
          subtitle="Esta sección debe completarla el administrador."
        />
        <VCardText class="pa-6 d-flex flex-column ga-5">
          <VAlert
            color="warning"
            variant="tonal"
            icon="ri-admin-line"
          >
            Verifica que recibiste el pago antes de ingresar tu contraseña.
          </VAlert>
          <VSelect
            v-model="paymentMethod"
            label="Método de pago"
            :items="[{ title: 'Efectivo', value: 'cash' }, { title: 'Transferencia', value: 'transfer' }, { title: 'Tarjeta', value: 'card' }, { title: 'Otro', value: 'other' }]"
          />
          <VTextField
            v-if="paymentMethod === 'cash'"
            v-model.number="receivedAmount"
            type="number"
            min="0"
            step="0.01"
            label="Efectivo recibido"
            prefix="$"
          />
          <VAlert
            v-if="paymentMethod === 'cash' && receivedAmount >= cartTotal"
            color="secondary"
            variant="tonal"
          >
            Cambio a entregar: <strong>{{ formatCurrency(changeAmount) }}</strong>
          </VAlert>
          <VTextField
            v-model="paymentEmail"
            type="email"
            label="Correo del Admin"
            prepend-inner-icon="ri-mail-line"
            autocomplete="username"
          />
          <VTextField
            v-model="paymentPassword"
            :type="showPaymentPassword ? 'text' : 'password'"
            label="Contraseña del Admin"
            prepend-inner-icon="ri-lock-password-line"
            autocomplete="current-password"
            :append-inner-icon="showPaymentPassword ? 'ri-eye-off-line' : 'ri-eye-line'"
            @click:append-inner="showPaymentPassword = !showPaymentPassword"
            @keyup.enter="approvePayment"
          />
        </VCardText>
        <VCardActions class="pa-6 pt-0">
          <VSpacer />
          <VBtn
            variant="text"
            :disabled="saving"
            @click="paymentDialog = false"
          >
            Cancelar
          </VBtn>
          <VBtn
            :loading="saving"
            prepend-icon="ri-check-line"
            @click="approvePayment"
          >
            Confirmar pago
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog
      v-model="exitDialog"
      max-width="520"
      persistent
    >
      <VCard
        class="kronos-card"
        rounded="xl"
      >
        <VCardItem
          class="pa-6 pb-2"
          title="Cerrar modo kiosco"
          subtitle="Sólo un administrador puede regresar al panel."
        />
        <VCardText class="pa-6 d-flex flex-column ga-5">
          <VAlert
            v-if="cartItems.length"
            color="warning"
            variant="tonal"
          >
            Hay una compra sin terminar. Al cerrar se descartará el carrito.
          </VAlert>
          <VTextField
            v-model="exitEmail"
            type="email"
            label="Correo del Admin"
            prepend-inner-icon="ri-mail-line"
            autocomplete="username"
            autofocus
          />
          <VTextField
            v-model="exitPassword"
            :type="showExitPassword ? 'text' : 'password'"
            label="Contraseña del Admin"
            prepend-inner-icon="ri-lock-password-line"
            autocomplete="current-password"
            :append-inner-icon="showExitPassword ? 'ri-eye-off-line' : 'ri-eye-line'"
            @click:append-inner="showExitPassword = !showExitPassword"
            @keyup.enter="authorizeExit"
          />
        </VCardText>
        <VCardActions class="pa-6 pt-0">
          <VSpacer />
          <VBtn
            variant="text"
            :disabled="saving"
            @click="exitDialog = false"
          >
            Continuar en kiosco
          </VBtn>
          <VBtn
            color="error"
            :loading="saving"
            @click="authorizeExit"
          >
            Autorizar salida
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VSnackbar
      v-model="feedback.visible"
      :color="feedback.color"
      location="top"
      timeout="3200"
    >
      {{ feedback.message }}
    </VSnackbar>
  </main>
</template>

<style scoped>
.kiosk-shell {
  position: fixed;
  z-index: 1;
  inset: 0;
  overflow: auto;
  min-block-size: 100dvh;
  padding: clamp(18px, 2.5vw, 38px);
  color: #ebebeb;
  background:
    radial-gradient(circle at 12% 0%, rgba(68, 121, 127, 0.2), transparent 36%),
    #171915;
}

.kiosk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-inline-size: 1500px;
  margin: 0 auto clamp(22px, 3vw, 38px);
  gap: 20px;
}

.kiosk-eyebrow {
  color: #97d5de;
  font-family: Syncopate, sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.2em;
}

.kiosk-shopping {
  display: grid;
  max-inline-size: 1500px;
  margin: 0 auto;
  gap: clamp(20px, 2.5vw, 36px);
  grid-template-columns: minmax(0, 1.25fr) minmax(390px, 0.75fr);
}

.kiosk-camera-panel {
  min-inline-size: 0;
}

.manual-product {
  border: 1px solid rgba(151, 213, 222, 0.14);
  border-radius: 16px;
  background: rgba(151, 213, 222, 0.04);
}

.kiosk-cart {
  display: flex;
  overflow: hidden;
  min-block-size: 68vh;
  flex-direction: column;
  border: 1px solid rgba(151, 213, 222, 0.14);
  background: #232622;
}

.kiosk-cart-items {
  overflow-y: auto;
  flex: 1;
}

.empty-cart {
  display: grid;
  inline-size: 100%;
  min-block-size: 300px;
  place-content: center;
  place-items: center;
  text-align: center;
}

.cart-line {
  display: grid;
  align-items: center;
  padding: 16px 0;
  border-block-end: 1px solid rgba(151, 213, 222, 0.1);
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.line-total {
  min-inline-size: 74px;
  text-align: end;
}

.kiosk-total {
  display: flex;
  justify-content: space-between;
  gap: 20px;
}

.kiosk-center {
  display: grid;
  min-block-size: calc(100dvh - 160px);
  place-items: center;
}

.kiosk-step-card {
  inline-size: min(100%, 760px);
  border: 1px solid rgba(151, 213, 222, 0.16);
  background: #232622;
}

.kiosk-code-input {
  max-inline-size: 360px;
}

.athlete-scanner {
  max-inline-size: 520px;
}

.payment-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(151, 213, 222, 0.16);
  border-radius: 18px;
  background: rgba(151, 213, 222, 0.06);
  gap: 20px;
}

@media (max-width: 960px) {
  .kiosk-shopping { grid-template-columns: 1fr; }
  .kiosk-cart { min-block-size: 520px; }
}

@media (max-width: 600px) {
  .kiosk-header { align-items: flex-start; flex-direction: column; }
  .kiosk-header .v-btn { inline-size: 100%; }
  .kiosk-total { align-items: stretch; flex-direction: column; }
  .cart-line { grid-template-columns: minmax(0, 1fr) auto; }
  .line-total { grid-column: 1 / -1; text-align: start; }
  .payment-total { align-items: flex-start; flex-direction: column; }
  .manual-product .d-flex { flex-direction: column; }
}
</style>
