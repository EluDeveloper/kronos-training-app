<script setup lang="ts">
import ConfigurationMissing from '@/components/kronos/ConfigurationMissing.vue'
import AccountStatus from '@/components/kronos/AccountStatus.vue'
import DevicePending from '@/components/kronos/DevicePending.vue'
import FirstAdminSetup from '@/components/kronos/FirstAdminSetup.vue'
import GlobalAlertCenter from '@/components/kronos/GlobalAlertCenter.vue'
import KronosLogo from '@/components/kronos/KronosLogo.vue'
import LoginScreen from '@/components/kronos/LoginScreen.vue'
import PasswordChangeRequired from '@/components/kronos/PasswordChangeRequired.vue'
import { useSessionStore } from '@/stores/session'
import type { AccessModule } from '@/types/access'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

watch(
  () => [session.status, session.profile] as const,
  () => {
    if (session.status !== 'authorized')
      return

    const access = route.meta.access as AccessModule | undefined

    const denied = (route.meta.adminOnly === true && !session.isAdmin)
      || Boolean(access && !session.canAccess(access))

    if (denied || route.path === '/')
      void router.replace(session.defaultRoute)
  },
  { deep: true },
)

onMounted(() => session.initialize())
onBeforeUnmount(() => session.dispose())
</script>

<template>
  <VApp>
    <ConfigurationMissing
      v-if="session.status === 'configuration-missing'"
      :missing="session.missingConfiguration"
    />

    <div
      v-else-if="session.status === 'booting' || session.status === 'authorizing'"
      class="app-loading"
    >
      <div class="text-center">
        <KronosLogo class="loading-logo mx-auto mb-7" />
        <VProgressCircular
          indeterminate
          color="secondary"
          size="52"
          width="4"
        />
        <p class="kronos-display text-body-2 mt-5">
          Conectando Kronos
        </p>
      </div>
    </div>

    <LoginScreen v-else-if="session.status === 'signed-out'" />

    <DevicePending
      v-else-if="session.status === 'pending'"
      :uid="session.uid ?? 'UID no disponible'"
      :error="session.error"
    />

    <FirstAdminSetup v-else-if="session.status === 'bootstrap-required'" />

    <PasswordChangeRequired v-else-if="session.status === 'password-change-required'" />

    <AccountStatus
      v-else-if="session.status === 'disabled' || session.status === 'access-denied' || session.status === 'error'"
      :status="session.status"
      :error="session.error"
    />

    <RouterView v-else-if="session.status === 'authorized'" />
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
