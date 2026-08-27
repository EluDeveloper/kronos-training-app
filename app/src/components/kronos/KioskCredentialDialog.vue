<script setup lang="ts">
import KioskCredentialCard from '@/components/kronos/KioskCredentialCard.vue'
import { useNotifications } from '@/composables/useNotifications'
import type { Athlete } from '@/types/domain'
import {
  downloadKioskCredential,
  generateKioskCode,
  kioskCredentialWhatsAppMessage,
  kioskCredentialWhatsAppUrl,
  parseKioskCodePayload,
} from '@/utils/kiosk-code'

const props = withDefaults(defineProps<{
  modelValue: boolean
  athlete: Athlete | null
  occupiedCodes?: string[]
  saving?: boolean
}>(), {
  occupiedCodes: () => [],
  saving: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [code: string]
}>()

const { success, failure } = useNotifications()
const candidateCode = ref('')
const confirmingRegeneration = ref(false)
const working = ref(false)
const copied = ref(false)
const discardedCodes = new Set<string>()

const persistedCode = computed(() => parseKioskCodePayload(props.athlete?.kioskCode ?? '') ?? '')
const displayCode = computed(() => candidateCode.value || persistedCode.value)
const hasPendingCandidate = computed(() => Boolean(candidateCode.value))

const credentialData = computed(() => props.athlete && persistedCode.value
  ? { athleteName: props.athlete.profile.name, code: persistedCode.value }
  : null)

function resetDraft() {
  candidateCode.value = ''
  confirmingRegeneration.value = false
  copied.value = false
  discardedCodes.clear()
}

function generateCandidate() {
  const occupiedCodes = new Set(props.occupiedCodes)

  occupiedCodes.delete(persistedCode.value)
  if (candidateCode.value)
    discardedCodes.add(candidateCode.value)
  if (persistedCode.value)
    discardedCodes.add(persistedCode.value)

  const result = generateKioskCode(occupiedCodes, { excludedCodes: discardedCodes })
  if (!result.ok) {
    failure('No fue posible obtener un código disponible. Vuelve a intentarlo.')

    return
  }

  candidateCode.value = result.code
  confirmingRegeneration.value = false
}

function requestCandidate() {
  if (persistedCode.value && !hasPendingCandidate.value) {
    confirmingRegeneration.value = true

    return
  }

  generateCandidate()
}

function close() {
  if (props.saving || working.value)
    return

  resetDraft()
  emit('update:modelValue', false)
}

function saveCandidate() {
  if (candidateCode.value)
    emit('save', candidateCode.value)
}

async function copyMessage() {
  if (!credentialData.value)
    return

  try {
    await navigator.clipboard.writeText(kioskCredentialWhatsAppMessage(credentialData.value))
    copied.value = true
    success('Mensaje de la credencial copiado.')
    window.setTimeout(() => { copied.value = false }, 2_200)
  }
  catch {
    failure('No fue posible copiar el mensaje. Revisa los permisos del navegador.')
  }
}

async function downloadCredential() {
  if (!credentialData.value || working.value)
    return

  working.value = true
  try {
    await downloadKioskCredential(credentialData.value)
    success('Credencial QR descargada como PNG.')
  }
  catch (error) {
    failure(error instanceof Error ? error.message : 'No fue posible descargar la credencial.')
  }
  finally {
    working.value = false
  }
}

async function shareCredential() {
  if (!credentialData.value || !props.athlete || working.value)
    return

  const whatsappWindow = window.open('', '_blank')
  if (!whatsappWindow) {
    failure('El navegador bloqueó WhatsApp Web. Permite ventanas emergentes e inténtalo nuevamente.')

    return
  }

  whatsappWindow.opener = null
  working.value = true
  try {
    await downloadKioskCredential(credentialData.value)
    whatsappWindow.location.href = kioskCredentialWhatsAppUrl(credentialData.value, props.athlete.profile.phone)
    success('PNG descargado y WhatsApp Web abierto. Adjunta la credencial manualmente.')
  }
  catch (error) {
    whatsappWindow.close()
    failure(error instanceof Error ? error.message : 'No fue posible preparar la credencial para compartir.')
  }
  finally {
    working.value = false
  }
}

watch(() => [props.modelValue, props.athlete?.id] as const, ([open], previous) => {
  if (!open || previous?.[1] !== props.athlete?.id)
    resetDraft()
})

watch(persistedCode, code => {
  if (code && code === candidateCode.value)
    resetDraft()
})
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="820"
    persistent
    scrollable
    aria-labelledby="kiosk-credential-title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem class="pa-5 pa-sm-6 pb-2">
        <VCardTitle id="kiosk-credential-title">
          Credencial QR de Kiosco
        </VCardTitle>
        <VCardSubtitle>{{ athlete?.profile.name }}</VCardSubtitle>
      </VCardItem>

      <VCardText class="pa-4 pa-sm-6">
        <VAlert
          class="mb-5"
          color="info"
          variant="tonal"
          icon="ri-qr-code-line"
        >
          El QR contiene únicamente el código aleatorio de 6 dígitos. Compártelo sólo con el atleta.
        </VAlert>

        <div
          v-if="athlete"
          class="credential-layout"
        >
          <KioskCredentialCard
            v-if="displayCode"
            :athlete-name="athlete.profile.name"
            :code="displayCode"
            :status="hasPendingCandidate ? 'pending' : 'persisted'"
          />
          <div
            v-else
            class="credential-empty"
            role="status"
          >
            <VIcon
              icon="ri-qr-code-line"
              size="56"
              class="mb-3"
            />
            <p class="text-h6 font-weight-bold mb-1">
              Sin credencial
            </p>
            <p class="text-body-2 text-medium-emphasis mb-0">
              Genera un código para preparar la primera tarjeta QR.
            </p>
          </div>

          <div class="d-flex flex-column ga-4">
            <VAlert
              v-if="hasPendingCandidate && persistedCode"
              color="warning"
              variant="tonal"
              icon="ri-history-line"
              role="status"
              aria-live="polite"
            >
              El código vigente <strong>{{ persistedCode }}</strong> seguirá funcionando hasta guardar el nuevo.
            </VAlert>

            <VAlert
              v-if="confirmingRegeneration"
              color="warning"
              variant="outlined"
              icon="ri-error-warning-line"
              title="¿Preparar un código nuevo?"
            >
              La credencial anterior seguirá activa hasta guardar el nuevo código. Después dejará de funcionar.
              <div class="d-flex flex-wrap ga-2 mt-4">
                <VBtn
                  size="small"
                  variant="text"
                  @click="confirmingRegeneration = false"
                >
                  Conservar actual
                </VBtn>
                <VBtn
                  size="small"
                  color="warning"
                  @click="generateCandidate"
                >
                  Preparar código
                </VBtn>
              </div>
            </VAlert>

            <VBtn
              v-if="!confirmingRegeneration"
              :prepend-icon="displayCode ? 'ri-refresh-line' : 'ri-magic-line'"
              variant="tonal"
              :disabled="saving || working"
              @click="requestCandidate"
            >
              {{ hasPendingCandidate ? 'Generar otro candidato' : persistedCode ? 'Regenerar código' : 'Generar código' }}
            </VBtn>

            <VBtn
              v-if="hasPendingCandidate"
              prepend-icon="ri-save-3-line"
              :loading="saving"
              :disabled="working"
              @click="saveCandidate"
            >
              Guardar código nuevo
            </VBtn>

            <VDivider v-if="persistedCode" />

            <template v-if="persistedCode">
              <p class="text-caption text-medium-emphasis mb-n2">
                Estas acciones siempre utilizan la credencial vigente {{ persistedCode }}.
              </p>
              <VBtn
                prepend-icon="ri-download-2-line"
                variant="tonal"
                :loading="working"
                :disabled="saving"
                @click="downloadCredential"
              >
                Descargar PNG vigente
              </VBtn>
              <VBtn
                :prepend-icon="copied ? 'ri-check-line' : 'ri-file-copy-line'"
                variant="tonal"
                :disabled="saving || working"
                @click="copyMessage"
              >
                {{ copied ? 'Mensaje copiado' : 'Copiar mensaje' }}
              </VBtn>
              <VBtn
                prepend-icon="ri-whatsapp-line"
                color="success"
                variant="tonal"
                :disabled="saving || working"
                @click="shareCredential"
              >
                WhatsApp Web
              </VBtn>
            </template>
          </div>
        </div>
      </VCardText>

      <VCardActions class="pa-4 pa-sm-6 pt-0">
        <VSpacer />
        <VBtn
          variant="text"
          :disabled="saving || working"
          @click="close"
        >
          Cerrar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.credential-layout {
  display: grid;
  align-items: start;
  gap: 1.5rem;
  grid-template-columns: minmax(0, 22.5rem) minmax(15rem, 1fr);
}

.credential-empty {
  display: grid;
  min-block-size: 22rem;
  place-content: center;
  padding: 2rem;
  border: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 1.5rem;
  text-align: center;
}

@media (max-width: 720px) {
  .credential-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
