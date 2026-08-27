<script setup lang="ts">
import KronosLogo from '@/components/kronos/KronosLogo.vue'
import { useNotifications } from '@/composables/useNotifications'
import type { EnrollmentSheetData } from '@/utils/enrollment-sheet'
import { formatEnrollmentDate, paymentScheduleText } from '@/utils/enrollment-sheet'
import {
  downloadEnrollmentSheet,
  enrollmentSheetMissingFields,
  printEnrollmentSheet,
  shareEnrollmentSheet,
} from '@/utils/enrollment-sheet-pdf'
import { formatDate } from '@/utils/kronos'

const props = withDefaults(defineProps<{
  modelValue: boolean
  sheet: EnrollmentSheetData | null
  phone?: string | null
  loading?: boolean
  error?: string | null
}>(), {
  phone: null,
  loading: false,
  error: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { success, failure } = useNotifications()
const working = ref(false)
const missingFields = computed(() => props.sheet ? enrollmentSheetMissingFields(props.sheet) : [])

async function run(action: 'download' | 'print' | 'share') {
  if (!props.sheet || props.loading || props.error || working.value)
    return

  working.value = true
  try {
    if (action === 'download') {
      await downloadEnrollmentSheet(props.sheet)
      success('Ficha de inscripción descargada.')
    }
    else if (action === 'print') {
      await printEnrollmentSheet(props.sheet)
    }
    else {
      const result = await shareEnrollmentSheet(props.sheet, props.phone)

      success(result === 'whatsapp-web'
        ? 'PDF descargado y WhatsApp Web abierto. Adjunta la ficha manualmente.'
        : 'PDF descargado. Elige el contacto en WhatsApp Web y adjunta la ficha manualmente.')
    }
  }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return

    const message = error instanceof Error && error.message.startsWith('El navegador bloqueó')
      ? error.message
      : 'No fue posible generar la ficha de inscripción. Vuelve a intentarlo.'

    failure(message)
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    scrollable
    aria-labelledby="enrollment-sheet-title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <div class="enrollment-sheet-header pa-5 pa-sm-6">
        <KronosLogo class="enrollment-sheet-logo" />
        <div class="text-right">
          <div class="text-overline text-kronos-orange">
            FICHA DE INSCRIPCIÓN
          </div>
          <div class="font-weight-bold">
            {{ sheet?.folio ?? 'Preparando ficha' }}
          </div>
        </div>
      </div>

      <VCardText class="pa-4 pa-sm-6">
        <div class="d-flex flex-wrap justify-space-between align-start ga-3 mb-6">
          <div>
            <h2
              id="enrollment-sheet-title"
              class="text-h5 font-weight-bold mb-1"
            >
              Ficha de inscripción
            </h2>
            <p class="text-body-2 text-medium-emphasis mb-0">
              Revisa los datos antes de descargar o compartir.
            </p>
          </div>
          <div
            v-if="sheet"
            class="text-sm-right"
          >
            <div class="text-caption text-medium-emphasis">
              Fecha de emisión
            </div>
            <div>{{ formatDate(sheet.issuedAt) }}</div>
          </div>
        </div>

        <div
          v-if="loading"
          class="py-8"
          role="status"
          aria-live="polite"
        >
          <VProgressLinear
            indeterminate
            color="primary"
            class="mb-4"
          />
          <p class="text-center text-medium-emphasis mb-0">
            Cargando datos de inscripción…
          </p>
        </div>

        <VAlert
          v-else-if="error"
          type="error"
          variant="tonal"
          title="No fue posible preparar la ficha"
        >
          No se pudieron consultar los datos de admisión. Revisa tu conexión y vuelve a intentarlo.
        </VAlert>

        <template v-else-if="sheet">
          <section
            class="enrollment-section mb-5"
            aria-labelledby="enrollment-personal-title"
          >
            <h3
              id="enrollment-personal-title"
              class="enrollment-section-title"
            >
              Datos de inscripción
            </h3>
            <div class="pa-4">
              <div class="text-caption text-medium-emphasis">
                Atleta
              </div>
              <div class="text-h6 font-weight-bold mb-4">
                {{ sheet.athleteName }}
              </div>
              <VRow>
                <VCol
                  cols="12"
                  sm="6"
                >
                  <div class="text-caption text-medium-emphasis">
                    Fecha de nacimiento
                  </div>
                  <strong>{{ formatEnrollmentDate(sheet.birthDate) }}</strong>
                </VCol>
                <VCol
                  cols="12"
                  sm="6"
                >
                  <div class="text-caption text-medium-emphasis">
                    Fecha de inscripción
                  </div>
                  <strong>{{ formatEnrollmentDate(sheet.registrationDate) }}</strong>
                </VCol>
              </VRow>
            </div>
          </section>

          <VAlert
            class="mb-5"
            color="warning"
            variant="tonal"
            icon="ri-calendar-check-line"
            title="Fecha de pago"
          >
            <strong>{{ paymentScheduleText(sheet.paymentDay) }}</strong>
          </VAlert>

          <section
            class="enrollment-section mb-5"
            aria-labelledby="enrollment-emergency-title"
          >
            <h3
              id="enrollment-emergency-title"
              class="enrollment-section-title"
            >
              Contacto de emergencia
            </h3>
            <VRow class="pa-2">
              <VCol
                cols="12"
                sm="4"
              >
                <div class="text-caption text-medium-emphasis">
                  Nombre
                </div>
                <strong>{{ sheet.emergencyContact?.name ?? 'Sin capturar' }}</strong>
              </VCol>
              <VCol
                cols="12"
                sm="4"
              >
                <div class="text-caption text-medium-emphasis">
                  Teléfono
                </div>
                <strong>{{ sheet.emergencyContact?.phone ?? 'Sin capturar' }}</strong>
              </VCol>
              <VCol
                cols="12"
                sm="4"
              >
                <div class="text-caption text-medium-emphasis">
                  Parentesco
                </div>
                <strong>{{ sheet.emergencyContact?.relationship ?? 'Sin capturar' }}</strong>
              </VCol>
            </VRow>
          </section>

          <VAlert
            v-if="missingFields.length"
            class="mb-5"
            color="warning"
            variant="outlined"
            icon="ri-error-warning-line"
            title="Información pendiente de validar"
          >
            Revisa: {{ missingFields.join(', ') }}.
          </VAlert>

          <VAlert
            color="info"
            variant="tonal"
            icon="ri-shield-check-line"
          >
            El PDF incluirá el contacto de emergencia. Confirma el destinatario antes de adjuntarlo en WhatsApp.
          </VAlert>
        </template>
      </VCardText>

      <VCardActions class="enrollment-sheet-actions pa-4 pa-sm-6 pt-0 ga-2">
        <VBtn
          variant="text"
          :disabled="working"
          @click="emit('update:modelValue', false)"
        >
          Cerrar
        </VBtn>
        <VSpacer />
        <VBtn
          prepend-icon="ri-printer-line"
          variant="tonal"
          :disabled="loading || Boolean(error) || !sheet || working"
          @click="run('print')"
        >
          Imprimir
        </VBtn>
        <VBtn
          prepend-icon="ri-download-2-line"
          variant="tonal"
          :disabled="loading || Boolean(error) || !sheet || working"
          @click="run('download')"
        >
          PDF
        </VBtn>
        <VBtn
          prepend-icon="ri-whatsapp-line"
          color="success"
          :loading="working"
          :disabled="loading || Boolean(error) || !sheet"
          @click="run('share')"
        >
          WhatsApp Web
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.enrollment-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: #1b1d1a;
  border-block-end: 1px solid rgba(151, 213, 222, 20%);
}

.enrollment-sheet-logo {
  block-size: 58px;
  inline-size: min(55%, 230px);
}

.enrollment-section {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}

.enrollment-section-title {
  padding: 0.625rem 1rem;
  background: rgba(151, 213, 222, 12%);
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.enrollment-sheet-actions {
  flex-wrap: wrap;
}

@media (max-width: 600px) {
  .enrollment-sheet-header {
    align-items: flex-start;
  }

  .enrollment-sheet-logo {
    block-size: 46px;
    inline-size: min(48%, 180px);
  }

  .enrollment-sheet-actions :deep(.v-spacer) {
    display: none;
  }

  .enrollment-sheet-actions :deep(.v-btn) {
    flex: 1 1 calc(50% - 0.5rem);
  }
}
</style>
