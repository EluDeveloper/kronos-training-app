<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue'
import { type TrialClassBooking, useTrialClassBookings } from '@/composables/useTrialClassBookings'

interface TrialClassOption {
  label: string
  value: string
  slots: {
    label: string
    key: string
  }[]
}

// Opciones fijas de fechas y horarios permitidos
const dateOptions: TrialClassOption[] = [
  {
    label: '20 de diciembre',
    value: '2024-12-20',
    slots: [
      { label: '6:00 - 7:00 AM', key: '06-07_AM' },
      { label: '7:00 - 8:00 AM', key: '07-08_AM' },
      { label: '8:00 - 9:00 AM', key: '08-09_AM' },
    ],
  },
  {
    label: '22 de diciembre',
    value: '2024-12-22',
    slots: [
      { label: '6:00 - 7:00 AM', key: '06-07_AM' },
      { label: '7:00 - 8:00 AM', key: '07-08_AM' },
      { label: '8:00 - 9:00 AM', key: '08-09_AM' },
      { label: '6:00 - 7:00 PM', key: '06-07_PM' },
      { label: '7:00 - 8:00 PM', key: '07-08_PM' },
    ],
  },
  {
    label: '27 de diciembre',
    value: '2024-12-27',
    slots: [
      { label: '6:00 - 7:00 AM', key: '06-07_AM' },
      { label: '7:00 - 8:00 AM', key: '07-08_AM' },
      { label: '8:00 - 9:00 AM', key: '08-09_AM' },
    ],
  },
  {
    label: '29 de diciembre',
    value: '2024-12-29',
    slots: [
      { label: '6:00 - 7:00 AM', key: '06-07_AM' },
      { label: '7:00 - 8:00 AM', key: '07-08_AM' },
      { label: '8:00 - 9:00 AM', key: '08-09_AM' },
      { label: '6:00 - 7:00 PM', key: '06-07_PM' },
      { label: '7:00 - 8:00 PM', key: '07-08_PM' },
    ],
  },
]

const { capacity, createTrialBooking, getRemainingSeats } = useTrialClassBookings()

// Estado reactivo del formulario
const form = reactive<Omit<TrialClassBooking, 'createdAt' | 'updatedAt'>>({
  fullName: '',
  phone: '',
  hasDiscomfort: false,
  discomfortDescription: '',
  hasDisease: false,
  diseaseDescription: '',
  classDateLabel: '',
  classDate: '',
  timeSlotLabel: '',
  timeSlotKey: '',
})

const isSubmitting = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const remainingSeats = ref<number | null>(null)
const isCheckingSeats = ref(false)

const selectedDateOption = computed(() => dateOptions.find(option => option.value === form.classDate))
const availableTimeSlots = computed(() => selectedDateOption.value?.slots ?? [])

// Validación simple del formulario
const isFormValid = computed(() => {
  const baseValid = form.fullName && form.phone && form.classDate && form.timeSlotKey
  const discomfortValid = !form.hasDiscomfort || !!form.discomfortDescription
  const diseaseValid = !form.hasDisease || !!form.diseaseDescription

  return !!(baseValid && discomfortValid && diseaseValid)
})

const fetchRemainingSeats = async () => {
  if (!form.classDate || !form.timeSlotKey) {
    remainingSeats.value = null

    return
  }

  isCheckingSeats.value = true
  errorMessage.value = ''

  try {
    remainingSeats.value = await getRemainingSeats(form.classDate, form.timeSlotKey)
  }
  catch (error) {
    remainingSeats.value = null
    errorMessage.value = 'No se pudo validar el cupo. Intenta nuevamente.'
    console.error(error)
  }
  finally {
    isCheckingSeats.value = false
  }
}

watch(
  () => [form.classDate, form.timeSlotKey],
  () => {
    fetchRemainingSeats()
  },
)

watch(
  () => form.hasDiscomfort,
  value => {
    if (!value)
      form.discomfortDescription = ''
  },
)

watch(
  () => form.hasDisease,
  value => {
    if (!value)
      form.diseaseDescription = ''
  },
)

const resetForm = () => {
  form.fullName = ''
  form.phone = ''
  form.hasDiscomfort = false
  form.discomfortDescription = ''
  form.hasDisease = false
  form.diseaseDescription = ''
  form.classDate = ''
  form.classDateLabel = ''
  form.timeSlotKey = ''
  form.timeSlotLabel = ''
  remainingSeats.value = null
  successMessage.value = ''
  errorMessage.value = ''
}

const handleDateChange = (value: string) => {
  const option = dateOptions.find(date => date.value === value)

  form.classDate = value
  form.classDateLabel = option?.label ?? ''
  form.timeSlotKey = ''
  form.timeSlotLabel = ''
}

