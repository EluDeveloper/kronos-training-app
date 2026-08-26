import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createEmptyAthleteIntakeForm,
  toAthleteIntake,
  validateAthleteForm,
  type AthleteFormInput,
} from '../src/utils/athlete-intake'

const validForm = (): AthleteFormInput => ({
  name: 'Atleta de prueba',
  phone: '(55) 1234-5678',
  planId: 'plan-1',
  agreedAmount: 500,
  paymentDay: 15,
  ...createEmptyAthleteIntakeForm(),
  maritalStatus: 'single',
  emergencyContact: {
    name: 'Contacto de prueba',
    phone: '55 8765 4321',
    relationship: 'Hermana',
  },
  healthHistory: {
    boneInjury: false,
    cardiovascularDisease: false,
    exerciseBreathingDifficulty: false,
    conditions: {
      asthma: false,
      epilepsy: false,
      diabetes: false,
      other: false,
      none: true,
      otherDescription: '',
    },
    anemia: false,
    exerciseSymptoms: ['none'],
    sportsActivity: { practiced: true, description: 'Natación' },
    sportsFacility: { attended: false, description: '' },
  },
})

test('rechaza datos operativos y de admisión incompletos con errores por campo', () => {
  const errors = validateAthleteForm({
    ...createEmptyAthleteIntakeForm(),
    name: '',
    phone: '123',
    planId: '',
    agreedAmount: 0,
    paymentDay: 32,
  })

  assert.equal(errors.name, 'Escribe el nombre completo.')
  assert.equal(errors.phone, 'El teléfono debe tener 10 dígitos.')
  assert.equal(errors.planId, 'Selecciona un plan.')
  assert.equal(errors.agreedAmount, 'El monto debe ser mayor que cero.')
  assert.equal(errors.paymentDay, 'El día de pago debe estar entre 1 y 31.')
  assert.equal(errors.maritalStatus, 'Selecciona el estado civil.')
  assert.equal(errors.emergencyContactName, 'Escribe el nombre del contacto de emergencia.')
  assert.equal(errors.emergencyContactPhone, 'El teléfono debe tener 10 dígitos.')
  assert.equal(errors.emergencyContactRelationship, 'Escribe el parentesco.')
  assert.equal(errors.boneInjury, 'Indica una respuesta.')
  assert.equal(errors.exerciseSymptoms, 'Selecciona al menos una opción.')
})

test('requiere descripción cuando se elige otra condición o una actividad', () => {
  const form = validForm()
  form.healthHistory.conditions.other = true
  form.healthHistory.conditions.none = false
  form.healthHistory.conditions.otherDescription = ''
  form.healthHistory.sportsActivity.description = ''

  const errors = validateAthleteForm(form)

  assert.equal(errors.otherCondition, 'Describe la otra condición.')
  assert.equal(errors.sportsActivityDescription, 'Indica qué actividad practicaste.')
})

test('exige una selección explícita y hace mutuamente excluyente Ninguna', () => {
  const form = validForm()
  form.healthHistory.exerciseSymptoms = ['dizziness', 'none']

  assert.equal(validateAthleteForm(form).exerciseSymptoms, 'Ninguna no puede combinarse con otros síntomas.')

  form.healthHistory.exerciseSymptoms = []
  assert.equal(validateAthleteForm(form).exerciseSymptoms, 'Selecciona al menos una opción.')
})

test('valida y normaliza el payload de admisión', () => {
  const form = validForm()

  assert.deepEqual(validateAthleteForm(form), {})
  assert.deepEqual(toAthleteIntake('athlete-1', form), {
    athleteId: 'athlete-1',
    maritalStatus: 'single',
    emergencyContact: {
      name: 'Contacto de prueba',
      phone: '5587654321',
      relationship: 'Hermana',
    },
    healthHistory: {
      boneInjury: false,
      cardiovascularDisease: false,
      exerciseBreathingDifficulty: false,
      conditions: {
        asthma: false,
        epilepsy: false,
        diabetes: false,
        other: false,
        none: true,
        otherDescription: null,
      },
      anemia: false,
      exerciseSymptoms: {
        dizziness: false,
        fainting: false,
        nausea: false,
        shortnessOfBreath: false,
        none: true,
      },
      sportsActivity: { practiced: true, description: 'Natación' },
      sportsFacility: { attended: false, description: null },
    },
  })
})
