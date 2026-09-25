<script setup lang="ts">
import { computed } from 'vue'
import { metricDefinitions } from '@/utils/reporting-metrics'
import type { StoreMetricKey, StoreReport as StoreReportData } from '@/utils/reporting-store'
import ReportDetailTable from './ReportDetailTable.vue'

const props = defineProps<{
  report: StoreReportData
  metric: StoreMetricKey
  through: string
}>()

const label = computed(() => metricDefinitions.find(definition => definition.key === props.metric)?.label ?? 'Indicador')
</script>

<template>
  <section aria-labelledby="store-report-title">
    <div class="d-flex flex-wrap align-end justify-space-between ga-3 mb-4">
      <div>
        <h2
          id="store-report-title"
          class="text-h5 mb-1"
        >
          Reporte de Tienda
        </h2>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Detalle filtrado para {{ label.toLocaleLowerCase('es-MX') }}. Selecciona un registro para ver su procedencia auditable.
        </p>
      </div>
      <VBtn
        variant="text"
        href="#executive-overview-title"
      >
        Volver al resumen
        <VIcon
          end
          icon="ri-arrow-up-line"
        />
      </VBtn>
    </div>
    <ReportDetailTable
      :report="report"
      :metric="metric"
      :through="through"
    />
  </section>
</template>