const handleTimeChange = (key: string) => {
  const slot = availableTimeSlots.value.find(time => time.key === key)

  form.timeSlotKey = key
  form.timeSlotLabel = slot?.label ?? ''
}

const submit = async () => {
  if (!isFormValid.value || (remainingSeats.value !== null && remainingSeats.value <= 0))
    return

  isSubmitting.value = true
  successMessage.value = ''
  errorMessage.value = ''

  const payload: TrialClassBooking = {
    ...form,
    createdAt: new Date(),
  }

  try {
    await createTrialBooking(payload)
    successMessage.value = 'Registro guardado correctamente.'
    resetForm()
  }
  catch (error) {
    errorMessage.value = 'Ocurrió un error al guardar el registro.'
    console.error(error)
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="Registro para clase muestra">
        <VCardText class="text-body-1">
          Completa tus datos para apartar un lugar en la clase muestra de Kronos Training.
        </VCardText>

        <VDivider />

        <VCardText>
          <VForm @submit.prevent="submit">
            <VRow>
              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.fullName"
                  label="Nombre completo"
                  placeholder="Ej. María Pérez"
                  required
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.phone"
                  label="Teléfono"
                  placeholder="10 dígitos"
                  required
                />
              </VCol>

              <VCol cols="12">
                <VLabel class="mb-2 d-block">
                  ¿Presenta alguna molestia?
                </VLabel>
                <VRadioGroup
                  v-model="form.hasDiscomfort"
                  inline
                >
                  <VRadio
                    label="Sí"
                    :value="Boolean(true)"
                  />
                  <VRadio
                    label="No"
                    :value="Boolean(false)"
                  />
                </VRadioGroup>
              </VCol>

              <VCol
                v-if="form.hasDiscomfort"
                cols="12"
              >
                <VTextField
                  v-model="form.discomfortDescription"
                  label="Describa la molestia"
                  placeholder="Ej. Dolor de rodilla derecha"
                  required
                />
              </VCol>

              <VCol cols="12">
                <VLabel class="mb-2 d-block">
                  ¿Tiene alguna enfermedad?
                </VLabel>
                <VRadioGroup
                  v-model="form.hasDisease"
                  inline
                >
                  <VRadio
                    label="Sí"
                    :value="Boolean(true)"
                  />
                  <VRadio
                    label="No"
                    :value="Boolean(false)"
                  />
                </VRadioGroup>
              </VCol>

              <VCol
                v-if="form.hasDisease"
                cols="12"
              >
                <VTextField
                  v-model="form.diseaseDescription"
                  label="Describa la enfermedad"
                  placeholder="Ej. Hipertensión controlada"
                  required
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="form.classDate"
                  :items="dateOptions"
                  item-title="label"
                  item-value="value"
                  label="Selecciona la fecha de tu clase muestra"
                  placeholder="Elige una fecha"
                  required
                  @update:model-value="handleDateChange"
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSelect
                  v-model="form.timeSlotKey"
                  :items="availableTimeSlots"
                  item-title="label"
                  item-value="key"
                  label="Selecciona el horario"
                  placeholder="Elige el horario"
                  :disabled="!form.classDate"
                  required
                  @update:model-value="handleTimeChange"
                />
              </VCol>

              <VCol cols="12">
                <VAlert
                  v-if="remainingSeats !== null"
                  :type="remainingSeats > 0 ? 'success' : 'warning'"
                  variant="tonal"
                  class="mb-4"
                >
                  <template v-if="remainingSeats > 0">
                    Lugares disponibles: {{ remainingSeats }} de {{ capacity }}
                  </template>
                  <template v-else>
                    Lo sentimos, este horario ya está lleno. Por favor elige otro horario.
                  </template>
                </VAlert>
              </VCol>

              <VCol
                cols="12"
                class="d-flex gap-4"
              >
                <VBtn
                  color="primary"
                  :loading="isSubmitting || isCheckingSeats"
                  :disabled="!isFormValid || (remainingSeats !== null && remainingSeats <= 0)"
                  type="submit"
                >
                  Guardar registro
                </VBtn>

                <VBtn
                  color="secondary"
                  variant="outlined"
                  type="reset"
                  @click="resetForm"
                >
                  Limpiar
                </VBtn>
              </VCol>

              <VCol cols="12">
                <VAlert
                  v-if="successMessage"
                  type="success"
                  variant="tonal"
                >
                  {{ successMessage }}
                </VAlert>

                <VAlert
                  v-if="errorMessage"
                  type="error"
                  variant="tonal"
                >
                  {{ errorMessage }}
                </VAlert>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
