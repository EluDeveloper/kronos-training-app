<script setup lang="ts">
import { notificationStatusService } from '@/services/notification-status.service'
import { createNotificationStatusController, notificationStatusLabels, type NotificationPanelState, type NotificationStatusRow } from '@/utils/notification-status'

const props = defineProps<{ modelValue: boolean; athleteId: string; athleteName: string; canRead: boolean; identityKey: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const state = shallowRef<NotificationPanelState>({ phase: 'idle', items: [] })
const controller = createNotificationStatusController(notificationStatusService.subscribe, value => { state.value = value })
let returnFocus: HTMLElement | null = null

watch(() => props.modelValue, open => {
  if (open && document.activeElement instanceof HTMLElement)
    returnFocus = document.activeElement
}, { flush: 'sync' })

watch(() => [props.modelValue, props.athleteId, props.canRead, props.identityKey], () => {
  controller.select(props.modelValue, props.athleteId, props.canRead)
}, { immediate: true, flush: 'sync' })

onBeforeUnmount(() => controller.dispose())

const dateFormatter = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' })

const statusColor = (status: NotificationStatusRow['status']) => ({
  pending: 'secondary', accepted: 'info', sent: 'info', delivered: 'success',
  read: 'success', omitted: 'secondary', error: 'error', unknown: 'warning',
})[status]

function restoreFocus() {
  if (!props.modelValue && returnFocus?.isConnected)
    returnFocus.focus()
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="640"
    scrollable
    aria-labelledby="payment-notification-title"
    @update:model-value="emit('update:modelValue', $event)"
    @after-leave="restoreFocus"
  >
    <VCard
      class="notification-status-card"
      rounded="xl"
    >
      <div class="px-6 pt-6 pb-2 flex-shrink-0">
        <h2
          id="payment-notification-title"
          class="text-h5 mb-2"
        >
          Notificaciones del atleta
        </h2>
        <p
          v-if="canRead && state.phase !== 'forbidden'"
          class="font-weight-medium mb-1"
        >
          {{ athleteName }}
        </p>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Últimas 20 notificaciones del atleta, no sólo del pago seleccionado.
        </p>
      </div>

      <VCardText
        class="pt-3"
        aria-live="polite"
        :aria-busy="state.phase === 'loading'"
      >
        <div
          v-if="state.phase === 'loading'"
          role="status"
          class="d-flex align-center ga-3 py-6"
        >
          <VProgressCircular
            indeterminate
            size="24"
            aria-hidden="true"
          />
          Cargando notificaciones…
        </div>
        <VAlert
          v-else-if="state.phase === 'forbidden'"
          type="warning"
          variant="tonal"
          role="alert"
        >
          Ya no tienes permiso para consultar estas notificaciones.
        </VAlert>
        <VAlert
          v-else-if="state.phase === 'error'"
          type="warning"
          variant="tonal"
          role="alert"
        >
          No fue posible consultar las notificaciones. Esto no cambia el estado de tus pagos. Cierra y vuelve a abrir el panel para consultar de nuevo.
        </VAlert>
        <p
          v-else-if="state.phase === 'empty'"
          role="status"
          class="py-6 mb-0"
        >
          Sin notificaciones disponibles para este atleta. Esto no indica un fallo de pago.
        </p>
        <ul
          v-else-if="state.phase === 'ready'"
          class="notification-status-list"
          aria-label="Notificaciones recientes"
        >
          <li
            v-for="item in state.items"
            :key="item.jobId"
            class="py-4"
          >
            <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-2">
              <span class="font-weight-medium">{{ item.type === 'payment-receipt' ? 'Recibo de pago' : 'Aviso de pago' }}</span>
              <VChip
                :color="statusColor(item.status)"
                variant="tonal"
                size="small"
              >
                {{ notificationStatusLabels[item.status] }}
              </VChip>
            </div>
            <time
              :datetime="new Date(item.updatedAt).toISOString()"
              class="text-body-2 text-medium-emphasis"
            >{{ dateFormatter.format(item.updatedAt) }}</time>
            <p
              v-if="item.period"
              class="text-body-2 mt-1 mb-0"
            >
              Periodo: {{ item.period }}
            </p>
            <p
              v-if="item.folio"
              class="text-caption text-medium-emphasis mt-1 mb-0"
            >
              Folio: {{ item.folio }}
            </p>
          </li>
        </ul>
        <p class="text-caption text-medium-emphasis mt-4 mb-0">
          Hora de Ciudad de México. «Aceptado» no confirma entrega; «Por confirmar» no confirma éxito. Este panel no envía mensajes ni modifica pagos.
        </p>
      </VCardText>
      <VCardActions class="pa-4">
        <VSpacer />
        <VBtn
          color="on-surface"
          variant="tonal"
          @click="emit('update:modelValue', false)"
        >
          Cerrar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.notification-status-card {
  overflow-wrap: anywhere;
}

.notification-status-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.notification-status-list > li + li {
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
