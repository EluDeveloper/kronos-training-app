<script setup lang="ts">
import type { Athlete } from '@/types/domain'
import {
  buildNotificationConsentMutation,
  maskPhoneE164,
  normalizePhoneE164,
  type NotificationConsent,
} from '@/utils/payment-notification'

const props = defineProps<{
  modelValue: boolean
  athlete: Athlete | null
  preference: NotificationConsent | null
  operatorUid: string | null
  loading: boolean
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [preference: NotificationConsent]
}>()

const receiptOptIn = ref(false)
const reminderOptIn = ref(false)
const consentConfirmed = ref(false)
const withdrawalConfirmed = ref(false)
const validationError = ref<string | null>(null)

const currentPhoneE164 = computed(() => normalizePhoneE164(props.athlete?.profile.phone))
const consentedPhone = computed(() => props.preference?.consentedPhoneE164 ?? null)
const phoneChanged = computed(() => Boolean(consentedPhone.value && currentPhoneE164.value && consentedPhone.value !== currentPhoneE164.value))
const hasOptIn = computed(() => receiptOptIn.value || reminderOptIn.value)

const isWithdrawing = computed(() => Boolean(
  (props.preference?.receiptStatus === 'opted-in' && !receiptOptIn.value)
  || (props.preference?.reminderStatus === 'opted-in' && !reminderOptIn.value),
))

const requiresConsentConfirmation = computed(() => Boolean(
  hasOptIn.value && (
    !props.preference
    || phoneChanged.value
    || (receiptOptIn.value && props.preference.receiptStatus !== 'opted-in')
    || (reminderOptIn.value && props.preference.reminderStatus !== 'opted-in')
  ),
))

const canSave = computed(() => Boolean(
  props.athlete
  && !props.loading
  && !props.saving
  && (!hasOptIn.value || Boolean(currentPhoneE164.value))
  && (!requiresConsentConfirmation.value || consentConfirmed.value)
  && (!isWithdrawing.value || withdrawalConfirmed.value),
))

function hydrate() {
  receiptOptIn.value = props.preference?.receiptStatus === 'opted-in'
  reminderOptIn.value = props.preference?.reminderStatus === 'opted-in'
  consentConfirmed.value = false
  withdrawalConfirmed.value = false
  validationError.value = null
}

watch(
  () => [props.modelValue, props.athlete?.id, props.preference?.updatedAt] as const,
  () => hydrate(),
  { immediate: true },
)

function close() {
  if (!props.saving)
    emit('update:modelValue', false)
}

