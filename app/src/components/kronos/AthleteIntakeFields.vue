<script setup lang="ts">
import type { ExerciseSymptom } from '@/types/domain'
import type { AthleteFormErrors, AthleteIntakeForm } from '@/utils/athlete-intake'

withDefaults(defineProps<{
  errors: AthleteFormErrors
  disabled?: boolean
}>(), {
  disabled: false,
})

const model = defineModel<AthleteIntakeForm>({ required: true })

const maritalStatusItems = [
  { title: 'Soltero/a', value: 'single' },
  { title: 'Casado/a', value: 'married' },
  { title: 'Unión libre', value: 'domestic-partnership' },
  { title: 'Divorciado/a', value: 'divorced' },
  { title: 'Viudo/a', value: 'widowed' },
  { title: 'Separado/a', value: 'separated' },
  { title: 'Prefiero no decirlo', value: 'prefer-not-to-say' },
]

const answerItems = [
  { label: 'Sí', value: true },
  { label: 'No', value: false },
]

const symptoms: Array<{ label: string; value: ExerciseSymptom }> = [
  { label: 'Mareos', value: 'dizziness' },
  { label: 'Desmayos', value: 'fainting' },
  { label: 'Náuseas', value: 'nausea' },
  { label: 'Dificultad para respirar', value: 'shortness-of-breath' },
]

type ConditionKey = 'asthma' | 'epilepsy' | 'diabetes' | 'other'

const conditionLabels: Array<{ label: string; value: ConditionKey }> = [
  { label: 'Asmático', value: 'asthma' },
  { label: 'Epiléptico', value: 'epilepsy' },
  { label: 'Diabético', value: 'diabetes' },
  { label: 'Otra', value: 'other' },
]

const hasSymptom = (symptom: ExerciseSymptom) => model.value.healthHistory.exerciseSymptoms.includes(symptom)

function toggleSymptom(symptom: ExerciseSymptom, selected: unknown) {
  const next = new Set(model.value.healthHistory.exerciseSymptoms)
  if (selected === true)
    next.add(symptom)
  else
    next.delete(symptom)

  if (symptom === 'none' && selected === true) {
    next.clear()
    next.add('none')
  }
  else if (symptom !== 'none' && selected === true) {
    next.delete('none')
  }

  model.value.healthHistory.exerciseSymptoms = [...next]
}

function setCondition(condition: ConditionKey, selected: unknown) {
  const checked = selected === true

  model.value.healthHistory.conditions[condition] = checked
  if (checked)
    model.value.healthHistory.conditions.none = false
}

function setNoConditions(selected: unknown) {
  const checked = selected === true

  model.value.healthHistory.conditions.none = checked
  if (checked) {
    model.value.healthHistory.conditions.asthma = false
    model.value.healthHistory.conditions.epilepsy = false
    model.value.healthHistory.conditions.diabetes = false
    model.value.healthHistory.conditions.other = false
    model.value.healthHistory.conditions.otherDescription = ''
  }
}
</script>

