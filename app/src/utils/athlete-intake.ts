import type {
  AthleteExerciseSymptoms,
  AthleteHealthHistory,
  AthleteIntake,
  ExerciseSymptom,
  MaritalStatus,
} from '../types/domain'

export interface AthleteIntakeForm {
  maritalStatus: MaritalStatus | null
  emergencyContact: {
    name: string
    phone: string
    relationship: string
  }
  healthHistory: {
    boneInjury: boolean | null
    cardiovascularDisease: boolean | null
    exerciseBreathingDifficulty: boolean | null
    conditions: {
      asthma: boolean | null
      epilepsy: boolean | null
      diabetes: boolean | null
      other: boolean | null
      none: boolean | null
      otherDescription: string
    }
    anemia: boolean | null
    exerciseSymptoms: ExerciseSymptom[]
    sportsActivity: { practiced: boolean | null; description: string }
    sportsFacility: { attended: boolean | null; description: string }
  }
}

export interface AthleteFormInput extends AthleteIntakeForm {
  name: string
  phone: string
  planId: string
  agreedAmount: number
  paymentDay: number
}

export type AthleteFormErrorKey =
  | 'name'
  | 'phone'
  | 'planId'
  | 'agreedAmount'
  | 'paymentDay'
  | 'maritalStatus'
  | 'emergencyContactName'
  | 'emergencyContactPhone'
  | 'emergencyContactRelationship'
  | 'boneInjury'
  | 'cardiovascularDisease'
  | 'exerciseBreathingDifficulty'
  | 'conditions'
  | 'otherCondition'
  | 'anemia'
  | 'exerciseSymptoms'
  | 'sportsActivity'
  | 'sportsActivityDescription'
  | 'sportsFacility'
  | 'sportsFacilityDescription'

export type AthleteFormErrors = Partial<Record<AthleteFormErrorKey, string>>

export interface AthleteIntakePayload {
  athleteId: string
  maritalStatus: MaritalStatus
  emergencyContact: {
    name: string
    phone: string
    relationship: string
  }
  healthHistory: AthleteHealthHistory
}

export const createEmptyAthleteIntakeForm = (): AthleteIntakeForm => ({
  maritalStatus: null,
  emergencyContact: {
    name: '',
    phone: '',
    relationship: '',
  },
  healthHistory: {
    boneInjury: null,
    cardiovascularDisease: null,
    exerciseBreathingDifficulty: null,
    conditions: {
      asthma: null,
      epilepsy: null,
      diabetes: null,
      other: null,
      none: null,
      otherDescription: '',
    },
    anemia: null,
    exerciseSymptoms: [],
    sportsActivity: { practiced: null, description: '' },
    sportsFacility: { attended: null, description: '' },
  },
})

export const normalizePhone = (value: string) => value.replace(/\D/g, '')

const isAnswered = (value: boolean | null | undefined): value is boolean => value !== null && value !== undefined

export const validateAthleteOperationalForm = (input: Pick<AthleteFormInput, 'name' | 'phone' | 'planId' | 'agreedAmount' | 'paymentDay'>): AthleteFormErrors => {
  const errors: AthleteFormErrors = {}

  if (!input.name.trim())
    errors.name = 'Escribe el nombre completo.'

  if (normalizePhone(input.phone).length !== 10)
    errors.phone = 'El teléfono debe tener 10 dígitos.'

  if (!input.planId)
    errors.planId = 'Selecciona un plan.'

  if (input.agreedAmount <= 0)
    errors.agreedAmount = 'El monto debe ser mayor que cero.'

  if (!Number.isInteger(input.paymentDay) || input.paymentDay < 1 || input.paymentDay > 31)
    errors.paymentDay = 'El día de pago debe estar entre 1 y 31.'

  return errors
}

export const validateAthleteForm = (input: AthleteFormInput): AthleteFormErrors => {
  const errors = validateAthleteOperationalForm(input)

  if (!input.maritalStatus)
    errors.maritalStatus = 'Selecciona el estado civil.'

  if (!input.emergencyContact.name.trim())
    errors.emergencyContactName = 'Escribe el nombre del contacto de emergencia.'

  if (normalizePhone(input.emergencyContact.phone).length !== 10)
    errors.emergencyContactPhone = 'El teléfono debe tener 10 dígitos.'

  if (!input.emergencyContact.relationship.trim())
    errors.emergencyContactRelationship = 'Escribe el parentesco.'

  const health = input.healthHistory

  if (!isAnswered(health.boneInjury))
    errors.boneInjury = 'Indica una respuesta.'

  if (!isAnswered(health.cardiovascularDisease))
    errors.cardiovascularDisease = 'Indica una respuesta.'

  if (!isAnswered(health.exerciseBreathingDifficulty))
    errors.exerciseBreathingDifficulty = 'Indica una respuesta.'

  if (!isAnswered(health.anemia))
    errors.anemia = 'Indica una respuesta.'

  const conditions = health.conditions
  const conditionOptions = [conditions.asthma, conditions.epilepsy, conditions.diabetes, conditions.other]
  if (!conditionOptions.some(value => value === true) && conditions.none !== true)
    errors.conditions = 'Selecciona una condición o Ninguna de las anteriores.'
  else if (conditions.none === true && conditionOptions.some(value => value === true))
    errors.conditions = 'Ninguna no puede combinarse con otras condiciones.'

  if (conditions.other === true && !conditions.otherDescription.trim())
    errors.otherCondition = 'Describe la otra condición.'

  if (health.exerciseSymptoms.length === 0)
    errors.exerciseSymptoms = 'Selecciona al menos una opción.'
  else if (health.exerciseSymptoms.includes('none') && health.exerciseSymptoms.length > 1)
    errors.exerciseSymptoms = 'Ninguna no puede combinarse con otros síntomas.'

  if (!isAnswered(health.sportsActivity.practiced))
    errors.sportsActivity = 'Indica una respuesta.'
  else if (health.sportsActivity.practiced && !health.sportsActivity.description.trim())
    errors.sportsActivityDescription = 'Indica qué actividad practicaste.'

  if (!isAnswered(health.sportsFacility.attended))
    errors.sportsFacility = 'Indica una respuesta.'
  else if (health.sportsFacility.attended && !health.sportsFacility.description.trim())
    errors.sportsFacilityDescription = 'Indica el gimnasio o instalación.'

  return errors
}

