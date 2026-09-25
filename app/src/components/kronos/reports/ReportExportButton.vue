<script setup lang="ts">
import type { ReportingExportRow } from '@/utils/reporting-export'
import { downloadReportingCsv, serializeReportingCsv } from '@/utils/reporting-export'

const props = defineProps<{
  getRows: () => ReportingExportRow[]
  filename: string
  disabled?: boolean
  disabledReason?: string
}>()

const message = ref('')
const isError = ref(false)

function exportCsv() {
  message.value = ''
  isError.value = false
  try {
    const rows = props.getRows()

    if (!rows.some(row => row.recordType !== 'metadata'))
      throw new Error('No hay resultados filtrados disponibles para exportar.')
    downloadReportingCsv(serializeReportingCsv(rows), props.filename)
    message.value = `CSV creado con ${rows.length} registros auditables.`
  }
  catch (error) {
    isError.value = true
    message.value = error instanceof Error ? error.message : 'No fue posible crear el CSV.'
  }
}
</script>

<template>
  <div class="d-flex flex-column align-end ga-1">
    <VBtn
      prepend-icon="ri-download-2-line"
      variant="tonal"
      :disabled="disabled"
      :aria-describedby="disabled && disabledReason ? 'report-export-status' : undefined"
      @click="exportCsv"
    >
      Exportar CSV
    </VBtn>
    <p
      v-if="disabledReason || message"
      id="report-export-status"
      class="text-caption text-medium-emphasis mb-0 text-end"
      aria-live="polite"
      :role="isError ? 'alert' : 'status'"
    >
      {{ message || disabledReason }}
    </p>
  </div>
</template>
