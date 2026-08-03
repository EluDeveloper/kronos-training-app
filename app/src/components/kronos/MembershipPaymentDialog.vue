<script setup lang="ts">
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { usePaymentsStore } from '@/stores/payments'
import { currentPeriod, type Payment, type PaymentMethod } from '@/types/domain'
import { formatCurrency } from '@/utils/kronos'

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
}>(), {
  athleteId: '',
  period: '',
  amount: 0,
  concept: '',
  visitCount: 0,
  title: 'Aplicar mensualidad',
  subtitle: 'Confirma el atleta, periodo y forma de pago.',
  lockAthlete: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': [payment: Payment]
}>()

const athletes = useAthletesStore()
const payments = usePaymentsStore()
const { success, failure } = useNotifications()
const saving = ref(false)
const form = reactive({ athleteId: '', period: currentPeriod(), amount: 0, method: 'cash' as PaymentMethod })

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

function initialize() {
  if (!props.modelValue)
    return

  const athlete = athletes.active.find(item => item.id === props.athleteId) ?? athletes.active[0]
  form.athleteId = athlete?.id ?? ''
  form.period = /^\d{4}-\d{2}$/.test(props.period) ? props.period : currentPeriod()
  form.amount = props.amount > 0 ? props.amount : athlete?.membership.agreedAmount ?? 0
  form.method = 'cash'
}

watch(() => props.modelValue, initialize, { immediate: true })
watch(() => props.athleteId, initialize)

watch(() => form.athleteId, (id, previousId) => {
  if (!id || id === previousId)
    return
  const athlete = athletes.active.find(item => item.id === id)
  if (athlete)
    form.amount = props.amount > 0 ? props.amount : athlete.membership.agreedAmount
})

async function save() {
  if (!form.athleteId || !/^\d{4}-\d{2}$/.test(form.period) || Number(form.amount) <= 0) {
    failure('Selecciona atleta, periodo y monto válido.')
    return
  }

  saving.value = true
  try {
    const appliedAt = Date.now()
    const payment: Payment = {
      athleteId: form.athleteId,
      period: form.period,
      amount: Number(form.amount),
      method: form.method,
      status: 'paid',
      appliedAt,
      createdAt: appliedAt,
      updatedAt: appliedAt,
      ...(props.concept ? { concept: props.concept } : {}),
      ...(props.visitCount > 0 ? { visitCount: props.visitCount } : {}),
    }

    await payments.save(payment)
    success(`Pago ${form.period} aplicado.`)
    emit('update:modelValue', false)
    emit('saved', payment)
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
  <VDialog :model-value="modelValue" max-width="640" @update:model-value="emit('update:modelValue', $event)">
    <VCard class="kronos-card" rounded="xl">
      <VCardItem class="pa-6 pb-2" :title="title" :subtitle="subtitle" />
      <VForm @submit.prevent="save">
        <VCardText class="pa-6 d-flex flex-column ga-5">
          <VAutocomplete
            v-model="form.athleteId"
            :items="athleteItems"
            label="Buscar atleta"
            placeholder="Escribe un nombre"
            prepend-inner-icon="ri-search-line"
            clearable
            auto-select-first
            :disabled="lockAthlete"
          />

          <VRow>
            <VCol cols="12" sm="6">
              <VTextField v-model="form.period" type="month" label="Periodo que se paga" />
            </VCol>
            <VCol cols="12" sm="6">
              <VTextField v-model.number="form.amount" type="number" min="1" label="Monto aplicado" prefix="$" />
            </VCol>
          </VRow>

          <VSelect v-model="form.method" :items="paymentMethods" label="Método de pago" />
        </VCardText>

        <VCardActions class="pa-6 pt-0">
          <VSpacer />
          <VBtn variant="text" @click="emit('update:modelValue', false)">Cancelar</VBtn>
          <VBtn type="submit" :loading="saving" prepend-icon="ri-checkbox-circle-line">Aplicar y generar recibo</VBtn>
        </VCardActions>
      </VForm>
    </VCard>
  </VDialog>
</template>
