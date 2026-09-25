<script setup lang="ts">
import type { ExecutiveStoreMetric, StoreTimelinePoint } from '@/utils/reporting-executive'
import type { StoreMetricKey } from '@/utils/reporting-store'
import ReportMetricCard from './ReportMetricCard.vue'
import StoreTrendChart from './StoreTrendChart.vue'

defineProps<{
  metrics: ExecutiveStoreMetric[]
  timeline: StoreTimelinePoint[]
}>()

const emit = defineEmits<{ select: [key: StoreMetricKey] }>()
</script>

<template>
  <section aria-labelledby="executive-overview-title">
    <div class="d-flex flex-wrap align-end justify-space-between ga-3 mb-4">
      <div>
        <h2
          id="executive-overview-title"
          class="text-h5 mb-1"
        >
          Resumen ejecutivo
        </h2>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Indicadores de Tienda para el periodo y los filtros seleccionados.
        </p>
      </div>
      <VChip
        color="info"
        variant="tonal"
        prepend-icon="ri-information-line"
      >
        Comparación histórica no disponible
      </VChip>
    </div>

    <VAlert
      type="info"
      variant="tonal"
      class="mb-4"
    >
      Las fuentes auditables no exponen una fecha de cobertura histórica; por eso no se infiere una comparación anterior o interanual.
    </VAlert>
    <VAlert
      type="info"
      variant="tonal"
      class="mb-4"
    >
      Cobrado refleja pagos aplicados, no flujo de caja. Las devoluciones sólo se netean cuando existe un registro auditable.
    </VAlert>

    <VRow class="mb-2">
      <VCol
        v-for="metric in metrics"
        :key="metric.key"
        cols="12"
        sm="6"
        lg="4"
      >
        <ReportMetricCard
          :metric="metric"
          @select="emit('select', $event)"
        />
      </VCol>
      <VCol cols="12">
        <StoreTrendChart
          :points="timeline"
          @select="emit('select', $event)"
        />
      </VCol>
    </VRow>
  </section>
</template>
