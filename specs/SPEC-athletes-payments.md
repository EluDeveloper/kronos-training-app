# Spec: Alta y edición de atletas

Estado: borrador para revisión humana.
Módulo: `athletes-payments`.
Capability map: `specs/CAPABILITY-MAP.md`.

## Objective

Mejorar el flujo de alta y edición de atletas para que recepción o un Admin pueda capturar datos correctos, entienda los errores antes de guardar y reciba una confirmación clara después de la persistencia.

El piloto conserva Vue 3, TypeScript, Vuetify, Pinia y Firebase Realtime Database. No cambia el modelo de datos ni incluye pagos, códigos de kiosco o migraciones.

## User Stories

- Como usuario autorizado para administrar atletas, quiero abrir un formulario claro para registrar un atleta sin memorizar reglas de validación.
- Como usuario autorizado, quiero editar los datos de un atleta sin perder su estado ni su información no relacionada.
- Como usuario, quiero saber si los atletas están cargando, si ocurrió un error o si no existen resultados.
- Como usuario de teclado o pantalla pequeña, quiero completar y revisar el formulario sin perder contexto.

## Current Context

- Página principal: `app/src/pages/atletas.vue`.
- Store: `app/src/stores/athletes.ts`.
- Servicio: `app/src/services/athletes.service.ts`.
- Tipos: `app/src/types/domain.ts`.
- Planes se cargan desde `usePlansStore` y sólo los activos se ofrecen en alta.
- Actualmente `save()` concentra la validación en un mensaje genérico y no expone errores por campo.

## Commands

Run from `app/`:

```sh
npm run typecheck
npm run build
npm run test:finance
npm run test:rules
```

The current baseline has two known environment failures documented in `tasks/plan.md`: Vite cannot write `.vite-temp` under the existing `node_modules`, and the finance test can fail with `uv_os_get_passwd returned ENOMEM`. Do not hide or reclassify those failures as pilot results.

## Project Structure

```text
app/src/pages/atletas.vue              → page, list and dialogs
app/src/stores/athletes.ts             → reactive collection state
app/src/services/athletes.service.ts   → Firebase boundary
app/src/types/domain.ts                → Athlete and Membership contracts
app/tests/                              → repository tests
specs/SPEC-athletes-payments.md        → approved behavior contract
Docs/implementation-reports/           → delivery impact reports
```

## Code Style

Keep the Firebase boundary in the service and keep UI state in the page/store. Prefer explicit validation results over a single boolean:

```ts
type AthleteFormErrors = Partial<Record<
  'name' | 'phone' | 'planId' | 'agreedAmount' | 'paymentDay',
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

## Functional Requirements

### Create

- The authorized user can open `Nuevo atleta`.
- Required fields are name, phone, plan, agreed amount and payment day.
- Phone input is normalized to digits before persistence and must contain exactly 10 digits.
- Agreed amount must be greater than zero.
- Payment day must be an integer from 1 through 31.
- The selected plan is limited to active plans.
- Registration date defaults to the current local date and remains editable.
- Birth date and schedule remain optional/editable according to the existing domain contract.
- The save action shows a busy state and cannot submit the same form repeatedly.
- On success, the dialog closes and the user receives a success notification.

### Edit

- Opening an existing athlete pre-fills the current values.
- Saving updates only profile and membership fields represented by this form.
- Existing `status`, kiosk code, audit fields and unrelated properties are preserved.
- On failure, the dialog remains open and the user can correct or retry.

### List and states

- Loading, error and empty states are distinguishable from a valid list with zero filtered results.
- Search, plan filter, status filter and pagination continue to work.
- When filters produce no results, the message explains that the search or filters can be changed.
- The action buttons retain accessible names and a visible focus state.

## Accessibility and Responsive Requirements

- Every form control has a visible label and an associated field-level error when invalid.
- Keyboard focus order follows the visual order: name, phone, birth date, schedule, registration date, plan, amount, payment day, cancel, save.
- The dialog can be completed at 320 px wide without horizontal scrolling.
- The page and table remain usable at 320, 768, 1024 and 1440 px.
- Validation and save results are announced through the existing notification mechanism or an appropriate live region.
- No status is communicated by color alone.

## Testing Strategy

- Unit or focused behavior tests must cover empty name, invalid phone, invalid amount, invalid payment day and a valid normalized payload.
- Integration behavior must verify create and update payload boundaries without using production data.
- Chrome QA must cover opening, validation, successful create/edit, failed save, filter reset and responsive layouts.
- Chrome QA must inspect console, network, DOM/accessibility tree and before/after screenshots.
- For protected routes, the agent must pause before login and wait for the user's manual authorization as defined in `AGENTS.md`.

## Boundaries

### Always

- Use `app/` as the working directory.
- Preserve the existing Firebase data shape.
- Keep form validation deterministic and testable.
- Report all modified files and affected flows.

### Ask first

- Adding a new testing framework or dependency.
- Changing Firebase rules, indexes, authentication or permissions.
- Adding phone uniqueness or duplicate-detection business rules.
- Changing the meaning or allowed range of existing data fields.

### Never

- Write real production records during tests.
- Read or expose credentials, cookies, tokens or local authentication storage.
- Change kiosk-code behavior as part of this pilot.
- Replace the page with a broad UI rewrite.

## Success Criteria

- [ ] The form exposes actionable field-level validation.
- [ ] Valid create and edit flows persist the expected data.
- [ ] Failed persistence keeps the form open and displays a useful message.
- [ ] Loading, error and empty states are distinguishable.
- [ ] Typecheck and relevant tests pass, with baseline failures documented separately.
- [ ] Chrome QA passes at all required viewport sizes with no new console errors or warnings.
- [ ] The implementation report identifies files, affected flows, non-affected flows and evidence.

## Open Questions

- Should duplicate phone numbers be rejected, warned about or allowed for family accounts?
- Which authorized test account and dataset should be used for Chrome QA?
- Should the first implementation use a new validation utility or keep validation local to the page?
