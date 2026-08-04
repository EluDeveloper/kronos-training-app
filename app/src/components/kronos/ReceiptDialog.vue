<script setup lang="ts">
import KronosLogo from '@/components/kronos/KronosLogo.vue'
import { useNotifications } from '@/composables/useNotifications'
import type { ReceiptData } from '@/utils/receipts'
import { downloadReceipt, paymentMethodLabel, printReceipt, shareReceipt } from '@/utils/receipts'
import { formatCurrency, formatDate } from '@/utils/kronos'

const props = defineProps<{
  modelValue: boolean
  receipt: ReceiptData | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { success, failure } = useNotifications()
const working = ref(false)
const isCollection = computed(() => props.receipt?.kind === 'collection')
const documentLabel = computed(() => isCollection.value ? 'Aviso de pago' : 'Recibo')

async function run(action: 'download' | 'print' | 'share') {
  if (!props.receipt)
    return

  working.value = true
  try {
    if (action === 'download') {
      await downloadReceipt(props.receipt)
      success(`${documentLabel.value} descargado.`)
    }
    else if (action === 'print') {
      await printReceipt(props.receipt)
    }
    else {
      await shareReceipt(props.receipt)
      success('PDF descargado y WhatsApp Web abierto.')
    }
  }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return
    failure(error instanceof Error ? error.message : 'No fue posible generar el recibo.')
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard
      v-if="receipt"
      class="kronos-card"
      rounded="xl"
    >
      <div class="receipt-header pa-6">
        <KronosLogo class="receipt-logo" />
        <div class="text-right">
          <div class="text-overline text-kronos-orange">
            {{ isCollection ? 'AVISO DE PAGO' : 'RECIBO' }}
          </div>
          <div class="font-weight-bold">
            {{ receipt.folio }}
          </div>
        </div>
      </div>

      <VCardText class="pa-6">
        <div class="d-flex flex-wrap justify-space-between ga-3 mb-6">
          <div>
            <div class="text-caption text-medium-emphasis">
              Cliente
            </div><div class="text-h6 font-weight-bold">
              {{ receipt.customerName }}
            </div><div
              v-if="receipt.phone"
              class="text-body-2 text-medium-emphasis"
            >
              Celular: {{ receipt.phone }}
            </div>
          </div>
          <div class="text-sm-right">
            <div class="text-caption text-medium-emphasis">
              Fecha
            </div><div>{{ formatDate(receipt.issuedAt) }}</div>
          </div>
        </div>

        <VAlert
          color="info"
          variant="tonal"
          class="mb-5"
        >
          <strong>{{ receipt.concept }}</strong>
          <template v-if="!isCollection">
            <br>Método: {{ paymentMethodLabel(receipt.method) }}
          </template>
          <template v-else>
            <br>Este aviso no es un comprobante de pago.
          </template>
        </VAlert>

        <VTable
          density="comfortable"
          class="mb-5"
        >
          <thead>
            <tr>
              <th>CONCEPTO</th><th class="text-right">
                IMPORTE
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(line, index) in receipt.lines"
              :key="`${line.description}-${index}`"
            >
              <td>
                <strong>{{ line.quantity ? `${line.quantity} × ` : '' }}{{ line.description }}</strong><div
                  v-if="line.quantity && line.unitPrice != null"
                  class="text-caption text-medium-emphasis"
                >
                  {{ formatCurrency(line.unitPrice) }} por unidad
                </div>
              </td>
              <td class="text-right">
                {{ formatCurrency(line.amount) }}
              </td>
            </tr>
          </tbody>
        </VTable>

        <div
          v-if="!isCollection"
          class="receipt-totals ms-auto"
        >
          <div class="d-flex justify-space-between">
            <span>Total</span><strong>{{ formatCurrency(receipt.total) }}</strong>
          </div>
          <div class="d-flex justify-space-between">
            <span>{{ receipt.kind === 'sale-payment' || receipt.balance > 0 ? 'Abono recibido' : 'Pagado' }}</span><strong>{{ formatCurrency(receipt.amountPaid) }}</strong>
          </div>
          <div class="d-flex justify-space-between">
            <span>Saldo</span><strong>{{ formatCurrency(receipt.balance) }}</strong>
          </div>
          <div
            v-if="receipt.creditBalance != null"
            class="d-flex justify-space-between text-success"
          >
            <span>Saldo a favor</span><strong>{{ formatCurrency(receipt.creditBalance) }}</strong>
          </div>
          <VChip
            class="mt-3 justify-center"
            :color="receipt.balance > 0 ? 'error' : 'success'"
            variant="flat"
          >
            {{ receipt.balance > 0 ? 'Saldo pendiente' : 'Pago completo' }}
          </VChip>
        </div>
        <div
          v-else
          class="receipt-totals ms-auto"
        >
          <div class="d-flex justify-space-between text-h6">
            <span>Total a pagar</span><strong class="text-kronos-orange">{{ formatCurrency(receipt.total) }}</strong>
          </div>
          <VChip
            class="mt-3 justify-center"
            color="error"
            variant="flat"
          >
            Pendiente de pago
          </VChip>
        </div>
      </VCardText>

      <VCardActions class="pa-6 pt-0 flex-wrap ga-2">
        <VBtn
          variant="text"
          @click="emit('update:modelValue', false)"
        >
          Cerrar
        </VBtn>
        <VSpacer />
        <VBtn
          prepend-icon="ri-printer-line"
          variant="tonal"
          :disabled="working"
          @click="run('print')"
        >
          Imprimir
        </VBtn>
        <VBtn
          prepend-icon="ri-download-2-line"
          variant="tonal"
          :disabled="working"
          @click="run('download')"
        >
          PDF
        </VBtn>
        <VBtn
          prepend-icon="ri-whatsapp-line"
          color="success"
          :loading="working"
          @click="run('share')"
        >
          WhatsApp Web
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.receipt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1b1d1a;
  border-block-end: 1px solid rgba(151, 213, 222, 20%);
}

.receipt-logo {
  block-size: 58px;
  inline-size: min(55%, 230px);
}

.receipt-totals {
  display: grid;
  gap: 8px;
  max-inline-size: 280px;
}
</style>
