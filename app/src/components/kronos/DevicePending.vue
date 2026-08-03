<script setup lang="ts">
const props = defineProps<{
  uid: string
  error?: string | null
}>()

const copied = ref(false)

async function copyUid() {
  await navigator.clipboard.writeText(props.uid)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 2500)
}
</script>

<template>
  <main class="setup-page pa-6">
    <VCard class="kronos-card setup-card pa-7 pa-md-10" rounded="xl">
      <VIcon icon="ri-device-line" color="secondary" size="46" class="mb-5" />
      <p class="text-overline text-kronos-cyan mb-2">Acceso protegido</p>
      <h1 class="kronos-display text-h4 mb-4">Autoriza este dispositivo</h1>
      <p class="text-body-1 text-medium-emphasis mb-6">
        La conexión con Firebase funciona. Para abrir los datos de Kronos, agrega este UID como
        dispositivo habilitado en <strong>v1/authorizedDevices</strong>.
      </p>

      <VAlert v-if="error" color="error" variant="tonal" class="mb-5">
        {{ error }}
      </VAlert>

      <div class="uid-box d-flex flex-column flex-sm-row align-sm-center ga-3 pa-4">
        <code class="flex-grow-1 text-break">{{ uid }}</code>
        <VBtn variant="tonal" :prepend-icon="copied ? 'ri-check-line' : 'ri-file-copy-line'" @click="copyUid">
          {{ copied ? 'Copiado' : 'Copiar UID' }}
        </VBtn>
      </div>

      <ol class="text-body-2 text-medium-emphasis mt-6 ps-5">
        <li>Abre Realtime Database en Firebase Console.</li>
        <li>Crea <code>v1/authorizedDevices/{{ uid }}</code>.</li>
        <li>Guarda <code>{ "enabled": true, "label": "Mi dispositivo" }</code>.</li>
      </ol>
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
  inline-size: min(100%, 760px);
}

.uid-box {
  border: 1px solid rgba(151, 213, 222, 0.22);
  border-radius: 14px;
  background: rgba(27, 29, 26, 0.72);
}

li + li {
  margin-block-start: 0.55rem;
}
</style>
