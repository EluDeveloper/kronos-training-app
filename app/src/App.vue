<script setup lang="ts">
import ConfigurationMissing from '@/components/kronos/ConfigurationMissing.vue'
import DevicePending from '@/components/kronos/DevicePending.vue'
import GlobalAlertCenter from '@/components/kronos/GlobalAlertCenter.vue'
import KronosLogo from '@/components/kronos/KronosLogo.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

onMounted(() => session.initialize())
onBeforeUnmount(() => session.dispose())
</script>

<template>
  <VApp>
    <ConfigurationMissing
      v-if="session.status === 'configuration-missing'"
      :missing="session.missingConfiguration"
    />

    <div v-else-if="session.status === 'booting' || session.status === 'authorizing'" class="app-loading">
      <div class="text-center">
        <KronosLogo class="loading-logo mx-auto mb-7" />
        <VProgressCircular indeterminate color="secondary" size="52" width="4" />
        <p class="kronos-display text-body-2 mt-5">Conectando Kronos</p>
      </div>
    </div>

    <DevicePending
      v-else-if="session.status === 'pending' || session.status === 'error'"
      :uid="session.uid ?? 'UID no disponible'"
      :error="session.error"
    />

    <RouterView v-else />
    <GlobalAlertCenter />
  </VApp>
</template>

<style scoped>
.app-loading {
  display: grid;
  min-block-size: 100vh;
  place-items: center;
}

.loading-logo {
  block-size: 76px;
  inline-size: min(72vw, 320px);
}
</style>
