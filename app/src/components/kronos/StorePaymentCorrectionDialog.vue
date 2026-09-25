<script setup lang="ts">
import type { PaymentMethod, Sale, SalePayment, SalePaymentAdjustmentKind } from '@/types/domain'
import { formatCurrency, formatDate } from '@/utils/kronos'
import { paymentMethodLabel } from '@/utils/receipts'
import { resolveSalePaymentStates } from '@/utils/store-payment-adjustments'

export interface StorePaymentCorrectionTarget {
  sale: Sale
  payment: SalePayment
}

const props = defineProps<{
  modelValue: boolean
  targets: StorePaymentCorrectionTarget[]
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'submit': [value: { kind: SalePaymentAdjustmentKind; toMethod?: PaymentMethod; reason: string }]
}>()

const form = reactive({ kind: 'reversal' as SalePaymentAdjustmentKind, toMethod: null as PaymentMethod | null, reason: '' })

const methods = [
  { title: 'Efectivo', value: 'cash' },
  { title: 'Transferencia', value: 'transfer' },
  { title: 'Tarjeta', value: 'card' },
  { title: 'Otro', value: 'other' },
]

const resolvedTargets = computed(() => props.targets.map(target => ({
  ...target,
  state: resolveSalePaymentStates(target.sale).find(state => state.original.id === target.payment.id),
})))

const total = computed(() => resolvedTargets.value.reduce((sum, target) => sum + Number(target.payment.amountApplied || 0), 0))
const currentMethods = computed(() => new Set(resolvedTargets.value.map(target => target.state?.effectiveMethod ?? target.payment.method)))
const canChangeMethod = computed(() => currentMethods.value.size === 1 && !currentMethods.value.has('store-credit'))
const currentMethod = computed(() => [...currentMethods.value][0] as PaymentMethod | undefined)

const valid = computed(() => form.reason.trim().length >= 3
  && (form.kind === 'reversal' || (canChangeMethod.value && form.toMethod && form.toMethod !== currentMethod.value)))

watch(() => props.modelValue, value => {
  if (!value)
    return
  Object.assign(form, { kind: 'reversal', toMethod: null, reason: '' })
})

watch(() => form.kind, kind => {
  if (kind === 'method-change' && !canChangeMethod.value)
    form.kind = 'reversal'
})

function close() {
  if (!props.loading)
    emit('update:modelValue', false)
}

function submit() {
  if (!valid.value)
    return
  emit('submit', {
    kind: form.kind,
    ...(form.kind === 'method-change' && form.toMethod ? { toMethod: form.toMethod } : {}),
    reason: form.reason.trim(),
  })
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard>
      <VCardItem
        title="Corregir cobro"
        :subtitle="targets.length > 1 ? `${targets.length} aplicaciones del mismo cobro` : 'Una aplicación seleccionada'"
        prepend-icon="ri-error-warning-line"
      />
      <VCardText>
        <VAlert
          type="warning"
          variant="tonal"
          class="mb-5"
        >
          El movimiento original no se modifica. Kronos agregará una corrección auditada y recalculará el saldo pendiente.
        </VAlert>

        <VList
          density="compact"
          class="border rounded mb-5"
          aria-label="Cobros seleccionados"
        >
          <VListItem
            v-for="target in resolvedTargets"
            :key="`${target.sale.id}-${target.payment.id}`"
            :title="`${target.sale.customerName} · ${formatCurrency(target.payment.amountApplied)}`"
            :subtitle="`${formatDate(target.payment.appliedAt)} · ${paymentMethodLabel(target.state?.effectiveMethod ?? target.payment.method)}`"
            prepend-icon="ri-hand-coin-line"
          />
          <VDivider />
          <VListItem
            title="Importe afectado"
            :subtitle="formatCurrency(total)"
            prepend-icon="ri-money-dollar-circle-line"
          />
        </VList>

        <VRadioGroup
          v-model="form.kind"
          label="Acción"
          inline
        >
          <VRadio
            label="Reactivar adeudo"
            value="reversal"
          />
          <VRadio
            label="Corregir método"
            value="method-change"
            :disabled="!canChangeMethod"
          />
        </VRadioGroup>

        <VSelect
          v-if="form.kind === 'method-change'"
          v-model="form.toMethod"
          :items="methods"
          label="Método correcto"
          :hint="currentMethod ? `Método actual: ${paymentMethodLabel(currentMethod)}` : undefined"
          persistent-hint
          class="mb-4"
        />
        <VAlert
          v-else
          type="info"
          variant="tonal"
          class="mb-4"
        >
          Se reactivarán {{ formatCurrency(total) }} como saldo pendiente. Si el cobro generó saldo a favor ya consumido, no se aplicará ningún cambio.
        </VAlert>

        <VTextarea
          v-model="form.reason"
          label="Motivo de la corrección"
          placeholder="Ej. El cobro se aplicó al atleta equivocado"
          counter="500"
          maxlength="500"
          rows="3"
          autofocus
        />
      </VCardText>
      <VCardActions class="justify-end flex-wrap ga-2">
        <VBtn
          variant="text"
          :disabled="loading"
          @click="close"
        >
          Cancelar
        </VBtn>
        <VBtn
          color="warning"
          :loading="loading"
          :disabled="!valid"
          prepend-icon="ri-check-line"
          @click="submit"
        >
          Confirmar corrección
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