export const toAthleteIntake = (athleteId: string, form: AthleteIntakeForm): AthleteIntakePayload => {
  const selectedSymptoms = new Set(form.healthHistory.exerciseSymptoms)
  const conditions = form.healthHistory.conditions

  return {
    athleteId,
    maritalStatus: form.maritalStatus as MaritalStatus,
    emergencyContact: {
      name: form.emergencyContact.name.trim(),
      phone: normalizePhone(form.emergencyContact.phone),
      relationship: form.emergencyContact.relationship.trim(),
    },
    healthHistory: {
      boneInjury: Boolean(form.healthHistory.boneInjury),
      cardiovascularDisease: Boolean(form.healthHistory.cardiovascularDisease),
      exerciseBreathingDifficulty: Boolean(form.healthHistory.exerciseBreathingDifficulty),
      conditions: {
        asthma: conditions.asthma === true,
        epilepsy: conditions.epilepsy === true,
        diabetes: conditions.diabetes === true,
        other: conditions.other === true,
        none: conditions.none === true,
        otherDescription: conditions.other === true ? conditions.otherDescription.trim() || null : null,
      },
      anemia: Boolean(form.healthHistory.anemia),
      exerciseSymptoms: {
        dizziness: selectedSymptoms.has('dizziness'),
        fainting: selectedSymptoms.has('fainting'),
        nausea: selectedSymptoms.has('nausea'),
        shortnessOfBreath: selectedSymptoms.has('shortness-of-breath'),
        none: selectedSymptoms.has('none'),
      },
      sportsActivity: {
        practiced: form.healthHistory.sportsActivity.practiced === true,
        description: form.healthHistory.sportsActivity.practiced === true
          ? form.healthHistory.sportsActivity.description.trim() || null
          : null,
      },
      sportsFacility: {
        attended: form.healthHistory.sportsFacility.attended === true,
        description: form.healthHistory.sportsFacility.attended === true
          ? form.healthHistory.sportsFacility.description.trim() || null
          : null,
      },
    },
  }
}

export const intakeToForm = (intake?: AthleteIntake | null): AthleteIntakeForm => {
  const empty = createEmptyAthleteIntakeForm()
  if (!intake)
    return empty

  const healthHistory = intake.healthHistory
  const symptoms = healthHistory?.exerciseSymptoms as Partial<AthleteExerciseSymptoms> | undefined
  const conditions = healthHistory?.conditions

  return {
    maritalStatus: intake.maritalStatus ?? null,
    emergencyContact: {
      name: intake.emergencyContact?.name ?? '',
      phone: intake.emergencyContact?.phone ?? '',
      relationship: intake.emergencyContact?.relationship ?? '',
    },
    healthHistory: {
      boneInjury: healthHistory?.boneInjury ?? null,
      cardiovascularDisease: healthHistory?.cardiovascularDisease ?? null,
      exerciseBreathingDifficulty: healthHistory?.exerciseBreathingDifficulty ?? null,
      conditions: {
        asthma: conditions?.asthma ?? null,
        epilepsy: conditions?.epilepsy ?? null,
        diabetes: conditions?.diabetes ?? null,
        other: conditions?.other ?? null,
        none: conditions?.none ?? null,
        otherDescription: conditions?.otherDescription ?? '',
      },
      anemia: healthHistory?.anemia ?? null,
      exerciseSymptoms: [
        symptoms?.dizziness ? 'dizziness' : null,
        symptoms?.fainting ? 'fainting' : null,
        symptoms?.nausea ? 'nausea' : null,
        symptoms?.shortnessOfBreath ? 'shortness-of-breath' : null,
        symptoms?.none ? 'none' : null,
      ].filter((value): value is ExerciseSymptom => value !== null),
      sportsActivity: {
        practiced: healthHistory?.sportsActivity?.practiced ?? null,
        description: healthHistory?.sportsActivity?.description ?? '',
      },
      sportsFacility: {
        attended: healthHistory?.sportsFacility?.attended ?? null,
        description: healthHistory?.sportsFacility?.description ?? '',
      },
    },
  }
}
