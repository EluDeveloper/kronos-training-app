# Spec: Alta y edición de atletas

Estado: aprobada para implementación incremental.
Módulo: `athletes-payments`.
Capability map: `specs/CAPABILITY-MAP.md`.

## Objective

Mejorar el flujo de alta y edición de atletas para que recepción o un Admin pueda capturar datos personales, contacto de emergencia y antecedentes de salud de forma clara, deliberada y validable, entienda los errores antes de guardar y reciba una confirmación clara después de la persistencia.

El piloto conserva Vue 3, TypeScript, Vuetify, Pinia y Firebase Realtime Database. Amplía el modelo de atleta de forma compatible con registros existentes. No incluye pagos, códigos de kiosco ni migraciones masivas.

## User Stories

- Como usuario autorizado para administrar atletas, quiero abrir un formulario claro para registrar un atleta sin memorizar reglas de validación.
- Como usuario autorizado, quiero editar los datos de un atleta sin perder su estado ni su información no relacionada.
- Como usuario autorizado, quiero registrar un contacto de emergencia y antecedentes de salud para contar con información de seguridad durante la actividad física.
- Como usuario, quiero saber si los atletas están cargando, si ocurrió un error o si no existen resultados.
- Como usuario de teclado o pantalla pequeña, quiero completar y revisar el formulario sin perder contexto.

## Current Context

- Página principal: `app/src/pages/atletas.vue`.
- Store: `app/src/stores/athletes.ts`.
- Servicio: `app/src/services/athletes.service.ts`.
- Tipos: `app/src/types/domain.ts`.
- Planes se cargan desde `usePlansStore` y sólo los activos se ofrecen en alta.
- Actualmente `save()` concentra la validación en un mensaje genérico y no expone errores por campo.
- La lista de atletas muestra datos operativos; los antecedentes de salud no deben aparecer en la tabla, búsquedas, notificaciones ni tarjetas resumidas.
- Los datos de admisión sensibles viven en `v1/athleteIntake/{athleteId}`, separados de `v1/athletes`, para que la lectura general de atletas no exponga información de salud.
- La lectura de admisión requiere `athletesIntake`; su escritura requiere `athletesIntakeManage`. Admin conserva el bypass existente. Estas acciones no se conceden por defecto a recepción.
- Los registros existentes pueden no tener los nuevos campos; la lectura debe tolerar esos datos ausentes.

## Commands

Run from `app/`:

```sh
npm run typecheck
npm run build
npm run test:athlete-intake
npm run test:finance
npm run test:rules
```

The current baseline has two known environment failures documented in `tasks/plan.md`: Vite cannot write `.vite-temp` under the existing `node_modules`, and the finance test can fail with `uv_os_get_passwd returned ENOMEM`. Do not hide or reclassify those failures as pilot results.

## Project Structure

```text
app/src/pages/atletas.vue              → page, list and dialogs
app/src/components/kronos/AthleteIntakeFields.vue → sección accesible de admisión
app/src/stores/athletes.ts             → reactive collection state
app/src/stores/athlete-intake.ts       → admisión del atleta seleccionado
app/src/services/athletes.service.ts   → Firebase boundary
app/src/services/athlete-intake.service.ts → Firebase boundary sensible
app/src/types/domain.ts                → Athlete and Membership contracts
app/src/utils/athlete-intake.ts        → contrato, normalización y validación
app/tests/                              → repository tests
specs/SPEC-athletes-payments.md        → approved behavior contract
Docs/implementation-reports/           → delivery impact reports
```

## Code Style

Keep the Firebase boundary in the service and keep UI state in the page/store. Prefer explicit validation results over a single boolean:

```ts
type AthleteFormErrors = Partial<Record<
  'name' | 'phone' | 'maritalStatus' | 'emergencyContactName' |
  'emergencyContactPhone' | 'emergencyContactRelationship' | 'boneInjury' |
  'cardiovascularDisease' | 'exerciseBreathingDifficulty' | 'anemia' |
  'exerciseSymptoms' | 'sportActivity' | 'sportFacility',
  string
>>

function validateAthleteForm(input: AthleteFormInput): AthleteFormErrors {
  const errors: AthleteFormErrors = {}

  if (!input.name.trim())
    errors.name = 'Escribe el nombre completo.'

  return errors
}
```

