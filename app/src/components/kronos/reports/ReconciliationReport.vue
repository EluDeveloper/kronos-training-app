<script setup lang="ts">
import TablePaginator from '@/components/kronos/TablePaginator.vue'
import { formatCurrency } from '@/utils/kronos'
import type { FinanceReport } from '@/utils/reporting-finance'
import { buildReconciliationChart } from '@/utils/reporting-charts'
import ReportSeriesChart from './ReportSeriesChart.vue'

const props = defineProps<{ report: FinanceReport }>()
const chart = computed(() => buildReconciliationChart(props.report))
const page = ref(1)
const pageSize = ref(15)
const paginatedClosures = computed(() => props.report.closures.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
</script>

<template>
  <section aria-labelledby="reconciliation-report-title">
    <div class="mb-4">
      <h2
        id="reconciliation-report-title"
        class="text-h5 mb-1"
      >
        Conciliación
      </h2>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Comparación de saldos esperados y contados en cierres persistidos.
      </p>
    </div>
    <VAlert
      type="info"
      variant="tonal"
      class="mb-4"
    >
      La diferencia es contado menos esperado. Se audita por separado y nunca modifica ingreso, egreso, utilidad o flujo.
    </VAlert>
    <VRow class="mb-3">
      <VCol
        cols="12"
        md="4"
      >
        <VCard class="h-100">
          <VCardText>
            <h3 class="text-subtitle-1">
              Diferencia en caja
            </h3><p class="text-h5 mt-3 mb-1">
              {{ formatCurrency(report.summary.cashVariance) }}
            </p><p class="text-caption text-medium-emphasis mb-0">
              Suma de cierres del periodo.
            </p>
          </VCardText>
        </VCard>
      </VCol>
      <VCol
        cols="12"
        md="4"
      >
        <VCard class="h-100">
          <VCardText>
            <h3 class="text-subtitle-1">
              Diferencia en banco
            </h3><p class="text-h5 mt-3 mb-1">
              {{ formatCurrency(report.summary.bankVariance) }}
            </p><p class="text-caption text-medium-emphasis mb-0">
              Suma de cierres del periodo.
            </p>
          </VCardText>
        </VCard>
      </VCol>
      <VCol
        cols="12"
        md="4"
      >
        <VCard class="h-100">
          <VCardText>
            <h3 class="text-subtitle-1">
              Diferencia total
            </h3><p class="text-h5 mt-3 mb-1">
              {{ formatCurrency(report.summary.totalVariance) }}
            </p><p class="text-caption text-medium-emphasis mb-0">
              Caja más banco; no es flujo.
            </p>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
    <ReportSeriesChart :model="chart" />
    <VCard id="reconciliation-report-detail">
      <VCardTitle>Cierres auditables</VCardTitle>
      <VCardText>
        <VAlert
          v-if="!report.closures.length"
          type="info"
          variant="tonal"
          role="status"
        >
          No hay cierres para el periodo seleccionado.
        </VAlert>
        <div
          v-else
          class="overflow-x-auto"
        >
          <VTable density="comfortable">
            <thead>
              <tr>
                <th scope="col">
                  Cierre / rango
                </th><th scope="col">
                  Apertura
                </th><th scope="col">
                  Esperado
                </th><th scope="col">
                  Contado
                </th><th scope="col">
                  Variación
                </th><th scope="col">
                  <span class="sr-only">Acciones</span>
                </th>
              </tr>
            </thead><tbody>
              <tr
                v-for="closure in paginatedClosures"
                :key="closure.id"
              >
                <td>
                  {{ closure.date }}<span class="d-block text-caption">Desde {{ closure.movementFrom }}</span><VChip
                    v-if="closure.isBaseline"
                    size="x-small"
                    variant="tonal"
                    class="mt-1"
                  >
                    Baseline · sin movimientos
                  </VChip>
                </td><td>Caja {{ formatCurrency(closure.openingCash) }}<span class="d-block text-caption">Banco {{ formatCurrency(closure.openingBank) }}</span></td><td>Caja {{ formatCurrency(closure.expectedCash) }}<span class="d-block text-caption">Banco {{ formatCurrency(closure.expectedBank) }}</span></td><td>Caja {{ formatCurrency(closure.countedCash) }}<span class="d-block text-caption">Banco {{ formatCurrency(closure.countedBank) }}</span></td><td>Caja {{ formatCurrency(closure.cashVariance) }}<span class="d-block text-caption">Banco {{ formatCurrency(closure.bankVariance) }}</span></td><td class="text-end">
                  <VBtn
                    to="/cierres"
                    size="small"
                    variant="text"
                    :aria-label="`Abrir cierre ${closure.id}`"
                  >
                    Abrir cierre
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
          <TablePaginator v-model:page="page" v-model:page-size="pageSize" :total="report.closures.length" label="cierres" />
        </div>
      </VCardText>
    </VCard>
  </section>
</template>
