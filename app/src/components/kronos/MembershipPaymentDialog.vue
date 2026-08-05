<script setup lang="ts">
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { usePaymentsStore } from '@/stores/payments'
import { useSessionStore } from '@/stores/session'
import { currentPeriod, type CombinedStorePayment, type MembershipPaymentInstallment, type Payment, type PaymentMethod, type Sale } from '@/types/domain'
import { formatCurrency, formatDate, membershipBalance, membershipInstallments, membershipPaidAmount, membershipTotalAmount, saleBalance } from '@/utils/kronos'

const props = withDefaults(defineProps<{
  modelValue: boolean
  athleteId?: string
  period?: string
  amount?: number
  concept?: string
  visitCount?: number
  title?: string
  subtitle?: string
  lockAthlete?: boolean
  storeSales?: Sale[]
}>(), {
  athleteId: '',
  period: '',
  amount: 0,
  concept: '',
  visitCount: 0,
  title: 'Aplicar mensualidad',
  subtitle: 'Confirma el atleta, periodo y forma de pago.',
  lockAthlete: false,
  storeSales: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': [payment: Payment, installment: MembershipPaymentInstallment, settledSales: CombinedStorePayment[]]
}>()

const athletes = useAthletesStore()
const payments = usePaymentsStore()
const session = useSessionStore()
const { success, failure } = useNotifications()
const saving = ref(false)
const includeStoreDebt = ref(true)
const form = reactive({ athleteId: '', period: currentPeriod(), amount: 0, method: 'cash' as PaymentMethod })

const selectedAthlete = computed(() => athletes.active.find(item => item.id === form.athleteId))
const currentPayment = computed(() => payments.items.find(item => item.athleteId === form.athleteId && item.period === form.period && !item.visitorId))
const expectedAmount = computed(() => membershipTotalAmount(currentPayment.value, props.amount > 0 ? props.amount : selectedAthlete.value?.membership.agreedAmount))
const paidAmount = computed(() => membershipPaidAmount(currentPayment.value))
const pendingAmount = computed(() => membershipBalance(currentPayment.value, expectedAmount.value))
const paymentHistory = computed(() => currentPayment.value ? [...membershipInstallments(currentPayment.value)].reverse() : [])
const paymentProgress = computed(() => expectedAmount.value > 0 ? Math.min(100, paidAmount.value / expectedAmount.value * 100) : 0)
const selectedStoreSales = computed(() => session.can('storeCollect') ? props.storeSales.filter(sale => sale.athleteId === form.athleteId && sale.status === 'credit' && saleBalance(sale) > 0) : [])
const storeDebt = computed(() => selectedStoreSales.value.reduce((total, sale) => total + saleBalance(sale), 0))
const totalToday = computed(() => Number(form.amount || 0) + (includeStoreDebt.value ? storeDebt.value : 0))

const athleteItems = computed(() => athletes.active.map(item => ({
  title: item.profile.name,
  value: item.id,
  subtitle: `${formatCurrency(item.membership.agreedAmount)} · vence el día ${item.membership.paymentDay}`,
})))

const paymentMethods = [
  { title: 'Efectivo', value: 'cash' },
  { title: 'Transferencia', value: 'transfer' },
  { title: 'Tarjeta', value: 'card' },
  { title: 'Otro', value: 'other' },
]

const paymentMethodLabel = (method: PaymentMethod) => paymentMethods.find(item => item.value === method)?.title ?? 'Otro'

function suggestPendingAmount() {
  form.amount = pendingAmount.value
}

function initialize() {
  if (!props.modelValue)
    return

  const athlete = athletes.active.find(item => item.id === props.athleteId)

  form.athleteId = athlete?.id ?? ''
  form.period = /^\d{4}-\d{2}$/.test(props.period) ? props.period : currentPeriod()
  form.method = 'cash'
  includeStoreDebt.value = true
  nextTick(suggestPendingAmount)
}

watch(() => props.modelValue, initialize, { immediate: true })
watch(() => props.athleteId, initialize)

watch(() => form.athleteId, (id, previousId) => {
  if (!id || id === previousId)
    return

  suggestPendingAmount()
})
watch(() => form.period, suggestPendingAmount)

async function save() {
  if (!form.athleteId || !/^\d{4}-\d{2}$/.test(form.period) || Number(form.amount) <= 0 || Number(form.amount) > pendingAmount.value) {
    failure('Selecciona atleta, periodo y monto válido.')

    return
  }

  saving.value = true
  try {
    const result = await payments.applyInstallment({
      athleteId: form.athleteId,
      period: form.period,
      amount: Number(form.amount),
      totalAmount: expectedAmount.value,
      method: form.method,
      ...(props.concept ? { concept: props.concept } : {}),
      ...(props.visitCount > 0 ? { visitCount: props.visitCount } : {}),
    }, includeStoreDebt.value ? selectedStoreSales.value : [])

    const storeMessage = result.settledSales.length ? ` También se liquidaron ${result.settledSales.length} ${result.settledSales.length === 1 ? 'deuda' : 'deudas'} de tienda.` : ''

    success(`${result.payment.status === 'paid' ? `Mensualidad ${form.period} liquidada.` : `Abono aplicado. Restan ${formatCurrency(result.payment.balance ?? 0)}.`}${storeMessage}`)
    emit('update:modelValue', false)
    emit('saved', result.payment, result.installment, result.settledSales)
  }
  catch (error) {
    failure(error instanceof Error ? error.message : 'No fue posible aplicar el pago.')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="640"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        :title="title"
        :subtitle="subtitle"
      />
      <VForm @submit.prevent="save">
        <VCardText class="pa-6 d-flex flex-column ga-5">
          <VAutocomplete
            v-model="form.athleteId"
            :items="athleteItems"
            label="Buscar atleta"
            placeholder="Escribe un nombre"
            prepend-inner-icon="ri-search-line"
            clearable
            :disabled="lockAthlete"
          />

          <VAlert
            v-if="form.athleteId && expectedAmount > 0"
            color="info"
            variant="tonal"
          >
            <div class="d-flex flex-wrap justify-space-between ga-4">
              <div>
                <div class="text-caption">
                  Mensualidad
                </div><strong>{{ formatCurrency(expectedAmount) }}</strong>
              </div>
              <div>
                <div class="text-caption">
                  Abonado
                </div><strong>{{ formatCurrency(paidAmount) }}</strong>
              </div>
              <div>
                <div class="text-caption">
                  Saldo restante
                </div><strong :class="pendingAmount ? 'text-warning' : 'text-success'">{{ formatCurrency(pendingAmount) }}</strong>
              </div>
            </div>
            <VProgressLinear
              class="mt-3"
              :model-value="paymentProgress"
              color="success"
              rounded
            />
          </VAlert>

          <VRow>
            <VCol
              cols="12"
              sm="6"
            >
              <VTextField
                v-model="form.period"
                type="month"
                label="Periodo que se paga"
              />
            </VCol>
            <VCol
              cols="12"
              sm="6"
            >
              <VTextField
                v-model.number="form.amount"
                type="number"
                min="1"
                :max="pendingAmount"
                label="Monto del abono"
                prefix="$"
                :disabled="pendingAmount <= 0"
              />
            </VCol>
          </VRow>

          <VSelect
            v-model="form.method"
            :items="paymentMethods"
            label="Método de pago"
          />

          <VAlert
            v-if="storeDebt > 0"
            color="warning"
            variant="tonal"
          >
            <div class="d-flex flex-wrap justify-space-between align-center ga-3">
              <div>
                <div class="font-weight-bold">
                  Adeudo de tienda: {{ formatCurrency(storeDebt) }}
                </div>
                <div class="text-caption">
                  {{ selectedStoreSales.length }} {{ selectedStoreSales.length === 1 ? 'venta pendiente' : 'ventas pendientes' }}
                </div>
              </div>
              <VSwitch
                v-model="includeStoreDebt"
                color="secondary"
                hide-details
                label="Liquidar también"
              />
            </div>
          </VAlert>

          <div class="rounded-lg border pa-4 d-flex justify-space-between align-center">
            <span class="font-weight-bold">Total a cobrar hoy</span>
            <span class="text-h5 font-weight-bold text-success">{{ formatCurrency(totalToday) }}</span>
          </div>

          <div v-if="paymentHistory.length">
            <div class="text-subtitle-2 font-weight-bold mb-2">
              Abonos registrados
            </div>
            <VList
              bg-color="transparent"
              density="compact"
              border
              rounded="lg"
            >
              <VListItem
                v-for="installment in paymentHistory"
                :key="installment.id"
                :title="formatCurrency(installment.amountApplied)"
                :subtitle="`${formatDate(installment.appliedAt)} · ${paymentMethodLabel(installment.method)}`"
              >
                <template #append>
                  <span class="text-caption">Resta {{ formatCurrency(installment.balanceAfter) }}</span>
                </template>
              </VListItem>
            </VList>
          </div>
        </VCardText>

        <VCardActions class="pa-6 pt-0">
          <VSpacer />
          <VBtn
            variant="text"
            @click="emit('update:modelValue', false)"
          >
            Cancelar
          </VBtn>
          <VBtn
            type="submit"
            :loading="saving"
            :disabled="pendingAmount <= 0"
            prepend-icon="ri-checkbox-circle-line"
          >
            {{ pendingAmount > 0 ? 'Aplicar abono y generar recibo' : 'Mensualidad liquidada' }}
          </VBtn>
        </VCardActions>
      </VForm>
    </VCard>
  </VDialog>
</template>
