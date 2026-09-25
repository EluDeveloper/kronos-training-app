<script setup lang="ts">
import type { Employee } from '@/types/workforce'
import { formatCurrency } from '@/utils/kronos'

const props = defineProps<{ modelValue: boolean; employees: Employee[]; loading?: boolean }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'submit': [value: { employeeId: string; date: string; quantity: number; note?: string; correctionReason?: string }]
}>()

const today = () => new Date().toISOString().slice(0, 10)
const form = reactive({ employeeId: '', date: today(), quantity: 1, note: '', correctionReason: '' })
const employee = computed(() => props.employees.find(item => item.id === form.employeeId) ?? null)
const estimated = computed(() => Number(form.quantity || 0) * Number(employee.value?.currentRate || 0))
const valid = computed(() => Boolean(employee.value && form.date && Number(form.quantity) > 0))

watch(() => props.modelValue, open => {
  if (open)
    Object.assign(form, { employeeId: props.employees[0]?.id ?? '', date: today(), quantity: 1, note: '', correctionReason: '' })
})
</script>

<template>
  <VDialog :model-value="modelValue" max-width="620" persistent @update:model-value="emit('update:modelValue', $event)">
    <VCard>
      <VCardItem title="Registrar trabajo" subtitle="La tarifa actual se congela en esta línea" prepend-icon="ri-calendar-check-line" />
      <VCardText class="d-flex flex-column ga-4">
        <VSelect v-model="form.employeeId" :items="employees.map(item => ({ title: item.name, value: item.id }))" label="Empleado" />
        <VRow>
          <VCol cols="12" sm="6"><VTextField v-model="form.date" type="date" label="Fecha" /></VCol>
          <VCol cols="12" sm="6"><VTextField v-model.number="form.quantity" type="number" min="0.01" step="0.01" :label="employee?.compensationUnit === 'class' ? 'Clases' : employee?.compensationUnit === 'day' ? 'Días' : 'Periodos'" /></VCol>
        </VRow>
        <VAlert v-if="employee" type="info" variant="tonal">Tarifa: {{ formatCurrency(employee.currentRate) }} · Importe: <strong>{{ formatCurrency(estimated) }}</strong></VAlert>
        <VTextarea v-model="form.note" label="Nota (opcional)" rows="2" />
        <VTextarea v-if="employee?.kind === 'cleaning'" v-model="form.correctionReason" label="Motivo si es una segunda asistencia del día" rows="2" />
      </VCardText>
      <VCardActions class="justify-end ga-2">
        <VBtn variant="text" :disabled="loading" @click="emit('update:modelValue', false)">Cancelar</VBtn>
        <VBtn :loading="loading" :disabled="!valid" @click="emit('submit', { employeeId: form.employeeId, date: form.date, quantity: Number(form.quantity), note: form.note, correctionReason: form.correctionReason })">Registrar</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
