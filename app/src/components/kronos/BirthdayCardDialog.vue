<script setup lang="ts">
import { BIRTHDAY_CARD_VERSION, canvasBlob, renderBirthdayCard } from '@/utils/birthday-card'
import { safeBirthdayFilename } from '@/utils/birthday-greetings'

const props = defineProps<{ modelValue: boolean; athleteName: string }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  cardAction: [value: { action: 'downloadedAt' | 'sharedAt'; version: string }]
}>()

const preview = ref('')
const loading = ref(false)
let cardBlob: Blob | null = null

async function build() {
  if (!props.athleteName) return
  loading.value = true
  try {
    const canvas = await renderBirthdayCard(props.athleteName)

    cardBlob = await canvasBlob(canvas)
    preview.value = canvas.toDataURL('image/png')
  }
  finally { loading.value = false }
}

watch([() => props.modelValue, () => props.athleteName], ([open]) => { if (open) void build() })

async function download() {
  if (!cardBlob) await build()
  if (!cardBlob) return
  const url = URL.createObjectURL(cardBlob)
  const link = document.createElement('a')

  link.href = url
  link.download = safeBirthdayFilename(props.athleteName)
  link.click()
  URL.revokeObjectURL(url)
  emit('cardAction', { action: 'downloadedAt', version: BIRTHDAY_CARD_VERSION })
}

async function share() {
  if (!cardBlob) await build()
  if (!cardBlob) return
  const file = new File([cardBlob], safeBirthdayFilename(props.athleteName), { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: `Feliz cumpleaños ${props.athleteName}`, text: '¡Feliz cumpleaños de parte de tu Kronos Family!', files: [file] })
    emit('cardAction', { action: 'sharedAt', version: BIRTHDAY_CARD_VERSION })
  }
  else {
    await download()
    window.open(`https://wa.me/?text=${encodeURIComponent(`¡Feliz cumpleaños ${props.athleteName}! Adjunta la tarjeta que acabas de descargar.`)}`, '_blank', 'noopener,noreferrer')
    emit('cardAction', { action: 'sharedAt', version: BIRTHDAY_CARD_VERSION })
  }
}
</script>

<template>
  <VDialog :model-value="modelValue" max-width="720" @update:model-value="emit('update:modelValue', $event)">
    <VCard><VCardItem title="Tarjeta de cumpleaños" :subtitle="athleteName" prepend-icon="ri-cake-2-line" />
      <VCardText>
        <VAlert type="info" variant="tonal" class="mb-4">La imagen no incluye edad, teléfono ni fecha de nacimiento. Compartir abre el panel del dispositivo o WhatsApp, pero nunca envía automáticamente.</VAlert>
        <VSkeletonLoader v-if="loading" type="image" />
        <img v-else-if="preview" :src="preview" :alt="`Tarjeta de cumpleaños para ${athleteName}`" class="birthday-preview rounded-lg" width="1080" height="1080">
      </VCardText>
      <VCardActions class="justify-end flex-wrap ga-2">
        <VBtn variant="text" @click="emit('update:modelValue', false)">Cerrar</VBtn>
        <VBtn variant="tonal" prepend-icon="ri-download-2-line" :disabled="loading" @click="download">Descargar PNG</VBtn>
        <VBtn prepend-icon="ri-whatsapp-line" :disabled="loading" @click="share">Compartir manualmente</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.birthday-preview { display: block; inline-size: min(100%, 560px); block-size: auto; margin-inline: auto; aspect-ratio: 1; object-fit: contain; }
</style>
