<script setup lang="ts">
import type { InventoryAdjustment, InventoryClosure, InventoryResolution, InventoryResolutionKind, PaymentMethod } from '@/types/domain'
import { formatCurrency } from '@/utils/kronos'

const props = defineProps<{
  modelValue: boolean
  closure: InventoryClosure | null
  resolutions: InventoryResolution[]
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'submit': [value: { adjustmentId: string; kind: InventoryResolutionKind; units: number; amount?: number; method?: PaymentMethod; reference?: string; reason: string }]
}>()

const form = reactive({ adjustmentId: '', kind: 'found' as InventoryResolutionKind, units: 1, amount: 0, method: 'cash' as PaymentMethod, reference: '', reason: '' })
const adjustments = computed(() => Object.values(props.closure?.adjustments ?? {}).filter(item => item.varianceUnits < 0))

const resolvedUnits = (adjustmentId: string) => props.resolutions
  .filter(item => item.adjustmentId === adjustmentId)
  .reduce((sum, item) => sum + Number(item.units || 0), 0)

const options = computed(() => adjustments.value.map(adjustment => ({
  title: `${props.closure?.items[adjustment.productId]?.name ?? adjustment.productId} · ${pendingUnits(adjustment)} pendiente(s)`,
  value: adjustment.id,
  disabled: pendingUnits(adjustment) <= 0,
})))

const selected = computed(() => adjustments.value.find(item => item.id === form.adjustmentId) ?? null)
const pendingUnits = (adjustment: InventoryAdjustment) => Math.max(0, -adjustment.varianceUnits - resolvedUnits(adjustment.id))

const valid = computed(() => Boolean(selected.value)
  && Number.isInteger(Number(form.units))
  && Number(form.units) > 0
  && Number(form.units) <= pendingUnits(selected.value!)
  && form.reason.trim().length >= 3
  && (form.kind !== 'covered' || (form.method && Number(form.amount) > 0)))

watch(() => props.modelValue, open => {
  if (!open)
    return
  const first = options.value.find(option => !option.disabled)

  Object.assign(form, { adjustmentId: first?.value ?? '', kind: 'found', units: 1, amount: 0, method: 'cash', reference: '', reason: '' })
})

watch([() => form.kind, selected], ([kind, adjustment]) => {
  if (kind === 'covered' && adjustment)
    form.amount = Number(form.units || 0) * adjustment.unitCostSnapshot
})

watch(() => form.units, units => {
  if (form.kind === 'covered' && selected.value)
    form.amount = Number(units || 0) * selected.value.unitCostSnapshot
})

function submit() {
  if (!valid.value)
    return
  emit('submit', {
    adjustmentId: form.adjustmentId,
    kind: form.kind,
    units: Number(form.units),
    ...(form.kind === 'covered' ? { amount: Number(form.amount), method: form.method } : {}),
    ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
    reason: form.reason.trim(),
  })
}
</script>

<template>
  <VDialog :model-value="modelValue" max-width="700" persistent @update:model-value="emit('update:modelValue', $event)">
    <VCard>
      <VCardItem title="Resolver diferencia de inventario" :subtitle="closure ? `Cierre ${closure.weekStart}` : undefined" prepend-icon="ri-scales-3-line" />
      <VCardText class="d-flex flex-column ga-4">
        <VAlert type="info" variant="tonal">
          Cada resolución se agrega a la bitácora. “Encontrado” devuelve unidades al stock; “Cubierto” registra la recuperación; “Fondo perdido” conserva la pérdida sin crear un egreso duplicado.
        </VAlert>
        <VSelect v-model="form.adjustmentId" :items="options" label="Producto con faltante" />
        <template v-if="selected">
          <div class="d-flex flex-wrap justify-space-between ga-2 text-body-2">
            <span>Pendientes: <strong>{{ pendingUnits(selected) }}</strong></span>
            <span>Costo unitario: <strong>{{ formatCurrency(selected.unitCostSnapshot) }}</strong></span>
          </div>
          <VSelect
            v-model="form.kind"
            :items="[
              { title: 'Artículo encontrado', value: 'found' },
              { title: 'Faltante cubierto', value: 'covered' },
              { title: 'Fondo perdido', value: 'written-off' },
              { title: 'Corrección documentada', value: 'corrected' },
            ]"
            label="Tipo de resolución"
          />
          <VTextField v-model.number="form.units" type="number" min="1" :max="pendingUnits(selected)" label="Unidades a resolver" />
          <VRow v-if="form.kind === 'covered'">
            <VCol cols="12" sm="6"><VTextField v-model.number="form.amount" type="number" min="0.01" step="0.01" prefix="$" label="Monto recuperado" /></VCol>
            <VCol cols="12" sm="6"><VSelect v-model="form.method" :items="[{ title: 'Efectivo', value: 'cash' }, { title: 'Transferencia', value: 'transfer' }, { title: 'Tarjeta', value: 'card' }, { title: 'Otro', value: 'other' }]" label="Método" /></VCol>
          </VRow>
          <VTextField v-model="form.reference" label="Referencia (opcional)" maxlength="100" />
          <VTextarea v-model="form.reason" label="Motivo y evidencia" rows="3" maxlength="500" counter="500" />
        </template>
        <VAlert v-else type="success" variant="tonal">Todos los faltantes de este cierre ya están resueltos.</VAlert>
      </VCardText>
      <VCardActions class="justify-end flex-wrap ga-2">
        <VBtn variant="text" :disabled="loading" @click="emit('update:modelValue', false)">Cerrar</VBtn>
        <VBtn color="warning" :loading="loading" :disabled="!valid" prepend-icon="ri-check-line" @click="submit">Registrar resolución</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
