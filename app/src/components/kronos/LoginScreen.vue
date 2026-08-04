<script setup lang="ts">
import KronosLogo from '@/components/kronos/KronosLogo.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const resetting = ref(false)
const feedback = ref<string | null>(null)
const localError = ref<string | null>(null)

async function submit() {
  if (!email.value.trim() || !password.value) {
    localError.value = 'Captura correo y contraseña.'

    return
  }

  submitting.value = true
  localError.value = null
  feedback.value = null
  try {
    await session.signIn(email.value, password.value)
  }
  catch (error) {
    localError.value = error instanceof Error ? error.message : 'No fue posible iniciar sesión.'
  }
  finally {
    submitting.value = false
  }
}

async function resetPassword() {
  if (!email.value.trim()) {
    localError.value = 'Captura primero el correo de la cuenta.'

    return
  }

  resetting.value = true
  localError.value = null
  try {
    await session.sendPasswordReset(email.value)
    feedback.value = 'Si el correo pertenece a una cuenta, Firebase enviará las instrucciones de recuperación.'
  }
  catch (error) {
    localError.value = error instanceof Error ? error.message : 'No fue posible solicitar la recuperación.'
  }
  finally {
    resetting.value = false
  }
}

async function configureFirstAccess() {
  localError.value = null
  try {
    await session.beginBootstrap()
  }
  catch (error) {
    localError.value = error instanceof Error ? error.message : 'No fue posible preparar el primer acceso.'
  }
}
</script>

<template>
  <main class="login-page pa-4 pa-sm-6">
    <VCard
      class="kronos-card login-card overflow-hidden"
      rounded="xl"
    >
      <VRow no-gutters>
        <VCol
          cols="12"
          md="5"
          class="login-brand pa-7 pa-md-10 d-flex flex-column justify-space-between"
        >
          <KronosLogo class="login-logo" />
          <div class="my-12 my-md-0">
            <p class="text-overline text-kronos-cyan mb-2">
              Centro de control
            </p>
            <h1 class="kronos-display text-h4 text-lg-h3 mb-4">
              Tu operación, en un solo lugar
            </h1>
            <p class="text-body-1 text-medium-emphasis mb-0">
              Atletas, cobros, visitas, tienda y programación protegidos por tu cuenta Kronos.
            </p>
          </div>
          <div class="d-flex align-center ga-2 text-caption text-medium-emphasis">
            <VIcon
              icon="ri-shield-keyhole-line"
              color="secondary"
            />
            <span>Acceso individual con permisos administrados</span>
          </div>
        </VCol>

        <VCol
          cols="12"
          md="7"
          class="pa-7 pa-md-10"
        >
          <div class="login-form mx-auto">
            <p class="text-overline text-kronos-cyan mb-2">
              Bienvenido
            </p>
            <h2 class="kronos-display text-h4 mb-3">
              Iniciar sesión
            </h2>
            <p class="text-body-2 text-medium-emphasis mb-7">
              Usa el correo y la contraseña asignados por un Admin.
            </p>

            <VAlert
              v-if="localError || session.error"
              color="error"
              variant="tonal"
              icon="ri-error-warning-line"
              class="mb-5"
            >
              {{ localError || session.error }}
            </VAlert>
            <VAlert
              v-if="feedback"
              color="success"
              variant="tonal"
              icon="ri-mail-check-line"
              class="mb-5"
            >
              {{ feedback }}
            </VAlert>

            <VForm @submit.prevent="submit">
              <VTextField
                v-model="email"
                type="email"
                label="Correo electrónico"
                autocomplete="username"
                prepend-inner-icon="ri-mail-line"
                class="mb-4"
              />
              <VTextField
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                label="Contraseña"
                autocomplete="current-password"
                prepend-inner-icon="ri-lock-password-line"
                :append-inner-icon="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'"
                @click:append-inner="showPassword = !showPassword"
              />
              <div class="d-flex justify-end mb-6">
                <VBtn
                  variant="text"
                  size="small"
                  :loading="resetting"
                  @click="resetPassword"
                >
                  Olvidé mi contraseña
                </VBtn>
              </div>
              <VBtn
                type="submit"
                block
                size="large"
                :loading="submitting"
                prepend-icon="ri-login-box-line"
              >
                Entrar a Kronos
              </VBtn>
            </VForm>

            <VDivider class="my-7" />
            <div class="text-center">
              <p class="text-caption text-medium-emphasis mb-2">
                ¿Todavía no existe una cuenta Admin?
              </p>
              <VBtn
                variant="text"
                color="secondary"
                size="small"
                @click="configureFirstAccess"
              >
                Configurar el primer acceso
              </VBtn>
            </div>
          </div>
        </VCol>
      </VRow>
    </VCard>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-block-size: 100vh;
  place-items: center;
}

.login-card {
  inline-size: min(100%, 1040px);
}

.login-brand {
  min-block-size: 580px;
  border-inline-end: 1px solid rgba(151, 213, 222, 0.12);
  background:
    radial-gradient(circle at 20% 15%, rgba(151, 213, 222, 0.12), transparent 42%),
    linear-gradient(145deg, rgba(68, 121, 127, 0.2), rgba(27, 29, 26, 0.25));
}

.login-logo {
  block-size: 64px;
  inline-size: min(100%, 280px);
}

.login-form {
  max-inline-size: 480px;
}

@media (max-width: 959px) {
  .login-brand {
    min-block-size: auto;
    border-block-end: 1px solid rgba(151, 213, 222, 0.12);
    border-inline-end: 0;
  }
}
</style>