function save() {
  if (!props.athlete || !props.operatorUid || !canSave.value)
    return

  validationError.value = null
  try {
    emit('save', buildNotificationConsentMutation({
      athleteId: props.athlete.id,
      phone: props.athlete.profile.phone,
      current: props.preference,
      receiptOptIn: receiptOptIn.value,
      reminderOptIn: reminderOptIn.value,
      consentConfirmed: consentConfirmed.value,
      withdrawalConfirmed: withdrawalConfirmed.value,
      recordedBy: props.operatorUid,
      now: Date.now(),
    }))
  }
  catch (error) {
    validationError.value = error instanceof Error ? error.message : 'Revisa la autorización antes de guardar.'
  }
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="620"
    scrollable
    aria-labelledby="whatsapp-consent-title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard
      v-if="athlete"
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        title="Notificaciones por WhatsApp"
        :subtitle="athlete.profile.name"
      />

      <VCardText class="pa-4 pa-sm-6">
        <section aria-labelledby="whatsapp-consent-title">
          <div class="d-flex align-start ga-3 mb-5">
            <VAvatar
              color="success"
              variant="tonal"
              rounded="lg"
              size="44"
              aria-hidden="true"
            >
              <VIcon icon="ri-whatsapp-line" />
            </VAvatar>
            <div>
              <h2
                id="whatsapp-consent-title"
                class="text-h6 font-weight-bold mb-1"
              >
                Autorización de pagos
              </h2>
              <p class="text-body-2 text-medium-emphasis mb-0">
                Registra la autorización del atleta. Guardar aquí no envía ningún mensaje.
              </p>
            </div>
          </div>

          <VAlert
            class="mb-5"
            color="info"
            variant="tonal"
            icon="ri-shield-check-line"
          >
            El consentimiento se vincula sólo con el teléfono actual y se conserva separado de los datos de admisión.
          </VAlert>

          <VAlert
            v-if="loading"
            class="mb-5"
            color="info"
            variant="outlined"
            role="status"
            aria-live="polite"
          >
            Cargando autorización…
          </VAlert>

          <VAlert
            v-else-if="error"
            class="mb-5"
            color="error"
            variant="tonal"
            icon="ri-error-warning-line"
            title="No fue posible consultar la autorización"
          >
            {{ error }}
          </VAlert>

          <VAlert
            v-if="!loading && !currentPhoneE164"
            class="mb-5"
            color="error"
            variant="tonal"
            icon="ri-phone-lock-line"
            title="Teléfono no válido"
          >
            Actualiza el teléfono del atleta antes de activar una notificación.
          </VAlert>

          <VAlert
            v-else-if="!loading && phoneChanged"
            class="mb-5"
            color="warning"
            variant="tonal"
            icon="ri-phone-line"
            title="El teléfono cambió"
          >
            La autorización anterior corresponde a {{ maskPhoneE164(consentedPhone) }}. Para activar el número actual {{ maskPhoneE164(currentPhoneE164) }}, confirma nuevamente de forma explícita.
          </VAlert>

          <div class="consent-phone rounded-lg pa-4 mb-5">
            <div class="text-caption text-medium-emphasis">
              Teléfono actual
            </div>
            <div class="font-weight-bold">
              {{ maskPhoneE164(currentPhoneE164) }}
            </div>
          </div>

          <div class="consent-options rounded-lg pa-4 mb-5">
            <div class="text-subtitle-2 font-weight-bold mb-1">
              Propósitos autorizados
            </div>
            <p class="text-caption text-medium-emphasis mb-2">
              Selecciona sólo lo que la persona autorizó recibir.
            </p>
            <VCheckbox
              v-model="receiptOptIn"
              label="Recibos de pagos aplicados"
              :disabled="loading || saving || !currentPhoneE164"
              color="success"
              hide-details
            />
            <VCheckbox
              v-model="reminderOptIn"
              label="Recordatorios de adeudo"
              :disabled="loading || saving || !currentPhoneE164"
              color="success"
              hide-details
            />
            <div class="d-flex flex-wrap ga-2 mt-3">
              <VChip
                v-if="preference?.receiptStatus === 'opted-out'"
                color="warning"
                size="small"
                variant="tonal"
              >
                Recibos retirados
              </VChip>
              <VChip
                v-if="preference?.reminderStatus === 'opted-out'"
                color="warning"
                size="small"
                variant="tonal"
              >
                Recordatorios retirados
              </VChip>
            </div>
          </div>

          <VCheckbox
            v-if="requiresConsentConfirmation"
            v-model="consentConfirmed"
            class="mb-2"
            color="primary"
            :disabled="loading || saving"
            label="Confirmo que el atleta autorizó recibir los propósitos seleccionados en este teléfono."
            hide-details
          />

          <VCheckbox
            v-if="isWithdrawing"
            v-model="withdrawalConfirmed"
            class="mb-2"
            color="warning"
            :disabled="loading || saving"
            label="Confirmo retirar las autorizaciones desmarcadas; no se borrará el historial."
            hide-details
          />

          <VAlert
            v-if="validationError"
            class="mt-4"
            color="error"
            variant="tonal"
            icon="ri-error-warning-line"
          >
            {{ validationError }}
          </VAlert>
        </section>
      </VCardText>

      <VCardActions class="pa-6 pt-0 flex-wrap ga-2">
        <VBtn
          variant="text"
          :disabled="saving"
          @click="close"
        >
          Cancelar
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          prepend-icon="ri-save-line"
          :loading="saving"
          :disabled="!canSave"
          @click="save"
        >
          Guardar autorización
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.consent-phone {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-surface-variant), 0.32);
}

.consent-options {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
