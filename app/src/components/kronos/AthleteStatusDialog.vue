<script setup lang="ts">
import type { Athlete, AthleteStatus } from '@/types/domain'
import { formatDate, timestampValue } from '@/utils/kronos'

const props = defineProps<{
  modelValue: boolean
  athlete: Athlete | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'submit': [value: { toStatus: AthleteStatus; effectiveDate: string; expectedReturnDate?: string | null; reason: string; notes?: string | null }]
}>()

const today = () => {
  const date = new Date()

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const form = reactive({ toStatus: 'paused' as AthleteStatus, effectiveDate: today(), expectedReturnDate: '', reason: '', notes: '' })

const options = computed(() => props.athlete?.status === 'active'
  ? [{ title: 'Pausa temporal', value: 'paused' }, { title: 'Baja definitiva', value: 'inactive' }]
  : props.athlete?.status === 'paused'
    ? [{ title: 'Reactivar', value: 'active' }, { title: 'Baja definitiva', value: 'inactive' }]
    : [{ title: 'Reactivar', value: 'active' }])

const history = computed(() => Object.values(props.athlete?.lifecycleEvents ?? {}).sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt)))

const valid = computed(() => form.reason.trim().length >= 3
  && /^\d{4}-\d{2}-\d{2}$/.test(form.effectiveDate)
  && (form.toStatus !== 'paused' || !form.expectedReturnDate || form.expectedReturnDate >= form.effectiveDate))

watch(() => props.modelValue, open => {
  if (!open)
    return
  Object.assign(form, {
    toStatus: (options.value[0]?.value ?? 'active') as AthleteStatus,
    effectiveDate: today(), expectedReturnDate: '', reason: '', notes: '',
  })
})

function submit() {
  if (!valid.value)
    return
  emit('submit', {
    toStatus: form.toStatus,
    effectiveDate: form.effectiveDate,
    ...(form.toStatus === 'paused' ? { expectedReturnDate: form.expectedReturnDate || null } : {}),
    reason: form.reason.trim(),
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
  })
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="620"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard>
      <VCardItem
        title="Cambiar estado del atleta"
        :subtitle="athlete?.profile.name"
        prepend-icon="ri-user-settings-line"
      />
      <VCardText class="d-flex flex-column ga-4">
        <VAlert
          type="info"
          variant="tonal"
        >
          Pausa identifica a quien puede regresar. Baja es definitiva hasta una reactivación explícita. Los adeudos existentes no se eliminan.
        </VAlert>
        <VSelect
          v-model="form.toStatus"
          :items="options"
          label="Nuevo estado"
        />
        <VRow>
          <VCol cols="12" sm="6">
            <VTextField v-model="form.effectiveDate" type="date" label="Fecha efectiva" />
          </VCol>
          <VCol v-if="form.toStatus === 'paused'" cols="12" sm="6">
            <VTextField v-model="form.expectedReturnDate" type="date" label="Regreso esperado (opcional)" :min="form.effectiveDate" />
          </VCol>
        </VRow>
        <VTextarea v-model="form.reason" label="Motivo" rows="2" maxlength="500" counter="500" autofocus />
        <VTextarea v-model="form.notes" label="Notas internas (opcional)" rows="2" maxlength="500" counter="500" />
        <div v-if="history.length">
          <div class="text-subtitle-2 mb-2">Historial de estado</div>
          <VList density="compact" class="border rounded">
            <VListItem
              v-for="event in history"
              :key="event.id"
              :title="event.type === 'paused' ? 'Pausa' : event.type === 'inactive' ? 'Baja' : event.type === 'reactivated' ? 'Reactivación' : 'Alta'"
              :subtitle="`${formatDate(event.effectiveDate)} · ${event.reason}`"
            />
          </VList>
        </div>
        <VAlert v-else type="warning" variant="tonal">El historial anterior a esta actualización es parcial; los nuevos cambios sí quedarán auditados.</VAlert>
      </VCardText>
      <VCardActions class="justify-end flex-wrap ga-2">
        <VBtn variant="text" :disabled="loading" @click="emit('update:modelValue', false)">Cancelar</VBtn>
        <VBtn :loading="loading" :disabled="!valid" prepend-icon="ri-check-line" @click="submit">Guardar estado</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
