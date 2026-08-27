<script setup lang="ts">
import { kioskCredentialSvgDataUrl } from '@/utils/kiosk-code'

const props = defineProps<{
  athleteName: string
  code: string
  status: 'persisted' | 'pending'
}>()

const imageUrl = computed(() => kioskCredentialSvgDataUrl({
  athleteName: props.athleteName,
  code: props.code,
}))
</script>

<template>
  <figure
    class="kiosk-credential ma-0"
    data-testid="kiosk-credential-card"
  >
    <div class="d-flex justify-center mb-3">
      <VChip
        :color="status === 'persisted' ? 'success' : 'warning'"
        :prepend-icon="status === 'persisted' ? 'ri-shield-check-line' : 'ri-draft-line'"
        size="small"
        variant="tonal"
      >
        {{ status === 'persisted' ? 'Credencial vigente' : 'Pendiente de guardar' }}
      </VChip>
    </div>
    <img
      class="kiosk-credential-image"
      :src="imageUrl"
      :alt="`Credencial de Kiosco Kronos de ${athleteName}, código ${code}`"
      width="1080"
      height="1920"
    >
    <figcaption class="kiosk-credential-caption">
      Código personal {{ code }}. El QR contiene únicamente estos seis dígitos.
    </figcaption>
  </figure>
</template>

<style scoped>
.kiosk-credential {
  inline-size: min(100%, 22.5rem);
  margin-inline: auto !important;
}

.kiosk-credential-image {
  display: block;
  inline-size: 100%;
  block-size: auto;
  border-radius: 1.5rem;
  box-shadow: 0 1.25rem 2.75rem rgba(0, 0, 0, 28%);
}

.kiosk-credential-caption {
  margin-block-start: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  text-align: center;
}
</style>