Use Vuetify's field-level `error-messages` and visible labels. Do not rely on color alone to communicate invalid or active state. Preserve the existing Kronos visual tokens and avoid unrelated template refactors.

## Extended Data Model

The following shape is the proposed boundary for new records. Field names remain in English to match the existing domain model; labels remain in Spanish:

```ts
type MaritalStatus = 'single' | 'married' | 'domestic-partnership' | 'divorced' | 'widowed' | 'separated' | 'prefer-not-to-say'

interface EmergencyContact {
  name: string
  phone: string
  relationship: string
}

interface AthleteHealthHistory {
  boneInjury: boolean
  cardiovascularDisease: boolean
  exerciseBreathingDifficulty: boolean
  conditions: {
    asthma: boolean
    epilepsy: boolean
    diabetes: boolean
    other: boolean
    otherDescription?: string | null
  }
  anemia: boolean
  exerciseSymptoms: {
    dizziness: boolean
    fainting: boolean
    nausea: boolean
    shortnessOfBreath: boolean
    none: boolean
  }
  sportsActivity: { practiced: boolean; description?: string | null }
  sportsFacility: { attended: boolean; description?: string | null }
}

interface AthleteIntake {
  athleteId: string
  maritalStatus: MaritalStatus
  emergencyContact: EmergencyContact
  healthHistory: AthleteHealthHistory
  createdAt: string | number
  updatedAt: string | number
}
```

`AthleteIntake` is optional on legacy `Athlete` reads because existing records may not have a companion intake record. New athlete creation requires a deliberate value for each question and all emergency-contact fields. Editing a legacy record should show missing values as `Sin capturar` and require completion before saving when the user has `athletesIntakeManage`.

The duplicated bone-injury question from the request is intentionally represented once as `healthHistory.boneInjury`.

The UI adds an explicit `Ninguna de las anteriores` choice for the condition and symptom checkbox groups so an unanswered group cannot be mistaken for a negative answer. In the persisted map, `none` is mutually exclusive with the other options.

## Functional Requirements

### Create

- The authorized user with `athletesManage` can maintain operational fields. Creating a new athlete also requires `athletesIntakeManage`, because the new record must include its admission questionnaire.
- Required fields are name, phone, plan, agreed amount and payment day.
- Phone input is normalized to digits before persistence and must contain exactly 10 digits.
- Agreed amount must be greater than zero.
- Payment day must be an integer from 1 through 31.
- The selected plan is limited to active plans.
- Registration date defaults to the current local date and remains editable.
- Birth date and schedule remain optional/editable according to the existing domain contract.
- The form includes a required `Estado civil` select.
- The form includes a required emergency contact section with name, phone and relationship.
- The form includes one required yes/no question for bone injury: `¿Ha tenido o tiene alguna lesión ósea?`.
- The form includes required yes/no questions for cardiovascular disease, becoming short of breath easily during exercise and current anemia.
- The form includes checkboxes for asthma, epilepsy, diabetes and another condition. If `Otra` is selected, its description is required.
- The form includes exercise symptoms checkboxes: dizziness, fainting, nausea, shortness of breath and none. `Ninguna` is mutually exclusive with the other symptoms.
- The form includes sports activity and sports-facility yes/no questions. If the answer is yes, the corresponding activity or facility name is required.
- Health answers must not default to `No` or `Ninguna`; the user must make an explicit selection.
- A user with `athletesManage` but without `athletesIntakeManage` can edit operational fields of an existing athlete, but cannot read or overwrite its sensitive intake record.
- The save action shows a busy state and cannot submit the same form repeatedly.
- On success, the dialog closes and the user receives a success notification.

### Edit

