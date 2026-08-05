<script setup lang="ts">
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'

const props = withDefaults(defineProps<{
  active?: boolean
}>(), {
  active: true,
})

const emit = defineEmits<{
  detected: [code: string]
  error: [message: string]
}>()

const video = ref<HTMLVideoElement | null>(null)
const errorMessage = ref('')
const starting = ref(false)
let controls: IScannerControls | null = null
let reader: BrowserMultiFormatReader | null = null
let lastCode = ''
let lastSeenAt = 0

function stop() {
  controls?.stop()
  controls = null
  reader = null

  const stream = video.value?.srcObject
  if (stream instanceof MediaStream)
    stream.getTracks().forEach(track => track.stop())
  if (video.value)
    video.value.srcObject = null
}

async function start() {
  stop()
  errorMessage.value = ''

  if (!props.active)
    return
  if (!navigator.mediaDevices?.getUserMedia) {
    const message = 'Este navegador no permite utilizar la cámara. Captura el código manualmente.'

    errorMessage.value = message
    emit('error', message)

    return
  }

  await nextTick()
  if (!video.value || !props.active)
    return

  starting.value = true
  try {
    reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 900,
    })

    const scannerControls = await reader.decodeFromConstraints({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    }, video.value, result => {
      const detectedAt = Date.now()
      if (!result) {
        if (detectedAt - lastSeenAt > 1200)
          lastCode = ''

        return
      }

      const code = result?.getText().trim()
      if (!code)
        return

      lastSeenAt = detectedAt
      if (code === lastCode)
        return

      lastCode = code
      emit('detected', code)
    })

    if (!props.active)
      scannerControls.stop()
    else
      controls = scannerControls
  }
  catch (error) {
    const message = error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'Autoriza el uso de la cámara para escanear productos.'
      : 'No fue posible iniciar la cámara. Puedes capturar el código manualmente.'

    errorMessage.value = message
    emit('error', message)
  }
  finally {
    starting.value = false
  }
}

watch(() => props.active, active => {
  if (active)
    void start()
  else
    stop()
})

onMounted(() => {
  if (props.active)
    void start()
})
onBeforeUnmount(stop)
</script>

<template>
  <div class="barcode-scanner">
    <video
      ref="video"
      class="barcode-video"
      autoplay
      muted
      playsinline
    />
    <div
      class="scanner-guide"
      aria-hidden="true"
    >
      <span />
    </div>
    <div
      v-if="starting"
      class="scanner-status"
    >
      <VProgressCircular
        indeterminate
        color="secondary"
      />
      <span>Iniciando cámara…</span>
    </div>
    <VAlert
      v-if="errorMessage"
      class="scanner-error ma-4"
      color="warning"
      variant="tonal"
    >
      {{ errorMessage }}
    </VAlert>
  </div>
</template>

<style scoped>
.barcode-scanner {
  position: relative;
  overflow: hidden;
  min-block-size: 260px;
  border: 1px solid rgba(151, 213, 222, 0.22);
  border-radius: 20px;
  background: #11130f;
}

.barcode-video {
  display: block;
  inline-size: 100%;
  min-block-size: 260px;
  max-block-size: 58vh;
  object-fit: cover;
}

.scanner-guide {
  position: absolute;
  inset: 18%;
  border: 3px solid rgba(151, 213, 222, 0.9);
  border-radius: 18px;
  box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.22);
  pointer-events: none;
}

.scanner-guide span {
  position: absolute;
  inset-block-start: 50%;
  inset-inline: 8%;
  block-size: 2px;
  background: #ff401b;
  box-shadow: 0 0 12px rgba(255, 64, 27, 0.85);
}

.scanner-status {
  position: absolute;
  inset: 0;
  display: grid;
  color: #ebebeb;
  gap: 12px;
  place-content: center;
  text-align: center;
  background: rgba(17, 19, 15, 0.76);
}

.scanner-error {
  position: absolute;
  inset-block-end: 0;
  inset-inline: 0;
}
</style>
