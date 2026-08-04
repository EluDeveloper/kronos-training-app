<script setup lang="ts">
import KronosLogo from '@/components/kronos/KronosLogo.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const form = reactive({ displayName: '', email: '', password: '', confirmation: '' })
const showPassword = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

async function submit() {
  if (form.displayName.trim().length < 3 || !form.email.includes('@')) {
    error.value = 'Captura nombre y correo válidos.'

    return
  }
  if (form.password.length < 10) {
    error.value = 'La contraseña debe tener al menos 10 caracteres.'

    return
  }
  if (form.password !== form.confirmation) {
    error.value = 'Las contraseñas no coinciden.'

    return
  }

  saving.value = true
  error.value = null
  try {
    await session.bootstrapAdmin(form.displayName, form.email, form.password)
  }
  catch (setupError) {
    error.value = setupError instanceof Error ? setupError.message : 'No fue posible crear el primer Admin.'
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="setup-page pa-4 pa-sm-6">
    <VCard
      class="kronos-card setup-card pa-7 pa-md-10"
      rounded="xl"
    >
      <KronosLogo class="setup-logo mb-7" />
      <p class="text-overline text-kronos-cyan mb-2">
        Configuración protegida
      </p>
      <h1 class="kronos-display text-h4 mb-4">
        Crea el primer Admin
      </h1>
      <p class="text-body-1 text-medium-emphasis mb-6">
        Este dispositivo ya está autorizado. La cuenta que crees tendrá acceso completo y podrá dar de alta a los demás usuarios.
      </p>

      <VAlert
        v-if="error || session.error"
        color="error"
        variant="tonal"
        class="mb-5"
      >
        {{ error || session.error }}
      </VAlert>

      <VForm
        class="d-flex flex-column ga-4"
        @submit.prevent="submit"
      >
        <VTextField
          v-model="form.displayName"
          label="Nombre del Admin"
          autocomplete="name"
          prepend-inner-icon="ri-user-star-line"
        />
        <VTextField
          v-model="form.email"
          type="email"
          label="Correo electrónico"
          autocomplete="username"
          prepend-inner-icon="ri-mail-line"
        />
        <VTextField
          v-model="form.password"
          :type="showPassword ? 'text' : 'password'"
          label="Contraseña"
          hint="Mínimo 10 caracteres"
          persistent-hint
          autocomplete="new-password"
          prepend-inner-icon="ri-lock-password-line"
          :append-inner-icon="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'"
          @click:append-inner="showPassword = !showPassword"
        />
        <VTextField
          v-model="form.confirmation"
          :type="showPassword ? 'text' : 'password'"
          label="Confirmar contraseña"
          autocomplete="new-password"
          prepend-inner-icon="ri-lock-check-line"
        />
        <VAlert
          color="info"
          variant="tonal"
          icon="ri-information-line"
        >
          Después de crear esta cuenta, el acceso cotidiano será por correo y ya no por dispositivo.
        </VAlert>
        <div class="d-flex flex-column flex-sm-row justify-end ga-3 mt-2">
          <VBtn
            variant="text"
            :disabled="saving"
            @click="session.logout"
          >
            Cancelar
          </VBtn>
          <VBtn
            type="submit"
            :loading="saving"
            prepend-icon="ri-shield-user-line"
          >
            Crear Admin
          </VBtn>
        </div>
      </VForm>
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
  inline-size: min(100%, 720px);
}

.setup-logo {
  block-size: 68px;
  inline-size: min(100%, 300px);
}
</style>
