<script setup lang="ts">
import KronosLogo from '@/components/kronos/KronosLogo.vue'
import { useSessionStore, type SessionStatus } from '@/stores/session'

const props = defineProps<{
  status: SessionStatus
  error?: string | null
}>()

const session = useSessionStore()
const isTechnicalError = computed(() => props.status === 'error')

const title = computed(() => {
  if (props.status === 'disabled')
    return 'Cuenta deshabilitada'
  if (props.status === 'access-denied')
    return 'Acceso pendiente'

  return 'No fue posible abrir Kronos'
})
</script>

<template>
  <main class="status-page pa-4 pa-sm-6">
    <VCard
      class="kronos-card status-card pa-7 pa-md-10 text-center"
      rounded="xl"
    >
      <KronosLogo class="status-logo mx-auto mb-7" />
      <VIcon
        :icon="isTechnicalError ? 'ri-error-warning-line' : 'ri-shield-user-line'"
        :color="isTechnicalError ? 'error' : 'warning'"
        size="50"
        class="mb-5"
      />
      <h1 class="kronos-display text-h4 mb-4">
        {{ title }}
      </h1>
      <p class="text-body-1 text-medium-emphasis mb-6">
        {{ error || 'Solicita a un Admin que revise el estado y los permisos de tu cuenta.' }}
      </p>
      <div class="d-flex flex-column flex-sm-row justify-center ga-3">
        <VBtn
          v-if="isTechnicalError"
          variant="tonal"
          prepend-icon="ri-refresh-line"
          @click="session.initialize"
        >
          Reintentar
        </VBtn>
        <VBtn
          prepend-icon="ri-logout-box-r-line"
          @click="session.logout"
        >
          Cerrar sesión
        </VBtn>
      </div>
    </VCard>
  </main>
</template>

<style scoped>
.status-page {
  display: grid;
  min-block-size: 100vh;
  place-items: center;
}

.status-card {
  inline-size: min(100%, 680px);
}

.status-logo {
  block-size: 68px;
  inline-size: min(100%, 300px);
}
</style>
