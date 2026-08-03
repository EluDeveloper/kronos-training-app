<script setup lang="ts">
import { useNotificationsStore } from '@/stores/notifications'

const notifications = useNotificationsStore()
</script>

<template>
  <VSnackbar v-model="notifications.visible" :color="notifications.color" location="top end" :timeout="4000">
    {{ notifications.message }}
    <template #actions>
      <VBtn icon="ri-close-line" variant="text" aria-label="Cerrar notificación" @click="notifications.visible = false" />
    </template>
  </VSnackbar>
</template>
