<script setup lang="ts">
import TablePaginator from '@/components/kronos/TablePaginator.vue'
import { computed, ref } from 'vue'
import { formatCurrency } from '@/utils/kronos'
import type { WorkforceReport } from '@/utils/reporting-workforce'
import { buildWorkforceChart } from '@/utils/reporting-charts'
import type { ReportingFilters } from '@/types/reporting'
import ReportSeriesChart from './ReportSeriesChart.vue'

const props = defineProps<{ report: WorkforceReport; through: string; range: Pick<ReportingFilters, 'from' | 'through'> }>()
const chart = computed(() => buildWorkforceChart(props.report, props.range))
const selectedRow = ref<WorkforceReport['rows'][number] | null>(null)
const workPage = ref(1)
const settlementPage = ref(1)
const pageSize = ref(15)
const detailMode = ref<'accrued' | 'paid' | 'pending'>('accrued')

const cards = computed(() => [
  { key: 'accrued' as const, label: 'Devengado', value: props.report.summary.accrued, hint: 'por fecha de trabajo' },
  { key: 'paid' as const, label: 'Pagado', value: props.report.summary.paid, hint: 'por fecha efectiva de liquidación' },
  { key: 'pending' as const, label: 'Pendiente', value: props.report.summary.pending, hint: `acumulado al corte ${props.through}` },
])

