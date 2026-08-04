<script setup lang="ts">
import { useNotifications } from '@/composables/useNotifications'
import { usePaymentsStore } from '@/stores/payments'
import { useVisitorsStore } from '@/stores/visitors'
import { currentPeriod, type Payment, type PaymentMethod } from '@/types/domain'

const props = withDefaults(defineProps<{
  modelValue: boolean
  visitorId?: string
  period?: string
  amount?: number
  concept?: string
  visitCount?: number
}>(), { visitorId: '', period: '', amount: 0, concept: '', visitCount: 0 })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': [payment: Payment]
}>()

const visitors = useVisitorsStore()
const payments = usePaymentsStore()
const { success, failure } = useNotifications()
const saving = ref(false)
const form = reactive({ method: 'cash' as PaymentMethod, amount: 0, period: currentPeriod() })
const visitor = computed(() => visitors.items.find(item => item.id === props.visitorId) ?? null)
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
  form.amount = Number(props.amount || 0)
  form.period = /^\d{4}-\d{2}$/.test(props.period) ? props.period : currentPeriod()
})

async function save() {
  if (!visitor.value || Number(form.amount) <= 0 || !/^\d{4}-\d{2}$/.test(form.period)) {
    failure('Revisa visitante, periodo y monto.')
    return
  }
  saving.value = true
  try {
    const appliedAt = Date.now()
    const payment: Payment = {
      athleteId: visitor.value.id,
      visitorId: visitor.value.id,
      period: form.period,
      amount: Number(form.amount),
      method: form.method,
      status: 'paid',
      appliedAt,
      createdAt: appliedAt,
      updatedAt: appliedAt,
      concept: props.concept || `${props.visitCount} visitas acumuladas ${form.period}`,
      visitCount: props.visitCount,
    }
    await payments.save(payment)
    success('Pago de visitas aplicado.')
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
      <VCardItem class="pa-6 pb-2" title="Cobrar visitas acumuladas" :subtitle="visitor?.name ?? 'Visitante externo'" />
      <VForm @submit.prevent="save">
        <VCardText class="pa-6 d-flex flex-column ga-5">
          <VAlert color="info" variant="tonal">El pago corresponde a un visitante sin membresía y generará su recibo con celular.</VAlert>
          <VRow>
            <VCol cols="12" sm="6"><VTextField v-model="form.period" type="month" label="Periodo" /></VCol>
            <VCol cols="12" sm="6"><VTextField v-model.number="form.amount" type="number" min="1" label="Monto" prefix="$" /></VCol>
          </VRow>
          <VSelect v-model="form.method" :items="paymentMethods" label="Método de pago" />
        </VCardText>
        <VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="emit('update:modelValue', false)">Cancelar</VBtn><VBtn type="submit" :loading="saving">Aplicar y generar recibo</VBtn></VCardActions>
      </VForm>
    </VCard>
  </VDialog>
</template>
