<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { type Member, useMembers } from '@/composables/useMembers'

const { createMember, getMemberById, updateMember } = useMembers()
const route = useRoute()

const memberId = computed(() => route.params.id as string | undefined)
const isEditing = computed(() => !!memberId.value)

// Estado base del formulario con valores iniciales
const form = reactive<Member>({
  id: undefined,
  memberNumber: '',
  enrollmentDate: '',
  lastName: '',
  firstName: '',
  birthDate: '',
  age: 0,
  gender: '',
  maritalStatus: '',
  address: '',
  city: '',
  neighborhood: '',
  postalCode: '',
  email: '',
  phone: '',
  socialProfile: '',
  membershipCost: 0,
  discountPercent: 0,
  emergencyContactName: '',
  emergencyContactRelation: '',
  emergencyContactPhone: '',
  profession: '',
  currentlyWorking: false,
  workerType: '',
  isStudent: false,
  hasBoneInjury: false,
  boneInjuryDescription: '',
  hasMuscleInjury: false,
  muscleInjuryDescription: '',
  hasCardioDisease: false,
  cardioDiseaseDescription: '',
  getsEasilyShortOfBreath: false,
  isAsthmatic: false,
  isEpileptic: false,
  isDiabetic: false,
  otherCondition: '',
  isPregnant: false,
  hasAnemia: false,
  symptomDizziness: false,
  symptomFainting: false,
  symptomNausea: false,
  symptomBreathingDifficulty: false,
  hasSportBackground: false,
  hasBeenInGym: false,
  createdAt: new Date(),
  updatedAt: undefined,
})