const rows = computed(() => props.report.rows.filter(row => detailMode.value === 'accrued' ? row.accruedInPeriod : detailMode.value === 'paid' ? row.paidInPeriod : row.pendingAtCutoff))
const paginatedRows = computed(() => rows.value.slice((workPage.value - 1) * pageSize.value, workPage.value * pageSize.value))
const paginatedSettlements = computed(() => props.report.settlementRows.slice((settlementPage.value - 1) * pageSize.value, settlementPage.value * pageSize.value))
const qualityLabel = (quality: string) => ({ exact: 'Exacto', 'partial-history': 'Histórico parcial', unavailable: 'No disponible' }[quality] ?? quality)
const statusLabel = (status: string) => ({ pending: 'Pendiente', approved: 'Aprobado', paid: 'Pagado' }[status] ?? status)
const methodLabel = (method?: string) => method ? ({ cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro' }[method] ?? method) : 'No aplica'

async function show(mode: typeof detailMode.value) {
  detailMode.value = mode
  await nextTick()
  document.querySelector('#workforce-report-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <section aria-labelledby="workforce-report-title">
    <div class="mb-4">
      <h2
        id="workforce-report-title"
        class="text-h5 mb-1"
      >
        Personal
      </h2>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Devengado por fecha de trabajo, pagado por liquidación y pendiente acumulado al corte.
      </p>
    </div>
    <VAlert
      v-if="report.summary.quality !== 'exact'"
      type="warning"
      variant="tonal"
      class="mb-4"
      role="status"
    >
      Hay liquidaciones incompletas o inconsistentes. Sus importes no se presentan como pago confirmado.
    </VAlert>
    <VRow class="mb-2">
      <VCol
        v-for="card in cards"
        :key="card.key"
        cols="12"
        sm="4"
      >
        <VCard class="h-100">
          <VCardText class="d-flex flex-column h-100">
            <div class="d-flex justify-space-between ga-2">
              <h3 class="text-subtitle-1">
                {{ card.label }}
              </h3><VChip
                size="small"
                variant="tonal"
                :color="report.summary.quality === 'exact' ? 'success' : 'warning'"
              >
                {{ qualityLabel(report.summary.quality) }}
              </VChip>
            </div>
            <p class="text-h5 mt-3 mb-1">
              {{ formatCurrency(card.value) }}
            </p><p class="text-caption text-medium-emphasis flex-grow-1">
              {{ card.hint }}
            </p>
            <VBtn
              size="small"
              variant="tonal"
              class="align-self-start"
              :aria-label="`Ver detalle de ${card.label}`"
              @click="show(card.key)"
            >
              Ver detalle
            </VBtn>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
    <ReportSeriesChart :model="chart" />
    <VCard
      id="workforce-report-detail"
      class="mb-4"
    >
      <VCardTitle class="d-flex flex-wrap align-center justify-space-between ga-3">
        <span>Líneas de trabajo auditables</span>
        <VBtnToggle
          v-model="detailMode"
          mandatory
          density="compact"
          aria-label="Tipo de detalle de personal"
        >
          <VBtn value="accrued">
            Devengado
          </VBtn><VBtn value="paid">
            Pagado
          </VBtn><VBtn value="pending">
            Pendiente
          </VBtn>
        </VBtnToggle>
      </VCardTitle>
      <VCardText>
        <VAlert
          v-if="!rows.length"
          type="info"
          variant="tonal"
          role="status"
        >
          No hay líneas para este indicador con los filtros seleccionados.
        </VAlert>
        <div
          v-else
          class="overflow-x-auto"
        >
          <VTable density="comfortable">
            <thead>
              <tr>
                <th scope="col">
                  Empleado
                </th><th scope="col">
                  Trabajo
                </th><th scope="col">
                  Estado
                </th><th scope="col">
                  Liquidación
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Importe
                </th><th scope="col">
                  <span class="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in paginatedRows"
                :key="row.entryId"
              >
                <td>{{ row.employeeName }}<span class="d-block text-caption">ID {{ row.employeeId }}</span></td><td>{{ row.workDate }}<span class="d-block text-caption">ID {{ row.entryId }}</span></td><td>
                  <VChip
                    size="small"
                    variant="tonal"
                  >
                    {{ statusLabel(row.status) }}
                  </VChip>
                </td><td>
                  {{ row.settlementId ?? 'Sin liquidar' }}<span
                    v-if="row.settlementPaidAt"
                    class="d-block text-caption"
                  >{{ row.settlementPaidAt }} · {{ methodLabel(row.method) }}</span>
                </td><td class="text-end">
                  {{ formatCurrency(row.amount) }}
                </td><td class="text-end">
                  <VBtn
                    size="small"
                    variant="text"
                    :aria-label="`Ver línea ${row.entryId} de ${row.employeeName}`"
                    @click="selectedRow = row"
                  >
                    Ver registro
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
          <TablePaginator v-model:page="workPage" v-model:page-size="pageSize" :total="rows.length" label="líneas de trabajo" />
        </div>
      </VCardText>
    </VCard>
    <VCard>
      <VCardTitle>Liquidaciones del periodo</VCardTitle><VCardText>
        <VAlert
          v-if="!report.settlementRows.length"
          type="info"
          variant="tonal"
          role="status"
        >
          No hay liquidaciones para los filtros seleccionados.
        </VAlert>
        <div
          v-else
          class="overflow-x-auto"
        >
          <VTable density="compact">
            <thead>
              <tr>
                <th scope="col">
                  Liquidación
                </th><th scope="col">
                  Empleado
                </th><th scope="col">
                  Fecha / método
                </th><th scope="col">
                  Calidad
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Importe
                </th>
              </tr>
            </thead><tbody>
              <tr
                v-for="settlement in paginatedSettlements"
                :key="settlement.settlementId"
              >
                <td>{{ settlement.settlementId }}</td><td>{{ settlement.employeeName }}<span class="d-block text-caption">ID {{ settlement.employeeId }}</span></td><td>{{ settlement.paidAt }} · {{ methodLabel(settlement.method) }}</td><td>
                  <VChip
                    size="small"
                    variant="tonal"
                    :color="settlement.quality === 'exact' ? 'success' : 'warning'"
                  >
                    {{ qualityLabel(settlement.quality) }}
                  </VChip><span
                    v-if="settlement.note"
                    class="d-block text-caption"
                  >{{ settlement.note }}</span>
                </td><td class="text-end">
                  {{ formatCurrency(settlement.amount) }}
                </td>
              </tr>
            </tbody>
          </VTable>
          <TablePaginator v-model:page="settlementPage" v-model:page-size="pageSize" :total="report.settlementRows.length" label="liquidaciones" />
        </div>
      </VCardText>
    </VCard>
  </section>
  <VDialog
    :model-value="Boolean(selectedRow)"
    max-width="560"
    @update:model-value="value => !value && (selectedRow = null)"
  >
    <VCard v-if="selectedRow">
      <VCardTitle>Registro auditable de trabajo</VCardTitle><VCardText>
        <dl class="record-details">
          <div><dt>Empleado</dt><dd>{{ selectedRow.employeeName }} · {{ selectedRow.employeeId }}</dd></div><div><dt>Línea de trabajo</dt><dd>{{ selectedRow.entryId }}</dd></div><div><dt>Fecha / estado</dt><dd>{{ selectedRow.workDate }} · {{ statusLabel(selectedRow.status) }}</dd></div><div><dt>Importe</dt><dd>{{ formatCurrency(selectedRow.amount) }}</dd></div><div><dt>Liquidación</dt><dd>{{ selectedRow.settlementId ?? 'Sin liquidar' }}</dd></div><div><dt>Calidad</dt><dd>{{ qualityLabel(selectedRow.quality) }}</dd></div>
        </dl>
      </VCardText><VCardActions>
        <VSpacer /><VBtn
          variant="text"
          @click="selectedRow = null"
        >
          Cerrar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>.record-details{display:grid;gap:.75rem}.record-details>div{display:grid;grid-template-columns:minmax(8rem,.65fr) 1fr;gap:.25rem}.record-details dt{color:rgba(var(--v-theme-on-surface),var(--v-disabled-opacity))}.record-details dd{margin:0;overflow-wrap:anywhere}</style>
