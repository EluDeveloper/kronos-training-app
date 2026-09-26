<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatCurrency } from '@/utils/kronos'
import { metricDefinitions } from '@/utils/reporting-metrics'
import { buildStoreDetailRecords, type StoreDetailRecord } from '@/utils/reporting-executive'
import type { StoreMetricKey, StoreReport } from '@/utils/reporting-store'
import TablePaginator from '@/components/kronos/TablePaginator.vue'

const props = defineProps<{
  report: StoreReport
  metric: StoreMetricKey
  through: string
}>()

const selectedRecord = ref<StoreDetailRecord | null>(null)
const definition = computed(() => metricDefinitions.find(item => item.key === props.metric))
const records = computed(() => buildStoreDetailRecords(props.report, props.metric))
const page = ref(1)
const pageSize = ref(15)
const paginatedRecords = computed(() => records.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const isMovement = computed(() => props.metric === 'collected' || props.metric === 'recovered')
const dateLabel = computed(() => isMovement.value ? 'Fecha de movimiento' : props.metric === 'receivable' ? 'Fecha de venta · saldo al corte' : props.metric === 'cancellations' ? 'Fecha de cancelación' : 'Fecha de venta')

const methodLabels: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
  'store-credit': 'Saldo a favor',
}

function formatAmount(record: StoreDetailRecord) {
  if (record.amount === null)
    return 'No disponible · histórico parcial'
  if (props.metric === 'unitsSold')
    return new Intl.NumberFormat('es-MX').format(record.amount)
  if (props.metric === 'grossMargin')
    return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(record.amount)}%`

  return formatCurrency(record.amount)
}

function qualityLabel(quality: StoreDetailRecord['quality']) {
  return ({
    exact: 'Exacto',
    proportional: 'Asignación proporcional',
    'partial-history': 'Histórico parcial',
    unavailable: 'No disponible',
  })[quality]
}
</script>

<template>
  <VCard id="report-detail">
    <VCardItem>
      <VCardTitle>Detalle: {{ definition?.label }}</VCardTitle>
      <VCardSubtitle>{{ definition?.meaning }}</VCardSubtitle>
    </VCardItem>
    <VCardText>
      <VAlert
        v-if="metric === 'receivable'"
        type="info"
        variant="tonal"
        class="mb-4"
      >
        El saldo corresponde al corte del {{ through }}; puede incluir ventas anteriores al inicio del periodo.
      </VAlert>
      <VAlert
        v-if="!records.length"
        type="info"
        variant="tonal"
        role="status"
      >
        No hay registros para este indicador con los filtros seleccionados.
      </VAlert>
      <div
        v-else
        class="overflow-x-auto"
      >
        <VTable density="comfortable">
          <thead>
            <tr>
              <th scope="col">
                Registro
              </th>
              <th scope="col">
                {{ dateLabel }}
              </th>
              <th scope="col">
                Producto
              </th>
              <th
                v-if="isMovement"
                scope="col"
              >
                Método
              </th>
              <th scope="col">
                Calidad
              </th>
              <th
                class="text-end"
                scope="col"
              >
                {{ props.metric === 'unitsSold' ? 'Unidades' : 'Importe' }}
              </th>
              <th scope="col">
                <span class="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in paginatedRecords"
              :key="record.key"
            >
              <td class="text-no-wrap">
                {{ record.payment ? `Pago ${record.payment.id}` : `Venta ${record.saleId}` }}
              </td>
              <td class="text-no-wrap">
                {{ record.date }}
              </td>
              <td>
                <span class="font-weight-medium">{{ record.productName }}</span>
                <span class="text-caption text-medium-emphasis d-block">ID {{ record.productId }}</span>
              </td>
              <td v-if="isMovement">
                {{ record.payment ? methodLabels[record.payment.method] ?? record.payment.method : '—' }}
              </td>
              <td>
                <VChip
                  size="small"
                  variant="tonal"
                  :color="record.quality === 'exact' ? 'success' : record.quality === 'proportional' ? 'info' : 'warning'"
                >
                  {{ qualityLabel(record.quality) }}
                </VChip>
              </td>
              <td class="text-end text-no-wrap">
                {{ formatAmount(record) }}
              </td>
              <td class="text-end">
                <VBtn
                  size="small"
                  variant="text"
                  :aria-label="`Ver registro ${record.saleId}, ${record.productName}`"
                  @click="selectedRecord = record"
                >
                  Ver registro
                </VBtn>
              </td>
            </tr>
          </tbody>
        </VTable>
        <TablePaginator v-model:page="page" v-model:page-size="pageSize" :total="records.length" label="detalles" />
      </div>
    </VCardText>
  </VCard>

  <VDialog
    :model-value="Boolean(selectedRecord)"
    max-width="560"
    @update:model-value="value => !value && (selectedRecord = null)"
  >
    <VCard v-if="selectedRecord">
      <VCardTitle>Registro auditable de Tienda</VCardTitle>
      <VCardText>
        <dl class="report-record-details">
          <div><dt>ID de venta</dt><dd>{{ selectedRecord.saleId }}</dd></div>
          <div v-if="selectedRecord.payment">
            <dt>ID de pago</dt><dd>{{ selectedRecord.payment.id }}</dd>
          </div>
          <div><dt>Producto</dt><dd>{{ selectedRecord.productName }} · {{ selectedRecord.productId }}</dd></div>
          <div><dt>Fecha atribuida</dt><dd>{{ selectedRecord.date }}</dd></div>
          <div><dt>Cantidad de la partida</dt><dd>{{ selectedRecord.quantity }}</dd></div>
          <div><dt>{{ definition?.label }}</dt><dd>{{ formatAmount(selectedRecord) }}</dd></div>
          <div><dt>Calidad</dt><dd>{{ qualityLabel(selectedRecord.quality) }}</dd></div>
          <div v-if="selectedRecord.payment">
            <dt>Método</dt><dd>{{ methodLabels[selectedRecord.payment.method] ?? selectedRecord.payment.method }}</dd>
          </div>
          <div v-if="selectedRecord.payment">
            <dt>Recuperación</dt><dd>{{ selectedRecord.payment.recovered ? 'Sí · cobro posterior a la venta' : 'No · cobro de la fecha de venta' }}</dd>
          </div>
        </dl>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn
          variant="text"
          @click="selectedRecord = null"
        >
          Cerrar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.report-record-details {
  display: grid;
  gap: 0.75rem;
  margin: 0;
}

.report-record-details > div {
  display: grid;
  gap: 0.25rem;
  grid-template-columns: minmax(8rem, 0.65fr) 1fr;
}

.report-record-details dt {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.report-record-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
