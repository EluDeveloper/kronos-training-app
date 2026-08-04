<script setup lang="ts">
import { useNotifications } from '@/composables/useNotifications'
import { useVisitPaymentsStore } from '@/stores/visit-payments'
import { useVisitorsStore } from '@/stores/visitors'
import { currentPeriod, type PaymentMethod, type Visit, type VisitPayment } from '@/types/domain'
import { formatCurrency } from '@/utils/kronos'

const props = withDefaults(defineProps<{
  modelValue: boolean
  visitorId?: string
  period?: string
  visits?: Visit[]
}>(), { visitorId: '', period: '', visits: () => [] })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': [payment: VisitPayment]
}>()

const visitors = useVisitorsStore()
const visitPayments = useVisitPaymentsStore()
const { success, failure } = useNotifications()
const saving = ref(false)
const form = reactive({ method: 'cash' as PaymentMethod, period: currentPeriod() })
const visitor = computed(() => visitors.items.find(item => item.id === props.visitorId) ?? null)
const amount = computed(() => props.visits.reduce((total, visit) => total + Number(visit.unitPrice || 0), 0))
const periodSummary = computed(() => {
  const counts = new Map<string, number>()

  props.visits.forEach(visit => counts.set(visit.period, (counts.get(visit.period) ?? 0) + 1))

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => `${count} de ${period}`)
    .join(' + ')
})
const paymentMethods = [
  { title: 'Efectivo', value: 'cash' },
  { title: 'Transferencia', value: 'transfer' },
  { title: 'Tarjeta', value: 'card' },
  { title: 'Otro', value: 'other' },
]

watch(() => props.modelValue, open => {
  if (!open)
    return
  form.method = 'cash'
  form.period = /^\d{4}-\d{2}$/.test(props.period) ? props.period : currentPeriod()
})

async function save() {
  if (!visitor.value || amount.value <= 0 || !props.visits.length || !/^\d{4}-\d{2}$/.test(form.period)) {
    failure('Revisa visitante, periodo y visitas pendientes.')
    return
  }
  saving.value = true
  try {
    const payment = await visitPayments.create({
      visitorId: visitor.value.id,
      customerName: visitor.value.name,
      phone: visitor.value.phone,
      throughPeriod: form.period,
      method: form.method,
      visits: props.visits,
    })
    success('Pago acumulado de visitas aplicado.')
    emit('update:modelValue', false)
    emit('saved', payment)
  }
  catch (error) {
    failure(error instanceof Error ? error.message : 'No fue posible aplicar el pago.')
  }
  finally { saving.value = false }
}
</script>

<template>
  <VDialog :model-value="modelValue" max-width="560" @update:model-value="emit('update:modelValue', $event)">
    <VCard class="kronos-card" rounded="xl">
      <VCardItem class="pa-6 pb-2" title="Cobrar visitas pendientes" :subtitle="visitor?.name ?? 'Visitante externo'" />
      <VForm @submit.prevent="save">
        <VCardText class="pa-6 d-flex flex-column ga-5">
          <VAlert color="info" variant="tonal">
            Se liquidarán exactamente {{ visits.length }} visitas. El recibo conservará el desglose por mes.
          </VAlert>
          <div class="rounded-lg border pa-4">
            <div class="text-caption text-medium-emphasis">Visitas incluidas</div>
            <div class="font-weight-bold">{{ periodSummary }}</div>
            <div class="text-h5 font-weight-bold text-success mt-2">{{ formatCurrency(amount) }}</div>
          </div>
          <VRow>
            <VCol cols="12" sm="6"><VTextField v-model="form.period" type="month" label="Corte del cobro" readonly /></VCol>
            <VCol cols="12" sm="6"><VTextField :model-value="formatCurrency(amount)" label="Monto calculado" readonly /></VCol>
          </VRow>
          <VSelect v-model="form.method" :items="paymentMethods" label="Método de pago" />
        </VCardText>
        <VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="emit('update:modelValue', false)">Cancelar</VBtn><VBtn type="submit" :loading="saving">Aplicar y generar recibo</VBtn></VCardActions>
      </VForm>
    </VCard>
  </VDialog>
</template>
