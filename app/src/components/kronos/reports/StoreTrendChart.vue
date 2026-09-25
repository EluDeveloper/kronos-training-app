<script setup lang="ts">
import { hexToRgb } from '@layouts/utils'
import { useTheme } from 'vuetify'
import { formatCurrency } from '@/utils/kronos'
import type { StoreTimelinePoint } from '@/utils/reporting-executive'

const props = defineProps<{ points: StoreTimelinePoint[] }>()
const emit = defineEmits<{ select: [key: 'recognizedRevenue' | 'collected' | 'recovered'] }>()
const theme = useTheme()

const series = computed(() => [
  { name: 'Venta reconocida', data: props.points.map(point => point.recognizedRevenue) },
  { name: 'Cobrado', data: props.points.map(point => point.collected) },
  { name: 'Recuperado', data: props.points.map(point => point.recovered) },
])

const options = computed(() => ({
  chart: {
    toolbar: { show: false },
    parentHeightOffset: 0,
    events: {
      dataPointSelection: (_event: unknown, _chart: unknown, config: { seriesIndex: number }) => {
        const metric = ['recognizedRevenue', 'collected', 'recovered'][config.seriesIndex] as 'recognizedRevenue' | 'collected' | 'recovered' | undefined
        if (metric)
          emit('select', metric)
      },
    },
  },
  colors: [
    `rgba(${hexToRgb(theme.current.value.colors.primary)},1)`,
    `rgba(${hexToRgb(theme.current.value.colors.success)},1)`,
    `rgba(${hexToRgb(theme.current.value.colors.warning)},1)`,
  ],
  stroke: { curve: 'smooth', width: 3 },
  markers: { size: 3, hover: { size: 5 } },
  dataLabels: { enabled: false },
  grid: { strokeDashArray: 5 },
  legend: { position: 'top', horizontalAlign: 'left' },
  xaxis: { categories: props.points.map(point => point.label), tickAmount: 8 },
  yaxis: { labels: { formatter: (value: number) => formatCurrency(value) } },
  tooltip: { y: { formatter: (value: number) => formatCurrency(value) } },
  noData: { text: 'Sin movimientos en el periodo seleccionado' },
}))
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>Tendencia de Tienda</VCardTitle>
      <VCardSubtitle>Venta por fecha de venta; cobros y recuperaciones por fecha de movimiento.</VCardSubtitle>
    </VCardItem>
    <VCardText>
      <VAlert
        v-if="!points.length"
        type="info"
        variant="tonal"
        role="status"
      >
        No hay movimientos para graficar en este periodo.
      </VAlert>
      <VueApexCharts
        v-else
        type="line"
        height="320"
        :options="options"
        :series="series"
        aria-label="Tendencia de venta reconocida, cobros y recuperaciones"
      />
      <p class="text-caption text-medium-emphasis mb-0">
        Recuperado forma parte de Cobrado. Las líneas no deben sumarse entre sí. Selecciona un punto para abrir su detalle.
      </p>
    </VCardText>
  </VCard>
</template>
