<script setup lang="ts">
import { formatCurrency } from '@/utils/kronos'
import type { ExecutiveStoreMetric } from '@/utils/reporting-executive'

defineProps<{ metric: ExecutiveStoreMetric }>()

const emit = defineEmits<{ select: [key: ExecutiveStoreMetric['key']] }>()

const qualityLabels = {
  exact: 'Exacto',
  proportional: 'Asignación proporcional',
  'partial-history': 'Histórico parcial',
  unavailable: 'No disponible',
}

function formatValue(metric: ExecutiveStoreMetric) {
  if (metric.value === null)
    return 'No disponible'
  if (metric.unit === 'currency')
    return formatCurrency(metric.value)
  if (metric.unit === 'percentage')
    return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(metric.value)}%`

  return new Intl.NumberFormat('es-MX').format(metric.value)
}
</script>

<template>
  <VCard
    class="h-100"
    :data-metric="metric.key"
  >
    <VCardText class="d-flex flex-column h-100">
      <div class="d-flex align-start justify-space-between ga-2 mb-3">
        <h3 class="text-subtitle-1 font-weight-medium">
          {{ metric.label }}
        </h3>
        <VChip
          size="small"
          variant="tonal"
          :color="metric.quality === 'exact' ? 'success' : metric.quality === 'proportional' ? 'info' : 'warning'"
        >
          {{ qualityLabels[metric.quality] }}
        </VChip>
      </div>
      <p class="text-h5 font-weight-semibold mb-2">
        {{ formatValue(metric) }}
      </p>
      <p class="text-body-2 text-medium-emphasis flex-grow-1 mb-4">
        {{ metric.meaning }}
      </p>
      <VBtn
        class="align-self-start"
        variant="tonal"
        size="small"
        :aria-label="`Ver detalle de ${metric.label}`"
        @click="emit('select', metric.key)"
      >
        Ver detalle
        <VIcon
          end
          icon="ri-arrow-right-line"
        />
      </VBtn>
    </VCardText>
  </VCard>
</template>
