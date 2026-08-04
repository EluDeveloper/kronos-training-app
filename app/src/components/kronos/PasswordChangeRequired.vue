<script setup lang="ts">
import KronosLogo from '@/components/kronos/KronosLogo.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const password = ref('')
const confirmation = ref('')
const visible = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

async function submit() {
  if (password.value.length < 10) {
    error.value = 'La nueva contraseña debe tener al menos 10 caracteres.'

    return
  }
  if (password.value !== confirmation.value) {
    error.value = 'Las contraseñas no coinciden.'

    return
  }

  saving.value = true
  error.value = null
  try {
    await session.changePassword(password.value)
  }
  catch (changeError) {
    error.value = changeError instanceof Error ? changeError.message : 'No fue posible cambiar la contraseña.'
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="password-page pa-4 pa-sm-6">
    <VCard
      class="kronos-card password-card pa-7 pa-md-10"
      rounded="xl"
    >
      <KronosLogo class="password-logo mb-7" />
      <p class="text-overline text-kronos-cyan mb-2">
        Primer ingreso
      </p>
      <h1 class="kronos-display text-h4 mb-4">
        Crea tu contraseña personal
      </h1>
      <p class="text-body-1 text-medium-emphasis mb-6">
        El Admin te proporcionó una contraseña temporal. Cámbiala antes de abrir los módulos de Kronos.
      </p>
      <VAlert
        v-if="error"
        color="error"
        variant="tonal"
        class="mb-5"
      >
        {{ error }}
      </VAlert>
      <VForm
        class="d-flex flex-column ga-4"
        @submit.prevent="submit"
      >
        <VTextField
          v-model="password"
          :type="visible ? 'text' : 'password'"
          label="Nueva contraseña"
          hint="Mínimo 10 caracteres"
          persistent-hint
          autocomplete="new-password"
          :append-inner-icon="visible ? 'ri-eye-off-line' : 'ri-eye-line'"
          @click:append-inner="visible = !visible"
        />
        <VTextField
          v-model="confirmation"
          :type="visible ? 'text' : 'password'"
          label="Confirmar contraseña"
          autocomplete="new-password"
        />
        <div class="d-flex flex-column flex-sm-row justify-end ga-3 mt-2">
          <VBtn
            variant="text"
            :disabled="saving"
            @click="session.logout"
          >
            Cerrar sesión
          </VBtn>
          <VBtn
            type="submit"
            :loading="saving"
            prepend-icon="ri-lock-password-line"
          >
            Guardar contraseña
          </VBtn>
        </div>
      </VForm>
    </VCard>
  </main>
</template>

<style scoped>
.password-page {
  display: grid;
  min-block-size: 100vh;
  place-items: center;
}

.password-card {
  inline-size: min(100%, 680px);
}

.password-logo {
  block-size: 68px;
  inline-size: min(100%, 300px);
}
</style>
