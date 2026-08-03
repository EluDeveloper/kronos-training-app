<script setup lang="ts">
import KronosLogo from '@/components/kronos/KronosLogo.vue'

defineProps<{
  missing: readonly string[]
}>()
</script>

<template>
  <main class="setup-page pa-6">
    <VCard class="kronos-card setup-card pa-7 pa-md-10" rounded="xl">
      <KronosLogo class="setup-logo mb-7" />
      <p class="text-overline text-kronos-cyan mb-2">Configuración inicial</p>
      <h1 class="kronos-display text-h4 text-md-h3 mb-4">Conecta Kronos</h1>
      <p class="text-body-1 text-medium-emphasis mb-6">
        La aplicación está lista para Firebase, pero faltan datos de la aplicación web. Completa
        <code>.env.local</code> usando <code>.env.example</code> y reinicia el servidor.
      </p>

      <VAlert color="warning" variant="tonal" icon="ri-settings-3-line" class="mb-6">
        Faltan: {{ missing.join(', ') }}
      </VAlert>

      <div class="d-flex align-center ga-3 text-body-2 text-medium-emphasis">
        <VIcon icon="ri-database-2-line" color="secondary" />
        <span>Proyecto esperado: kronos-training-fd5e5</span>
      </div>
    </VCard>
  </main>
</template>

<style scoped>
.setup-page {
  display: grid;
  min-block-size: 100vh;
  place-items: center;
}

.setup-card {
  inline-size: min(100%, 680px);
}

.setup-logo {
  block-size: 72px;
  inline-size: min(100%, 320px);
}
</style>
