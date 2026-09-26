<script setup lang="ts">
import TablePaginator from '@/components/kronos/TablePaginator.vue'
import { computed, ref } from 'vue'
import { buildAthleteTimeline, type AthleteReport } from '@/utils/reporting-athletes'
import { buildAthleteChart } from '@/utils/reporting-charts'
import type { ReportingFilters } from '@/types/reporting'
import ReportSeriesChart from './ReportSeriesChart.vue'

const props = defineProps<{ report: AthleteReport; range: Pick<ReportingFilters, 'from' | 'through'> }>()
const chart = computed(() => buildAthleteChart(props.report, props.range))
const selectedEvent = ref<AthleteReport['rows'][number] | null>(null)
const eventPage = ref(1)
const eventPageSize = ref(15)
const paginatedEvents = computed(() => props.report.rows.slice((eventPage.value - 1) * eventPageSize.value, eventPage.value * eventPageSize.value))
const granularity = ref<'day' | 'month' | 'year'>('day')
const timeline = computed(() => buildAthleteTimeline(props.report.rows, granularity.value))

const cards = computed(() => [
  ['Activos', props.report.summary.active],
  ['Pausados', props.report.summary.paused],
  ['Bajas al corte', props.report.summary.inactive],
  ['Altas', props.report.summary.enrollments],
  ['Pausas', props.report.summary.pauses],
  ['Bajas del periodo', props.report.summary.exits],
  ['Reactivaciones', props.report.summary.reactivations],
] as const)

const qualityLabel = (quality: string) => ({ exact: 'Exacto', 'partial-history': 'Histórico parcial', unavailable: 'No disponible' }[quality] ?? quality)
const eventLabel = (type: string) => ({ created: 'Alta', paused: 'Pausa', inactive: 'Baja', reactivated: 'Reactivación' }[type] ?? type)
</script>

<template>
  <section aria-labelledby="athletes-report-title">
    <div class="mb-4">
      <h2
        id="athletes-report-title"
        class="text-h5 mb-1"
      >
        Atletas
      </h2>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Estados al corte y transiciones por fecha efectiva, identificados sólo por ID.
      </p>
    </div>
    <VRow class="mb-2">
      <VCol
        v-for="[label, metric] in cards"
        :key="label"
        cols="12"
        sm="6"
        lg="3"
      >
        <VCard class="h-100">
          <VCardText>
            <div class="d-flex justify-space-between ga-2">
              <h3 class="text-subtitle-1">
                {{ label }}
              </h3><VChip
                size="small"
                variant="tonal"
                :color="metric.quality === 'exact' ? 'success' : 'warning'"
              >
                {{ qualityLabel(metric.quality) }}
              </VChip>
            </div>
            <p class="text-h5 mb-0 mt-3">
              {{ metric.value ?? 'No disponible' }}
            </p>
            <p
              v-if="metric.note"
              class="text-caption text-medium-emphasis mt-2 mb-0"
            >
              {{ metric.note }}
            </p>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
    <VAlert
      v-if="report.summary.retention.value === null"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      {{ report.summary.retention.note }}
    </VAlert>
    <ReportSeriesChart :model="chart" />
    <VCard class="mb-4">
      <VCardTitle class="d-flex flex-wrap align-center justify-space-between ga-3">
        <span>Evolución de eventos</span>
        <VBtnToggle
          v-model="granularity"
          mandatory
          density="compact"
          aria-label="Agrupación de evolución de atletas"
        >
          <VBtn value="day">
            Día
          </VBtn>
          <VBtn value="month">
            Mes
          </VBtn>
          <VBtn value="year">
            Año
          </VBtn>
        </VBtnToggle>
      </VCardTitle>
      <VCardText>
        <VAlert
          v-if="!timeline.length"
          type="info"
          variant="tonal"
        >
          No hay eventos para construir la evolución.
        </VAlert>
        <div
          v-else
          class="overflow-x-auto"
        >
          <VTable density="compact">
            <thead>
              <tr>
                <th scope="col">
                  Periodo
                </th><th scope="col">
                  Altas
                </th><th scope="col">
                  Pausas
                </th><th scope="col">
                  Bajas
                </th><th scope="col">
                  Reactivaciones
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="point in timeline"
                :key="point.bucket"
              >
                <td>{{ point.bucket }}</td><td>{{ point.enrollments }}</td><td>{{ point.pauses }}</td><td>{{ point.exits }}</td><td>{{ point.reactivations }}</td>
              </tr>
            </tbody>
          </VTable>
        </div>
      </VCardText>
    </VCard>
    <VCard>
      <VCardTitle>Eventos auditables del periodo</VCardTitle>
      <VCardText>
        <VAlert
          v-if="!report.rows.length"
          type="info"
          variant="tonal"
          role="status"
        >
          No hay eventos para los filtros seleccionados.
        </VAlert>
        <div
          v-else
          class="overflow-x-auto"
        >
          <VTable density="comfortable">
            <thead>
              <tr>
                <th scope="col">
                  Atleta ID
                </th><th scope="col">
                  Evento
                </th><th scope="col">
                  Fecha efectiva
                </th><th scope="col">
                  Transición
                </th><th scope="col">
                  <span class="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="event in paginatedEvents"
                :key="event.athleteId + event.effectiveDate + event.type"
              >
                <td>{{ event.athleteId }}</td><td>{{ eventLabel(event.type) }}</td><td>{{ event.effectiveDate }}</td><td>{{ event.fromStatus ?? '—' }} → {{ event.toStatus }}</td><td class="text-end">
                  <VBtn
                    size="small"
                    variant="text"
                    :aria-label="`Ver evento de ${event.athleteId}`"
                    @click="selectedEvent = event"
                  >
                    Ver registro
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
          <TablePaginator v-model:page="eventPage" v-model:page-size="eventPageSize" :total="report.rows.length" label="eventos de atletas" />
        </div>
      </VCardText>
    </VCard>
  </section>
  <VDialog
    :model-value="Boolean(selectedEvent)"
    max-width="520"
    @update:model-value="value => !value && (selectedEvent = null)"
  >
    <VCard v-if="selectedEvent">
      <VCardTitle>Evento auditable de atleta</VCardTitle><VCardText>
        <dl class="record-details">
          <div><dt>Atleta ID</dt><dd>{{ selectedEvent.athleteId }}</dd></div><div><dt>Evento</dt><dd>{{ eventLabel(selectedEvent.type) }}</dd></div><div><dt>Fecha efectiva</dt><dd>{{ selectedEvent.effectiveDate }}</dd></div><div><dt>Transición</dt><dd>{{ selectedEvent.fromStatus ?? '—' }} → {{ selectedEvent.toStatus }}</dd></div>
        </dl>
      </VCardText><VCardActions>
        <VSpacer /><VBtn
          variant="text"
          @click="selectedEvent = null"
        >
          Cerrar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>.record-details{display:grid;gap:.75rem}.record-details>div{display:grid;grid-template-columns:minmax(8rem,.65fr) 1fr;gap:.25rem}.record-details dt{color:rgba(var(--v-theme-on-surface),var(--v-disabled-opacity))}.record-details dd{margin:0;overflow-wrap:anywhere}</style>
