<script setup lang="ts">
import { useNotificationsStore, type NotificationColor } from '@/stores/notifications'

const notifications = useNotificationsStore()

const notificationMeta: Record<NotificationColor, { icon: string; title: string }> = {
  success: { icon: 'ri-checkbox-circle-line', title: 'Acción completada' },
  error: { icon: 'ri-error-warning-line', title: 'No se pudo completar' },
  warning: { icon: 'ri-alert-line', title: 'Revisa esta acción' },
  info: { icon: 'ri-information-line', title: 'Información' },
}

const activeMeta = computed(() => notificationMeta[notifications.color])
</script>

<template>
  <VSnackbar
    v-model="notifications.visible"
    location="top end"
    :timeout="4500"
    color="transparent"
    class="kronos-notification"
  >
    <VCard
      class="notification-card"
      rounded="xl"
      elevation="18"
    >
      <VCardText class="d-flex align-start ga-3 pa-4">
        <VAvatar
          :color="notifications.color"
          variant="tonal"
          rounded="lg"
          size="42"
        >
          <VIcon :icon="activeMeta.icon" />
        </VAvatar>
        <div class="flex-grow-1 pt-1">
          <div class="text-subtitle-2 font-weight-bold mb-1">
            {{ activeMeta.title }}
          </div>
          <div class="text-body-2 text-medium-emphasis">
            {{ notifications.message }}
          </div>
        </div>
        <VBtn
          icon="ri-close-line"
          size="small"
          variant="text"
          aria-label="Cerrar notificación"
          @click="notifications.visible = false"
        />
      </VCardText>
    </VCard>
  </VSnackbar>

  <VDialog
    :model-value="notifications.confirmVisible"
    max-width="500"
    @update:model-value="value => !value && notifications.resolveConfirmation(false)"
  >
    <VCard
      class="confirmation-card kronos-card"
      rounded="xl"
    >
      <VCardText class="pa-6 pa-sm-8">
        <div class="d-flex align-start ga-4">
          <VAvatar
            :color="notifications.confirmation.color"
            variant="tonal"
            rounded="xl"
            size="56"
          >
            <VIcon
              :icon="notifications.confirmation.icon"
              size="30"
            />
          </VAvatar>
          <div class="flex-grow-1">
            <div class="text-overline text-medium-emphasis">
              Confirmación
            </div>
            <h2 class="text-h5 font-weight-bold mb-2">
              {{ notifications.confirmation.title }}
            </h2>
            <p class="text-body-1 text-medium-emphasis mb-0">
              {{ notifications.confirmation.message }}
            </p>
          </div>
        </div>
        <div
          v-if="notifications.confirmation.detail"
          class="confirmation-detail rounded-lg mt-6 pa-4 text-body-2"
        >
          <VIcon
            icon="ri-information-line"
            class="me-2"
          />{{ notifications.confirmation.detail }}
        </div>
      </VCardText>
      <VCardActions class="pa-6 pt-0 flex-wrap ga-2">
        <VSpacer />
        <VBtn
          variant="text"
          @click="notifications.resolveConfirmation(false)"
        >
          {{ notifications.confirmation.cancelText }}
        </VBtn>
        <VBtn
          :color="notifications.confirmation.color"
          variant="flat"
          :prepend-icon="notifications.confirmation.icon"
          @click="notifications.resolveConfirmation(true)"
        >
          {{ notifications.confirmation.confirmText }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.notification-card {
  min-inline-size: min(390px, calc(100vw - 32px));
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(151, 213, 222, 18%);
}

.kronos-notification :deep(.v-snackbar__wrapper) {
  min-inline-size: 0;
  padding: 0;
  background: transparent !important;
  box-shadow: none !important;
}

.kronos-notification :deep(.v-snackbar__content) {
  padding: 0;
}

.confirmation-card {
  overflow: hidden;
  border: 1px solid rgba(151, 213, 222, 18%);
}

.confirmation-detail {
  display: flex;
  align-items: center;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(151, 213, 222, 8%);
  border: 1px solid rgba(151, 213, 222, 14%);
}

@media (max-width: 600px) {
  .kronos-notification :deep(.v-snackbar__wrapper) {
    margin: 12px;
  }
}
</style>
