<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatCurrency } from '@/utils/kronos'
import type { InventoryReport } from '@/utils/reporting-inventory'
import { buildInventoryChart } from '@/utils/reporting-charts'
import ReportSeriesChart from './ReportSeriesChart.vue'

const props = defineProps<{ report: InventoryReport }>()
const chart = computed(() => buildInventoryChart(props.report))
const selectedClosure = ref<InventoryReport['rows'][number] | null>(null)
const selectedResolution = ref<InventoryReport['resolutionRows'][number] | null>(null)
const detailMode = ref<'closures' | 'resolutions'>('closures')

const cards = computed(() => [
  { label: 'Diferencia neta', value: props.report.summary.differenceValue, hint: `${props.report.summary.differenceUnits} unidades`, mode: 'closures' as const },
  { label: 'Encontrado', value: props.report.summary.recoveredUnits, hint: 'unidades · sin movimiento de efectivo', mode: 'resolutions' as const, count: true },
  { label: 'Faltante cubierto', value: props.report.summary.coveredValue, hint: `${props.report.summary.coveredUnits} unidades · entrada de efectivo`, mode: 'resolutions' as const },
  { label: 'Fondo perdido', value: props.report.summary.writtenOffValue, hint: 'pérdida reconocida · no es egreso', mode: 'resolutions' as const },
])

