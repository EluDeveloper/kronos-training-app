<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { usePaymentsStore } from '@/stores/payments'
import { currentPeriod, type PaymentMethod } from '@/types/domain'
import { formatCurrency, formatDate, timestampValue } from '@/utils/kronos'

const athletes = useAthletesStore()
const payments = usePaymentsStore()
const { success, failure } = useNotifications()
const dialog = ref(false)
const saving = ref(false)
const form = reactive({ athleteId: '', period: currentPeriod(), amount: 0, method: 'cash' as PaymentMethod })

const athleteItems = computed(() => athletes.active.map(item => ({ title: item.profile.name, value: item.id })))
const recent = computed(() => [...payments.paid].sort((a, b) => timestampValue(b.appliedAt) - timestampValue(a.appliedAt)).slice(0, 30))
const athleteName = (id: string) => athletes.items.find(item => item.id === id)?.profile.name ?? 'Atleta'

watch(() => form.athleteId, id => {
  const athlete = athletes.items.find(item => item.id === id)
  if (athlete)
    form.amount = athlete.membership.agreedAmount
})

function openForm() {
  form.athleteId = athletes.active[0]?.id ?? ''
  form.period = currentPeriod()
  form.amount = athletes.active[0]?.membership.agreedAmount ?? 0
  form.method = 'cash'
  dialog.value = true
}

async function save() {
  if (!form.athleteId || !/^\d{4}-\d{2}$/.test(form.period) || form.amount <= 0) {
    failure('Selecciona atleta, periodo y monto válido.')
    return
  }
  saving.value = true
  try {
    await payments.save({ athleteId: form.athleteId, period: form.period, amount: Number(form.amount), method: form.method, status: 'paid', appliedAt: Date.now() })
    success(`Pago ${form.period} aplicado.`)
    dialog.value = false
  }
  catch (error) { failure(error instanceof Error ? error.message : 'No fue posible aplicar el pago.') }
  finally { saving.value = false }
}

onMounted(() => { athletes.subscribe(); payments.subscribe() })
onBeforeUnmount(() => { athletes.dispose(); payments.dispose() })
</script>

<template>
  <PageHeader title="Mensualidades" eyebrow="Cobranza" description="Pagos por periodo sin dependencias de un año fijo.">
    <template #actions><VBtn prepend-icon="ri-add-circle-line" :disabled="!athletes.active.length" @click="openForm">Aplicar pago</VBtn></template>
  </PageHeader>

  <VCard class="kronos-card" rounded="xl">
    <VCardItem title="Pagos recientes" :subtitle="`${recent.length} registros mostrados`" />
    <VCardText>
      <EmptyState v-if="!recent.length" title="Sin pagos aplicados" description="Registra la primera mensualidad." icon="ri-wallet-line" />
      <VTable v-else>
        <thead><tr><th>Atleta</th><th>Periodo</th><th>Método</th><th>Aplicado</th><th class="text-right">Monto</th></tr></thead>
        <tbody><tr v-for="payment in recent" :key="`${payment.athleteId}-${payment.period}`"><td class="font-weight-bold">{{ athleteName(payment.athleteId) }}</td><td>{{ payment.period }}</td><td class="text-capitalize">{{ payment.method }}</td><td>{{ formatDate(payment.appliedAt) }}</td><td class="text-right text-success font-weight-bold">{{ formatCurrency(payment.amount ?? 0) }}</td></tr></tbody>
      </VTable>
    </VCardText>
  </VCard>

  <VDialog v-model="dialog" max-width="560">
    <VCard class="kronos-card" title="Aplicar mensualidad">
      <VCardText class="d-flex flex-column ga-4">
        <VSelect v-model="form.athleteId" :items="athleteItems" label="Atleta" />
        <VTextField v-model="form.period" type="month" label="Periodo" />
        <VTextField v-model.number="form.amount" type="number" min="1" label="Monto aplicado" prefix="$" />
        <VSelect v-model="form.method" :items="[{ title: 'Efectivo', value: 'cash' }, { title: 'Transferencia', value: 'transfer' }, { title: 'Tarjeta', value: 'card' }, { title: 'Otro', value: 'other' }]" label="Método" />
      </VCardText>
      <VCardActions><VSpacer /><VBtn variant="text" @click="dialog = false">Cancelar</VBtn><VBtn :loading="saving" @click="save">Aplicar</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>
