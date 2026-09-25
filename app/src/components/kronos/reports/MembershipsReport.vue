<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatCurrency } from '@/utils/kronos'
import type { MembershipReport } from '@/utils/reporting-memberships'
import { buildMembershipChart } from '@/utils/reporting-charts'
import type { ReportingFilters } from '@/types/reporting'
import ReportSeriesChart from './ReportSeriesChart.vue'

const props = defineProps<{ report: MembershipReport; range: Pick<ReportingFilters, 'from' | 'through'> }>()
const chart = computed(() => buildMembershipChart(props.report, props.range))
const selectedRow = ref<MembershipReport['rows'][number] | null>(null)

const cards = computed(() => [
  ['Esperado', props.report.summary.expected],
  ['Cobrado', props.report.summary.collected],
  ['Vencido', props.report.summary.overdue],
  ['Adelantado', props.report.summary.advanced],
  ['Pendiente', props.report.summary.receivable],
] as const)

const qualityLabel = (quality: string) => ({ exact: 'Exacto', 'partial-history': 'Histórico parcial', unavailable: 'No disponible' }[quality] ?? quality)
const statusLabel = (status: string) => ({ paid: 'Pagada', pending: 'Pendiente', overdue: 'Vencida', advance: 'Adelantada', unavailable: 'No disponible' }[status] ?? status)
const amount = (value: number | null) => value === null ? 'No disponible' : formatCurrency(value)
const methodLabel = (method: string) => ({ cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro', 'store-credit': 'Saldo a favor' }[method] ?? method)
</script>

<template>
  <section aria-labelledby="memberships-report-title">
    <div class="mb-4">
      <h2
        id="memberships-report-title"
        class="text-h5 mb-1"
      >
        Mensualidades
      </h2><p class="text-body-2 text-medium-emphasis mb-0">
        Obligación por periodo, cobros por fecha efectiva y saldo al corte.
      </p>
    </div>
    <VRow class="mb-2">
      <VCol
        v-for="[label, value] in cards"
        :key="label"
        cols="12"
        sm="6"
        lg="auto"
        class="flex-grow-1"
      >
        <VCard class="h-100">
          <VCardText>
            <div class="d-flex justify-space-between ga-2">
              <h3 class="text-subtitle-1">
                {{ label }}
              </h3><VChip
                size="small"
                variant="tonal"
                :color="report.summary.quality === 'exact' ? 'success' : 'warning'"
              >
                {{ qualityLabel(report.summary.quality) }}
              </VChip>
            </div><p class="text-h5 mb-0 mt-3">
              {{ amount(value) }}
            </p>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
    <ReportSeriesChart :model="chart" />
    <VCard>
      <VCardTitle>Obligaciones y pagos auditables</VCardTitle><VCardText>
        <VAlert
          v-if="!report.rows.length"
          type="info"
          variant="tonal"
          role="status"
        >
          No hay mensualidades para los filtros seleccionados.
        </VAlert><div
          v-else
          class="overflow-x-auto"
        >
          <VTable density="comfortable">
            <thead>
              <tr>
                <th scope="col">
                  Atleta ID
                </th><th scope="col">
                  Periodo
                </th><th scope="col">
                  Vencimiento
                </th><th scope="col">
                  Estado
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Esperado
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Cobrado
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Saldo
                </th><th scope="col">
                  <span class="sr-only">Acciones</span>
                </th>
              </tr>
            </thead><tbody>
              <tr
                v-for="row in report.rows"
                :key="row.athleteId + row.period"
              >
                <td>{{ row.athleteId }}</td><td>{{ row.period }}</td><td>{{ row.dueDate ?? 'No disponible' }}</td><td>
                  <VChip
                    size="small"
                    variant="tonal"
                  >
                    {{ statusLabel(row.status) }}
                  </VChip>
                </td><td class="text-end">
                  {{ amount(row.expected) }}
                </td><td class="text-end">
                  {{ amount(row.collected) }}
                </td><td class="text-end">
                  {{ amount(row.balance) }}
                </td><td class="text-end">
                  <VBtn
                    size="small"
                    variant="text"
                    :aria-label="`Ver mensualidad ${row.period} de ${row.athleteId}`"
                    @click="selectedRow = row"
                  >
                    Ver registro
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
        </div>
      </VCardText>
    </VCard>
  </section>
  <VDialog
    :model-value="Boolean(selectedRow)"
    max-width="520"
    @update:model-value="value => !value && (selectedRow = null)"
  >
    <VCard v-if="selectedRow">
      <VCardTitle>Registro auditable de mensualidad</VCardTitle><VCardText>
        <dl class="record-details">
          <div><dt>Atleta ID</dt><dd>{{ selectedRow.athleteId }}</dd></div><div><dt>Periodo</dt><dd>{{ selectedRow.period }}</dd></div><div><dt>Vencimiento</dt><dd>{{ selectedRow.dueDate ?? 'No disponible' }}</dd></div><div><dt>Esperado</dt><dd>{{ amount(selectedRow.expected) }}</dd></div><div><dt>Cobrado</dt><dd>{{ amount(selectedRow.collected) }}</dd></div><div><dt>Saldo al corte</dt><dd>{{ amount(selectedRow.balance) }}</dd></div><div><dt>Calidad</dt><dd>{{ qualityLabel(selectedRow.quality) }}</dd></div>
        </dl>
        <h3 class="text-subtitle-1 mt-5 mb-2">
          Movimientos efectivos
        </h3>
        <VAlert
          v-if="!selectedRow.movements.length"
          type="info"
          variant="tonal"
        >
          No hay abonos efectivos en el periodo filtrado.
        </VAlert>
        <VList
          v-else
          density="compact"
          lines="two"
        >
          <VListItem
            v-for="movement in selectedRow.movements"
            :key="movement.id"
            :title="`${amount(movement.amount)} · ${methodLabel(movement.method)}`"
            :subtitle="`${movement.effectiveDate} · ID ${movement.id}`"
          />
        </VList>
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
