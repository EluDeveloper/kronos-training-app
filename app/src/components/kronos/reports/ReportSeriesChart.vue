<script setup lang="ts">
import { computed, ref } from 'vue'
import { hexToRgb } from '@layouts/utils'
import { useTheme } from 'vuetify'
import { formatCurrency } from '@/utils/kronos'
import type { ReportingChartModel } from '@/utils/reporting-charts'

const props = defineProps<{ model: ReportingChartModel }>()
const theme = useTheme()
const showTable = ref(false)
const number = (value: number | null) => value === null ? 'No disponible' : props.model.unit === 'currency' ? formatCurrency(value) : new Intl.NumberFormat('es-MX').format(value)

const totals = computed(() => props.model.series.map(series => {
  const values = props.model.points.map(point => point.values[series.key])

  return { label: series.label, value: !values.length || values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0) }
}))

const colors = computed(() => ['primary', 'success', 'warning', 'info'].map(key => `rgba(${hexToRgb(theme.current.value.colors[key])},1)`))
const foreground = computed(() => `rgba(${hexToRgb(theme.current.value.colors['on-surface'])},1)`)
const series = computed(() => props.model.series.map(item => ({ name: item.label, type: item.kind === 'bar' ? 'column' : 'line', data: props.model.points.map(point => point.values[item.key]) })))

const options = computed(() => ({
  chart: { toolbar: { show: false }, parentHeightOffset: 0, animations: { enabled: false }, foreColor: foreground.value },
  theme: { mode: theme.current.value.dark ? 'dark' : 'light' },
  colors: colors.value,
  stroke: { width: props.model.series.map(item => item.kind === 'line' ? 3 : 0), dashArray: props.model.series.map(item => item.kind === 'line' ? 4 : 0) },
  markers: { size: 4 },
  dataLabels: { enabled: false },
  grid: { strokeDashArray: 4 },
  plotOptions: { bar: { columnWidth: '65%', borderRadius: 2 } },
  legend: { show: true, position: 'bottom', horizontalAlign: 'left', labels: { colors: foreground.value } },
  xaxis: { categories: props.model.points.map(point => point.label), labels: { rotate: -45, trim: true, hideOverlappingLabels: true, style: { colors: props.model.points.map(() => foreground.value) } } },
  yaxis: { labels: { formatter: (value: number) => props.model.unit === 'currency' ? formatCurrency(value) : String(value), style: { colors: [foreground.value] } } },
  tooltip: { shared: true, intersect: false, y: { formatter: (value: number | undefined) => value === undefined ? 'No disponible' : number(value) } },
  noData: { text: 'Sin datos disponibles' },
}))
</script>

<template>
  <VCard class="mb-4">
    <VCardItem>
      <VCardTitle>{{ model.title }}</VCardTitle>
      <VCardSubtitle class="text-wrap">
        {{ model.description }}
      </VCardSubtitle>
    </VCardItem>
    <VCardText>
      <VAlert
        v-if="model.state === 'empty'"
        type="info"
        variant="tonal"
        role="status"
        class="mb-3"
      >
        No hay datos para graficar con los filtros seleccionados.
      </VAlert>
      <VAlert
        v-else-if="model.state === 'partial' || model.state === 'unavailable'"
        type="warning"
        variant="tonal"
        role="status"
        class="mb-3"
      >
        Hay datos parciales o no disponibles; los huecos no representan cero.
      </VAlert>
      <div
        v-if="model.points.length"
        role="img"
        :aria-label="`${model.title}. ${model.description} ${totals.map(item => `${item.label}: ${number(item.value)}`).join('; ')}.`"
      >
        <VueApexCharts
          type="line"
          height="320"
          :options="options"
          :series="series"
          aria-hidden="true"
        />
      </div>
      <p
        class="text-body-2 mb-2"
        aria-live="polite"
      >
        Resumen: {{ totals.map(item => `${item.label}: ${number(item.value)}`).join(' · ') || 'sin valores' }}.
      </p>
      <p class="text-caption text-medium-emphasis mb-2">
        Series: {{ model.series.map(item => `${item.label} (${item.kind === 'line' ? 'línea' : 'barra'})`).join('; ') }}.
      </p>
      <VBtn
        variant="text"
        size="small"
        :aria-expanded="showTable"
        @click="showTable = !showTable"
      >
        {{ showTable ? 'Ocultar tabla de datos' : 'Mostrar tabla de datos' }}
      </VBtn>
      <div
        v-if="showTable"
        class="overflow-x-auto mt-2"
      >
        <VTable density="compact">
          <caption class="text-start">
            {{ model.title }}: datos por categoría
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Periodo / categoría
              </th><th
                v-for="item in model.series"
                :key="item.key"
                scope="col"
                class="text-end"
              >
                {{ item.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="point in model.points"
              :key="point.bucket"
            >
              <th scope="row">
                {{ point.label }}
              </th><td
                v-for="item in model.series"
                :key="item.key"
                class="text-end"
              >
                {{ number(point.values[item.key] ?? null) }}
              </td>
            </tr>
          </tbody>
        </VTable>
      </div>
    </VCardText>
  </VCard>
</template>