const kindLabel = (kind: string) => ({ found: 'Artículo encontrado', covered: 'Faltante cubierto', 'written-off': 'Fondo perdido', corrected: 'Corrección documentada' }[kind] ?? kind)
const methodLabel = (method?: string | null) => method ? ({ cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro', 'store-credit': 'Saldo a favor' }[method] ?? method) : 'No aplica'

async function show(mode: 'closures' | 'resolutions') {
  detailMode.value = mode
  await nextTick()
  document.querySelector('#inventory-report-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <section aria-labelledby="inventory-report-title">
    <div class="mb-4">
      <h2
        id="inventory-report-title"
        class="text-h5 mb-1"
      >
        Inventario
      </h2>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Diferencias por fecha de cierre y resoluciones por su propia fecha efectiva.
      </p>
    </div>
    <VAlert
      type="info"
      variant="tonal"
      class="mb-4"
    >
      Sólo “Faltante cubierto” aporta flujo de entrada. Encontrado no mueve efectivo y fondo perdido no es un egreso.
    </VAlert>
    <VRow class="mb-2">
      <VCol
        v-for="card in cards"
        :key="card.label"
        cols="12"
        sm="6"
        lg="3"
      >
        <VCard class="h-100">
          <VCardText class="d-flex flex-column h-100">
            <h3 class="text-subtitle-1">
              {{ card.label }}
            </h3>
            <p class="text-h5 mt-3 mb-1">
              {{ card.count ? card.value : formatCurrency(card.value) }}
            </p>
            <p class="text-caption text-medium-emphasis flex-grow-1">
              {{ card.hint }}
            </p>
            <VBtn
              size="small"
              variant="tonal"
              class="align-self-start"
              :aria-label="`Ver detalle de ${card.label}`"
              @click="show(card.mode)"
            >
              Ver detalle
            </VBtn>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
    <ReportSeriesChart :model="chart" />
    <VCard id="inventory-report-detail">
      <VCardTitle class="d-flex flex-wrap align-center justify-space-between ga-3">
        <span>Registros auditables</span>
        <VBtnToggle
          v-model="detailMode"
          mandatory
          density="compact"
          aria-label="Tipo de detalle de inventario"
        >
          <VBtn value="closures">
            Cierres
          </VBtn><VBtn value="resolutions">
            Resoluciones
          </VBtn>
        </VBtnToggle>
      </VCardTitle>
      <VCardText>
        <VAlert
          v-if="detailMode === 'closures' && !report.rows.length"
          type="info"
          variant="tonal"
          role="status"
        >
          No hay cierres o resoluciones para los filtros seleccionados.
        </VAlert>
        <VAlert
          v-else-if="detailMode === 'resolutions' && !report.resolutionRows.length"
          type="info"
          variant="tonal"
          role="status"
        >
          No hay resoluciones para los filtros seleccionados.
        </VAlert>
        <div
          v-else
          class="overflow-x-auto"
        >
          <VTable
            v-if="detailMode === 'closures'"
            density="comfortable"
          >
            <thead>
              <tr>
                <th scope="col">
                  Cierre
                </th><th scope="col">
                  Producto
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Diferencia
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Valor
                </th><th scope="col">
                  <span class="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in report.rows"
                :key="`${row.closureId}-${row.productId}`"
              >
                <td>{{ row.closureDate }}<span class="d-block text-caption">ID {{ row.closureId }}</span></td><td>{{ row.productName }}<span class="d-block text-caption">ID {{ row.productId }}</span></td><td class="text-end">
                  {{ row.differenceUnits }}
                </td><td class="text-end">
                  {{ formatCurrency(row.differenceValue) }}
                </td><td class="text-end">
                  <VBtn
                    size="small"
                    variant="text"
                    :aria-label="`Ver cierre ${row.closureId} de ${row.productName}`"
                    @click="selectedClosure = row"
                  >
                    Ver registro
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
          <VTable
            v-else
            density="comfortable"
          >
            <thead>
              <tr>
                <th scope="col">
                  Resolución
                </th><th scope="col">
                  Producto
                </th><th scope="col">
                  Tipo
                </th><th scope="col">
                  Método
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Unidades
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
                v-for="row in report.resolutionRows"
                :key="row.resolutionId"
              >
                <td>{{ row.resolutionDate }}<span class="d-block text-caption">ID {{ row.resolutionId }}</span></td><td>{{ row.productName }}</td><td>{{ kindLabel(row.kind) }}</td><td>{{ methodLabel(row.method) }}</td><td class="text-end">
                  {{ row.units }}
                </td><td class="text-end">
                  {{ formatCurrency(row.amount) }}
                </td><td class="text-end">
                  <VBtn
                    size="small"
                    variant="text"
                    :aria-label="`Ver resolución ${row.resolutionId}`"
                    @click="selectedResolution = row"
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
    :model-value="Boolean(selectedClosure)"
    max-width="560"
    @update:model-value="value => !value && (selectedClosure = null)"
  >
    <VCard v-if="selectedClosure">
      <VCardTitle>Cierre auditable de inventario</VCardTitle><VCardText>
        <dl class="record-details">
          <div><dt>ID de cierre</dt><dd>{{ selectedClosure.closureId }}</dd></div><div><dt>Fecha efectiva</dt><dd>{{ selectedClosure.closureDate }}</dd></div><div><dt>Producto</dt><dd>{{ selectedClosure.productName }} · {{ selectedClosure.productId }}</dd></div><div><dt>Diferencia</dt><dd>{{ selectedClosure.differenceUnits }} unidades · {{ formatCurrency(selectedClosure.differenceValue) }}</dd></div>
        </dl>
      </VCardText><VCardActions>
        <VSpacer /><VBtn
          variant="text"
          @click="selectedClosure = null"
        >
          Cerrar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <VDialog
    :model-value="Boolean(selectedResolution)"
    max-width="560"
    @update:model-value="value => !value && (selectedResolution = null)"
  >
    <VCard v-if="selectedResolution">
      <VCardTitle>Resolución auditable de inventario</VCardTitle><VCardText>
        <dl class="record-details">
          <div><dt>ID</dt><dd>{{ selectedResolution.resolutionId }}</dd></div><div><dt>Ajuste / cierre</dt><dd>{{ selectedResolution.adjustmentId }} / {{ selectedResolution.closureId }}</dd></div><div><dt>Fecha efectiva</dt><dd>{{ selectedResolution.resolutionDate }}</dd></div><div><dt>Tipo</dt><dd>{{ kindLabel(selectedResolution.kind) }}</dd></div><div><dt>Unidades / importe</dt><dd>{{ selectedResolution.units }} / {{ formatCurrency(selectedResolution.amount) }}</dd></div><div><dt>Método</dt><dd>{{ methodLabel(selectedResolution.method) }}</dd></div>
        </dl>
      </VCardText><VCardActions>
        <VSpacer /><VBtn
          variant="text"
          @click="selectedResolution = null"
        >
          Cerrar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>.record-details{display:grid;gap:.75rem}.record-details>div{display:grid;grid-template-columns:minmax(8rem,.65fr) 1fr;gap:.25rem}.record-details dt{color:rgba(var(--v-theme-on-surface),var(--v-disabled-opacity))}.record-details dd{margin:0;overflow-wrap:anywhere}</style>