- Opening an existing athlete pre-fills the current values.
- Saving updates only profile and membership fields represented by this form.
- Existing `status`, kiosk code, audit fields and unrelated properties are preserved.
- Existing health and emergency-contact values are preserved when editing fields unrelated to them.
- On failure, the dialog remains open and the user can correct or retry.

### List and states

- Loading, error and empty states are distinguishable from a valid list with zero filtered results.
- Search, plan filter, status filter and pagination continue to work.
- When filters produce no results, the message explains that the search or filters can be changed.
- The action buttons retain accessible names and a visible focus state.
- Health questions are grouped under clear headings and use fieldset-like accessible group labels.
- Conditional follow-up fields are announced and associated with the triggering answer.

## Accessibility and Responsive Requirements

- Every form control has a visible label and an associated field-level error when invalid.
- Keyboard focus order follows the visual order: name, phone, birth date, schedule, registration date, plan, amount, payment day, cancel, save.
- The dialog can be completed at 320 px wide without horizontal scrolling.
- The page and table remain usable at 320, 768, 1024 and 1440 px.
- Validation and save results are announced through the existing notification mechanism or an appropriate live region.
- No status is communicated by color alone.
- Sensitive health values are not rendered in the athlete table, search text, pagination summary or notification messages.

## Testing Strategy

- Unit or focused behavior tests must cover empty name, invalid phone, invalid amount, invalid payment day and a valid normalized payload.
- Focused behavior tests must cover missing emergency contact data, explicit health answers, mutually exclusive `none` symptoms and conditional descriptions.
- Integration behavior must verify create and update payload boundaries without using production data.
- Security tests or rule review must verify that health fields are readable only through `athletesIntake`, writable only through `athletesIntakeManage`, linked to an existing athlete and not exposed through unrelated summaries.
- Chrome QA must cover opening, validation, successful create/edit, failed save, filter reset and responsive layouts.
- Chrome QA must inspect console, network, DOM/accessibility tree and before/after screenshots.
- For protected routes, the agent must pause before login and wait for the user's manual authorization as defined in `AGENTS.md`.

## Boundaries

### Always

- Use `app/` as the working directory.
- Preserve the existing Firebase data shape.
- Extend the athlete shape backward-compatibly and keep sensitive fields out of summary projections.
- Keep form validation deterministic and testable.
- Report all modified files and affected flows.

### Ask first

- Adding a new testing framework or dependency.
- Changing Firebase rules, indexes, authentication or permissions.
- Defining a retention period, consent record or export/delete workflow for health information.
- Adding phone uniqueness or duplicate-detection business rules.
- Changing the meaning or allowed range of existing data fields.

### Never

- Write real production records during tests.
- Read or expose credentials, cookies, tokens or local authentication storage.
- Change kiosk-code behavior as part of this pilot.
- Render health information in list views, dashboard metrics, WhatsApp messages or receipts.
- Replace the page with a broad UI rewrite.

## Success Criteria

- [ ] The form exposes actionable field-level validation.
- [ ] Estado civil, emergency contact and all unique health questions are captured and persisted.
- [ ] Conditional fields are required only when their parent answer is affirmative.
- [ ] Existing records without the new fields remain readable and are completed safely on edit.
- [ ] Valid create and edit flows persist the expected data.
- [ ] Failed persistence keeps the form open and displays a useful message.
- [ ] Loading, error and empty states are distinguishable.
- [ ] Typecheck and relevant tests pass, with baseline failures documented separately.
- [ ] Chrome QA passes at all required viewport sizes with no new console errors or warnings.
- [ ] The implementation report identifies files, affected flows, non-affected flows and evidence.

## Open Questions

- Should duplicate phone numbers be rejected, warned about or allowed for family accounts?
- Which authorized test account and dataset should be used for Chrome QA?
- La validación se concentra en `app/src/utils/athlete-intake.ts` para compartir contrato entre la página y las pruebas.
- What retention, consent and export/delete policy applies to the health questionnaire?
