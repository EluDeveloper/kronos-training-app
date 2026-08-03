<script setup lang="ts">
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
</script>

<template>
  <VChip
    size="small"
    :color="session.connected ? 'success' : 'warning'"
    variant="tonal"
    :prepend-icon="session.connected ? 'ri-cloud-line' : 'ri-cloud-off-line'"
  >
    {{ session.connected ? 'Sincronizado' : 'Sin conexión' }}
  </VChip>
</template>