const isSubmitting = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// Genera el No. Socio con iniciales, fecha de nacimiento y hora de registro
const generateMemberNumber = () => {
  const initials = `${form.firstName} ${form.lastName}`
    .split(' ')
    .filter(Boolean)
    .map(name => name[0]?.toUpperCase())
    .join('')

  const birth = form.birthDate.replaceAll('-', '')

  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`

  return `${initials}-${birth}-${time}`
}

const loadMember = async () => {
  if (!memberId.value)
    return

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    const member = await getMemberById(memberId.value)

    if (!member) {
      errorMessage.value = 'No se encontró el miembro solicitado.'

      return
    }

    Object.assign(form, member)
  }
  catch (error) {
    console.error(error)
    errorMessage.value = 'Ocurrió un error al cargar la información.'
  }
  finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  loadMember()
})

// Validación básica de campos requeridos
const isFormValid = computed(() => {
  return !!(
    form.firstName
    && form.lastName
    && form.birthDate
    && form.enrollmentDate
    && form.email
    && form.phone
  )
})

const resetForm = () => {
  Object.assign(form, {
    id: undefined,
    memberNumber: '',
    enrollmentDate: '',
    lastName: '',
    firstName: '',
    birthDate: '',
    age: 0,
    gender: '',
    maritalStatus: '',
    address: '',
    city: '',
    neighborhood: '',
    postalCode: '',
    email: '',
    phone: '',
    socialProfile: '',
    membershipCost: 0,
    discountPercent: 0,
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhone: '',
    profession: '',
    currentlyWorking: false,
    workerType: '',
    isStudent: false,
    hasBoneInjury: false,
    boneInjuryDescription: '',
    hasMuscleInjury: false,
    muscleInjuryDescription: '',
    hasCardioDisease: false,
    cardioDiseaseDescription: '',
    getsEasilyShortOfBreath: false,
    isAsthmatic: false,
    isEpileptic: false,
    isDiabetic: false,
    otherCondition: '',
    isPregnant: false,
    hasAnemia: false,
    symptomDizziness: false,
    symptomFainting: false,
    symptomNausea: false,
    symptomBreathingDifficulty: false,
    hasSportBackground: false,
    hasBeenInGym: false,
    createdAt: new Date(),
    updatedAt: undefined,
  })

  successMessage.value = ''
  errorMessage.value = ''
}

const handleSubmit = async () => {
  if (!isFormValid.value)
    return

  isSubmitting.value = true
  successMessage.value = ''
  errorMessage.value = ''

  try {
    if (isEditing.value && memberId.value) {
      await updateMember(memberId.value, form)
      successMessage.value = 'Registro actualizado correctamente.'
    }
    else {
      form.memberNumber = generateMemberNumber()
      await createMember(form)
      successMessage.value = 'Registro guardado correctamente.'
      resetForm()
    }

    if (isEditing.value)
      await loadMember()
  }
  catch (error) {
    console.error(error)
    errorMessage.value = 'Ocurrió un error al guardar la información.'
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="Inscripción de miembros">
        <VCardText class="text-body-1">
          Completa la información del cliente para formalizar su registro en Kronos Training.
        </VCardText>

        <VDivider />

        <VCardText>
          <VForm @submit.prevent="handleSubmit">
            <VRow>
              <VCol cols="12">
                <h6 class="text-subtitle-1 mb-4">
                  Encabezado
                </h6>
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.enrollmentDate"
                  label="Fecha de inscripción"
                  type="date"
                  required
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.memberNumber"
                  label="No. Socio"
                  placeholder="Se genera automáticamente"
                  readonly
                />
              </VCol>

              <VCol cols="12">
                <h6 class="text-subtitle-1 mb-4">
                  Datos personales
                </h6>
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.lastName"
                  label="Apellidos"
                  required
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model="form.firstName"
                  label="Nombre(s)"
                  required
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.birthDate"
                  label="Fecha de nacimiento"
                  type="date"
                  required
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model.number="form.age"
                  label="Edad"
                  type="number"
                  min="0"
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VSelect
                  v-model="form.gender"
                  :items="['Masculino', 'Femenino', 'Otro']"
                  label="Sexo"
                  placeholder="Selecciona"
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.maritalStatus"
                  label="Estado civil"
                />
              </VCol>

              <VCol
                cols="12"
                md="8"
              >
                <VTextField
                  v-model="form.address"
                  label="Dirección"
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.city"
                  label="Localidad"
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.neighborhood"
                  label="Colonia"
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.postalCode"
                  label="CP"
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.email"
                  label="Correo electrónico"
                  type="email"
                  required
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.phone"
                  label="Teléfono"
                  required
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.socialProfile"
                  label="Perfil de redes sociales"
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="form.membershipCost"
                  label="Costo de membresía"
                  type="number"
                  min="0"
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="form.discountPercent"
                  label="Descuento (%)"
                  type="number"
                  min="0"
                  max="100"
                />
              </VCol>

              <VCol cols="12">
                <h6 class="text-subtitle-1 mb-4">
                  Contacto en caso de emergencia
                </h6>
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.emergencyContactName"
                  label="Nombre"
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.emergencyContactRelation"
                  label="Relación"
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.emergencyContactPhone"
                  label="Teléfono"
                />
              </VCol>

              <VCol cols="12">
                <h6 class="text-subtitle-1 mb-4">
                  Datos profesionales
                </h6>
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VTextField
                  v-model="form.profession"
                  label="Profesión"
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VSwitch
                  v-model="form.currentlyWorking"
                  label="Trabaja actualmente"
                  color="primary"
                  inset
                />
              </VCol>

              <VCol
                cols="12"
                md="4"
              >
                <VSelect
                  v-model="form.workerType"
                  :items="['Privado', 'Autónomo', '']"
                  label="Trabajador"
                  placeholder="Selecciona"
                />
              </VCol>

              <VCol cols="12">
                <VSwitch
                  v-model="form.isStudent"
                  label="Estudiante"
                  color="primary"
                  inset
                />
              </VCol>

              <VCol cols="12">
                <h6 class="text-subtitle-1 mb-4">
                  Cuestionario previo de salud
                </h6>
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSwitch
                  v-model="form.hasBoneInjury"
                  label="¿Ha tenido o tiene alguna lesión ósea?"
                  color="primary"
                  inset
                />
                <VTextField
                  v-if="form.hasBoneInjury"
                  v-model="form.boneInjuryDescription"
                  label="Describa la lesión ósea"
                  class="mt-3"
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSwitch
                  v-model="form.hasMuscleInjury"
                  label="¿Ha tenido o tiene alguna lesión muscular?"
                  color="primary"
                  inset
                />
                <VTextField
                  v-if="form.hasMuscleInjury"
                  v-model="form.muscleInjuryDescription"
                  label="Describa la lesión muscular"
                  class="mt-3"
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSwitch
                  v-model="form.hasCardioDisease"
                  label="¿Padece alguna enfermedad cardiovascular?"
                  color="primary"
                  inset
                />
                <VTextField
                  v-if="form.hasCardioDisease"
                  v-model="form.cardioDiseaseDescription"
                  label="Describa la enfermedad cardiovascular"
                  class="mt-3"
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSwitch
                  v-model="form.getsEasilyShortOfBreath"
                  label="¿Se asfixia con facilidad al realizar ejercicio físico?"
                  color="primary"
                  inset
                />
              </VCol>

              <VCol cols="12">
                <VRow>
                  <VCol
                    cols="12"
                    md="3"
                  >
                    <VSwitch
                      v-model="form.isAsthmatic"
                      label="Asmático"
                      inset
                    />
                  </VCol>

                  <VCol
                    cols="12"
                    md="3"
                  >
                    <VSwitch
                      v-model="form.isEpileptic"
                      label="Epiléptico"
                      inset
                    />
                  </VCol>

                  <VCol
                    cols="12"
                    md="3"
                  >
                    <VSwitch
                      v-model="form.isDiabetic"
                      label="Diabético"
                      inset
                    />
                  </VCol>

                  <VCol
                    cols="12"
                    md="3"
                  >
                    <VTextField
                      v-model="form.otherCondition"
                      label="Otra"
                    />
                  </VCol>
                </VRow>
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSwitch
                  v-model="form.isPregnant"
                  label="¿Está embarazada o sospecha estarlo?"
                  inset
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSwitch
                  v-model="form.hasAnemia"
                  label="¿Padece de anemia en la actualidad?"
                  inset
                />
              </VCol>

              <VCol cols="12">
                <h6 class="text-subtitle-1 mb-4">
                  Síntomas durante el ejercicio
                </h6>
              </VCol>

              <VCol
                cols="12"
                md="3"
              >
                <VSwitch
                  v-model="form.symptomDizziness"
                  label="Mareos"
                  inset
                />
              </VCol>

              <VCol
                cols="12"
                md="3"
              >
                <VSwitch
                  v-model="form.symptomFainting"
                  label="Desmayos"
                  inset
                />
              </VCol>

              <VCol
                cols="12"
                md="3"
              >
                <VSwitch
                  v-model="form.symptomNausea"
                  label="Náuseas"
                  inset
                />
              </VCol>

              <VCol
                cols="12"
                md="3"
              >
                <VSwitch
                  v-model="form.symptomBreathingDifficulty"
                  label="Dificultad para respirar"
                  inset
                />
              </VCol>

              <VCol cols="12">
                <h6 class="text-subtitle-1 mb-4">
                  Historial deportivo
                </h6>
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSwitch
                  v-model="form.hasSportBackground"
                  label="¿Ha participado o practica alguna actividad deportiva?"
                  inset
                />
              </VCol>

              <VCol
                cols="12"
                md="6"
              >
                <VSwitch
                  v-model="form.hasBeenInGym"
                  label="¿Ha estado inscrito en algún gimnasio o instalación deportiva?"
                  inset
                />
              </VCol>

              <VCol
                cols="12"
                class="d-flex gap-4"
              >
                <VBtn
                  color="primary"
                  :loading="isSubmitting"
                  :disabled="!isFormValid"
                  type="submit"
                >
                  {{ isEditing ? 'Actualizar' : 'Guardar' }}
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
