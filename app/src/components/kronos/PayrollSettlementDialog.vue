<script setup lang="ts">
import type { PaymentMethod } from '@/types/domain'
import type { WorkEntry } from '@/types/workforce'
import { businessDateInMexicoCity } from '@/utils/business-date'
import { formatCurrency, formatDate } from '@/utils/kronos'

const props = defineProps<{ modelValue: boolean; entries: WorkEntry[]; loading?: boolean }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'submit': [value: { entryIds: string[]; paidAt: string; method: Exclude<PaymentMethod, 'store-credit'>; reference?: string }]
}>()

const form = reactive({ entryIds: [] as string[], paidAt: businessDateInMexicoCity(), method: 'transfer' as Exclude<PaymentMethod, 'store-credit'>, reference: '' })
const employeeIds = computed(() => new Set(form.entryIds.map(id => props.entries.find(item => item.id === id)?.employeeId).filter(Boolean)))
const selected = computed(() => props.entries.filter(item => form.entryIds.includes(item.id)))
const total = computed(() => selected.value.reduce((sum, item) => sum + item.amount, 0))

const options = computed(() => props.entries.filter(item => item.status !== 'paid').map(item => ({
  title: `${item.employeeName} · ${formatDate(`${item.date}T12:00:00`)} · ${formatCurrency(item.amount)}`,
  value: item.id,
})))

const valid = computed(() => form.entryIds.length > 0 && employeeIds.value.size === 1 && Boolean(form.paidAt))

watch(() => props.modelValue, open => {
  if (open)
    Object.assign(form, { entryIds: [], paidAt: businessDateInMexicoCity(), method: 'transfer', reference: '' })
})
</script>

<template>
  <VDialog :model-value="modelValue" max-width="700" persistent @update:model-value="emit('update:modelValue', $event)">
    <VCard>
      <VCardItem title="Liquidar trabajo" subtitle="Selecciona líneas del mismo empleado" prepend-icon="ri-hand-coin-line" />
      <VCardText class="d-flex flex-column ga-4">
        <VAutocomplete v-model="form.entryIds" :items="options" label="Trabajo a liquidar" multiple chips closable-chips />
        <VAlert v-if="employeeIds.size > 1" type="warning" variant="tonal">Una liquidación no puede mezclar empleados.</VAlert>
        <VAlert type="info" variant="tonal">Total a pagar: <strong>{{ formatCurrency(total) }}</strong></VAlert>
        <VRow>
          <VCol cols="12" sm="6"><VTextField v-model="form.paidAt" type="date" label="Fecha de pago" /></VCol>
          <VCol cols="12" sm="6"><VSelect v-model="form.method" :items="[{ title: 'Efectivo', value: 'cash' }, { title: 'Transferencia', value: 'transfer' }, { title: 'Tarjeta', value: 'card' }, { title: 'Otro', value: 'other' }]" label="Método" /></VCol>
        </VRow>
        <VTextField v-model="form.reference" label="Folio o referencia (opcional)" />
      </VCardText>
      <VCardActions class="justify-end ga-2">
        <VBtn variant="text" :disabled="loading" @click="emit('update:modelValue', false)">Cancelar</VBtn>
        <VBtn :loading="loading" :disabled="!valid" prepend-icon="ri-check-line" @click="emit('submit', { entryIds: form.entryIds, paidAt: form.paidAt, method: form.method, reference: form.reference })">Pagar y crear egreso</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