<template>
  <section
    aria-labelledby="athlete-intake-heading"
    class="d-flex flex-column ga-1"
  >
    <h3
      id="athlete-intake-heading"
      class="text-subtitle-1"
    >
      Datos de admisión
    </h3>
    <p class="text-body-2 text-medium-emphasis mb-2">
      Esta información es sensible y sólo está disponible para personal autorizado.
    </p>
  </section>

  <VRow>
    <VCol
      cols="12"
      md="6"
      data-athlete-field="maritalStatus"
    >
      <VSelect
        v-model="model.maritalStatus"
        :items="maritalStatusItems"
        label="Estado civil"
        :disabled="disabled"
        :error-messages="errors.maritalStatus ? [errors.maritalStatus] : []"
        required
      />
    </VCol>
  </VRow>

  <h4 class="text-subtitle-2 mt-2 mb-1">
    Contacto de emergencia
  </h4>
  <VRow>
    <VCol
      cols="12"
      md="5"
      data-athlete-field="emergencyContactName"
    >
      <VTextField
        v-model="model.emergencyContact.name"
        label="Nombre"
        :disabled="disabled"
        :error-messages="errors.emergencyContactName ? [errors.emergencyContactName] : []"
        autocomplete="off"
        required
      />
    </VCol>
    <VCol
      cols="12"
      sm="6"
      md="3"
      data-athlete-field="emergencyContactPhone"
    >
      <VTextField
        v-model="model.emergencyContact.phone"
        label="Teléfono"
        inputmode="numeric"
        maxlength="10"
        :disabled="disabled"
        :error-messages="errors.emergencyContactPhone ? [errors.emergencyContactPhone] : []"
        autocomplete="off"
        required
      />
    </VCol>
    <VCol
      cols="12"
      sm="6"
      md="4"
      data-athlete-field="emergencyContactRelationship"
    >
      <VTextField
        v-model="model.emergencyContact.relationship"
        label="Parentesco"
        :disabled="disabled"
        :error-messages="errors.emergencyContactRelationship ? [errors.emergencyContactRelationship] : []"
        autocomplete="off"
        required
      />
    </VCol>
  </VRow>

  <h4 class="text-subtitle-2 mt-2 mb-1">
    Datos de salud
  </h4>
  <VRow>
    <VCol
      cols="12"
      md="6"
      data-athlete-field="boneInjury"
    >
      <VRadioGroup
        v-model="model.healthHistory.boneInjury"
        label="¿Ha tenido o tiene alguna lesión ósea?"
        :disabled="disabled"
        :error-messages="errors.boneInjury ? [errors.boneInjury] : []"
        inline
      >
        <VRadio
          v-for="answer in answerItems"
          :key="`bone-${answer.label}`"
          :label="answer.label"
          :value="answer.value"
        />
      </VRadioGroup>
    </VCol>
    <VCol
      cols="12"
      md="6"
      data-athlete-field="cardiovascularDisease"
    >
      <VRadioGroup
        v-model="model.healthHistory.cardiovascularDisease"
        label="¿Padece alguna enfermedad cardiovascular?"
        :disabled="disabled"
        :error-messages="errors.cardiovascularDisease ? [errors.cardiovascularDisease] : []"
        inline
      >
        <VRadio
          v-for="answer in answerItems"
          :key="`cardio-${answer.label}`"
          :label="answer.label"
          :value="answer.value"
        />
      </VRadioGroup>
    </VCol>
    <VCol
      cols="12"
      md="6"
      data-athlete-field="exerciseBreathingDifficulty"
    >
      <VRadioGroup
        v-model="model.healthHistory.exerciseBreathingDifficulty"
        label="¿Se asfixia con facilidad al realizar ejercicio físico?"
        :disabled="disabled"
        :error-messages="errors.exerciseBreathingDifficulty ? [errors.exerciseBreathingDifficulty] : []"
        inline
      >
        <VRadio
          v-for="answer in answerItems"
          :key="`breath-${answer.label}`"
          :label="answer.label"
          :value="answer.value"
        />
      </VRadioGroup>
    </VCol>
    <VCol
      cols="12"
      md="6"
      data-athlete-field="anemia"
    >
      <VRadioGroup
        v-model="model.healthHistory.anemia"
        label="¿Padece de anemia en la actualidad?"
        :disabled="disabled"
        :error-messages="errors.anemia ? [errors.anemia] : []"
        inline
      >
        <VRadio
          v-for="answer in answerItems"
          :key="`anemia-${answer.label}`"
          :label="answer.label"
          :value="answer.value"
        />
      </VRadioGroup>
    </VCol>

    <VCol cols="12">
      <fieldset
        class="athlete-intake-fieldset"
        data-athlete-field="conditions"
      >
        <legend class="text-body-1 mb-1">
          ¿Es usted?
        </legend>
        <p class="text-caption text-medium-emphasis mb-2">
          Selecciona todas las opciones que correspondan o confirma que ninguna aplica.
        </p>
        <VCheckbox
          v-for="condition in conditionLabels"
          :key="condition.value"
          :model-value="model.healthHistory.conditions[condition.value] === true"
          :label="condition.label"
          :disabled="disabled"
          density="compact"
          hide-details
          @update:model-value="setCondition(condition.value, $event)"
        />
        <VCheckbox
          :model-value="model.healthHistory.conditions.none === true"
          label="Ninguna de las anteriores"
          :disabled="disabled"
          density="compact"
          :error-messages="errors.conditions ? [errors.conditions] : []"
          @update:model-value="setNoConditions"
        />
        <VTextField
          v-if="model.healthHistory.conditions.other === true"
          v-model="model.healthHistory.conditions.otherDescription"
          class="mt-2"
          data-athlete-field="otherCondition"
          label="Otra condición: menciona cuál"
          :disabled="disabled"
          :error-messages="errors.otherCondition ? [errors.otherCondition] : []"
          required
        />
      </fieldset>
    </VCol>

    <VCol
      cols="12"
      md="6"
    >
      <fieldset
        class="athlete-intake-fieldset"
        data-athlete-field="exerciseSymptoms"
      >
        <legend class="text-body-1 mb-1">
          Síntomas al realizar esfuerzos o ejercicio físico
        </legend>
        <p class="text-caption text-medium-emphasis mb-2">
          Selecciona todas las opciones que correspondan.
        </p>
        <VCheckbox
          v-for="symptom in symptoms"
          :key="symptom.value"
          :model-value="hasSymptom(symptom.value)"
          :label="symptom.label"
          :disabled="disabled"
          density="compact"
          hide-details
          @update:model-value="toggleSymptom(symptom.value, $event)"
        />
        <VCheckbox
          :model-value="hasSymptom('none')"
          label="Ninguna"
          :disabled="disabled"
          density="compact"
          :error-messages="errors.exerciseSymptoms ? [errors.exerciseSymptoms] : []"
          @update:model-value="toggleSymptom('none', $event)"
        />
      </fieldset>
    </VCol>

    <VCol
      cols="12"
      md="6"
      data-athlete-field="sportsActivity"
    >
      <VRadioGroup
        v-model="model.healthHistory.sportsActivity.practiced"
        label="¿Ha participado o practica alguna actividad deportiva?"
        :disabled="disabled"
        :error-messages="errors.sportsActivity ? [errors.sportsActivity] : []"
        inline
      >
        <VRadio
          v-for="answer in answerItems"
          :key="`sport-${answer.label}`"
          :label="answer.label"
          :value="answer.value"
        />
      </VRadioGroup>
      <VTextField
        v-if="model.healthHistory.sportsActivity.practiced === true"
        v-model="model.healthHistory.sportsActivity.description"
        data-athlete-field="sportsActivityDescription"
        label="¿Cuál actividad?"
        :disabled="disabled"
        :error-messages="errors.sportsActivityDescription ? [errors.sportsActivityDescription] : []"
        required
      />
    </VCol>

    <VCol
      cols="12"
      md="6"
      data-athlete-field="sportsFacility"
    >
      <VRadioGroup
        v-model="model.healthHistory.sportsFacility.attended"
        label="¿Ha estado inscrito en algún gimnasio o instalación deportiva?"
        :disabled="disabled"
        :error-messages="errors.sportsFacility ? [errors.sportsFacility] : []"
        inline
      >
        <VRadio
          v-for="answer in answerItems"
          :key="`facility-${answer.label}`"
          :label="answer.label"
          :value="answer.value"
        />
      </VRadioGroup>
      <VTextField
        v-if="model.healthHistory.sportsFacility.attended === true"
        v-model="model.healthHistory.sportsFacility.description"
        data-athlete-field="sportsFacilityDescription"
        label="¿Cuál gimnasio o instalación?"
        :disabled="disabled"
        :error-messages="errors.sportsFacilityDescription ? [errors.sportsFacilityDescription] : []"
        required
      />
    </VCol>
  </VRow>
</template>

<style scoped>
.athlete-intake-fieldset {
  border: 0;
  padding: 0;
  margin: 0;
}
</style>
