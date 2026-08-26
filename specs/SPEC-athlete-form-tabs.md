# Spec: Formulario de atleta por pestañas

Estado: aprobada para implementación incremental el 2026-08-26.
Módulo: `athletes-payments`.
Capability map: `specs/CAPABILITY-MAP.md`.
Especificación relacionada: `specs/SPEC-athletes-payments.md`.
QA transversal: `specs/SPEC-quality-gates.md`.

## Objective

Reducir la altura y la carga cognitiva del diálogo de alta/edición de atletas separando la información en pestañas claras, sin perder datos, permisos, validaciones ni el contrato sensible de admisión.

## User Stories

- Como recepción o Admin, quiero capturar un atleta por secciones para orientarme sin desplazar un formulario excesivamente largo.
- Como usuario que corrige errores, quiero identificar en qué pestaña están y llegar al campo inválido sin buscar manualmente.
- Como usuario en pantalla pequeña, quiero cambiar de sección sin overflow horizontal ni pérdida de contexto.
- Como usuario con permisos parciales, quiero que la pestaña de admisión respete lectura, edición, carga y error exactamente como hoy.

## Alcance

### Incluye

- Reorganizar el diálogo existente en tres pestañas:
  1. `Datos personales`: nombre, teléfono, fecha de nacimiento y horario base.
  2. `Membresía`: fecha de registro, plan, monto y día de pago.
  3. `Admisión`: estado civil, contacto de emergencia y datos de salud.
- Mantener el mismo modelo, servicios, permisos y persistencia existentes.
- Mantener validación por campo y agregar un indicador accesible de errores por pestaña después de intentar guardar.
- Llevar al usuario a la primera pestaña con errores y permitir navegar por teclado a los campos inválidos.
- Mantener acciones `Cancelar` y `Guardar`, estados de carga, error de admisión y bloqueo durante la carga.

### No incluye

- Cambios de Firebase, reglas, autenticación, permisos o modelo de datos.
- Cambios al código de kiosco, ficha de inscripción, pagos o WhatsApp.
- Rediseño general de la página, tabla de atletas o navegación de la aplicación.
- Validación completa de módulos no relacionados.

## Interaction Contract

- Abrir el diálogo inicia siempre en `Datos personales` y no muestra errores antes de un intento de guardado.
- Cambiar de pestaña conserva todos los valores capturados, incluidos campos condicionales de admisión.
- Si el guardado falla por validación, el diálogo permanece abierto, se selecciona la primera pestaña con error y el indicador de la pestaña comunica que requiere atención sin depender sólo del color.
- Si el guardado falla por persistencia, la pestaña actual y los valores se conservan para reintentar.
- Si la admisión está cargando o falla, el estado visible y el bloqueo actual se conservan; no se permite guardar datos incompletos.
- Las pestañas deben tener nombres visibles y accesibles; el panel activo debe estar asociado al tab seleccionado.
- En edición, los usuarios sin `athletesIntakeManage` pueden consultar la admisión si tienen permiso de lectura, pero no modificarla.

## Commands

Run from `app/`:

```sh
npm run typecheck
npm run build
npm run test:athlete-intake
npx playwright test --project=responsive --grep "formulario de atleta"
```

The Playwright command is available after `specs/SPEC-quality-gates.md` is authorized and the dependency/configuration slice is implemented.

## Project Structure

```text
app/src/pages/atletas.vue                         → diálogo, estado de pestaña y navegación de errores
app/src/components/kronos/AthleteIntakeFields.vue → contenido de admisión sin cambio de contrato
app/src/utils/athlete-intake.ts                   → validación y agrupación de errores por pestaña si es necesario
app/tests/                                        → pruebas de contrato y comportamiento
app/e2e/responsive/                               → smoke responsive del flujo definido
specs/SPEC-athletes-payments.md                   → contrato de datos y permisos existente
specs/SPEC-quality-gates.md                       → gate de Chrome y complemento Playwright
```

## UX and Accessibility Requirements

- La altura visual del diálogo debe disminuir de forma clara al mostrar una sección a la vez.
- El diálogo debe funcionar a `320`, `768`, `1024` y `1440` px sin scroll horizontal.
- Los tabs y controles deben ser navegables con teclado y mantener foco visible.
- Los indicadores de error deben incluir texto, icono o conteo accesible; no depender únicamente de color.
- Las etiquetas de los tabs deben comunicar la sección y, cuando aplique, que requiere atención.
- No ocultar información crítica en tooltips; el contenido requerido debe permanecer disponible en el panel.
- Las acciones de guardado y cancelación deben seguir siendo alcanzables en móvil y escritorio.

## Testing Strategy

### Unit/integration

- Verificar que la navegación no modifica el objeto de formulario ni el payload.
- Verificar que los errores se agrupan por pestaña y que se selecciona la primera pestaña inválida.
- Verificar que los estados de permisos, carga y error de admisión conservan el comportamiento existente.

### Chrome QA obligatorio

Recorrer el flujo completo de alta y edición: abrir desde `Atletas`, cambiar entre las tres pestañas, intentar guardar incompleto, corregir errores desde la pestaña indicada, completar un registro demo autorizado, guardar, comprobar la confirmación y abrir/editar el registro para verificar persistencia. El registro demo se elimina al terminar si se escribió en un entorno compartido.

Revisar consola, red, árbol de accesibilidad y capturas en los viewports definidos por `SPEC-quality-gates.md`, sin inspeccionar credenciales ni material de autenticación.

### Playwright complementario

- Ejecutar smoke responsive local/QA a los cuatro viewports.
- Confirmar que el diálogo no desborda horizontalmente, que los tabs se renderizan y que los botones principales son visibles/alcanzables.
- Añadir regresión visual sólo para estados definidos: diálogo inicial, panel de admisión y estado de validación.
- No declarar la fase completa sólo con Playwright.

## Success Criteria

- [ ] El diálogo presenta las tres pestañas con el contenido correcto.
- [ ] Navegar entre pestañas no pierde ni altera datos.
- [ ] Los errores se muestran después de guardar, marcan la pestaña correspondiente y llevan al primer error.
- [ ] Alta y edición mantienen persistencia, permisos y estados de admisión existentes.
- [ ] No hay overflow horizontal a 320 px y el flujo es utilizable en los cuatro viewports.
- [ ] Las pruebas unitarias/integración, typecheck y build pasan.
- [ ] Playwright complementario pasa en el entorno seguro definido.
- [ ] Chrome valida el flujo completo afectado, con consola limpia y evidencia visual/accesible.
- [ ] El reporte final lista árbol, flujos afectados/no afectados, diagrama, evidencia y riesgos.

## Boundaries

### Always

- Mantener Vue 3, TypeScript, Vuetify, Pinia y Firebase.
- Preservar el contrato de admisión sensible y los permisos actuales.
- Usar `frontend-ui-engineering` para diseño/accesibilidad y `browser-testing-with-devtools` para el gate Chrome.
- Actualizar la spec si el diseño de tabs o el flujo de errores cambia durante la implementación.

### Ask first

- Añadir dependencias o cambiar la configuración de Playwright.
- Cambiar reglas, esquema, autenticación o permisos.
- Modificar el orden o significado de campos del formulario.

### Never

- Cambiar el modelo Firebase como parte de esta fase.
- Mezclar código de kiosco, pagos, WhatsApp o ficha de inscripción.
- Declarar éxito validando solamente el componente de tabs.

## Open Questions

- Resuelto: se implementarán exactamente tres tabs con los nombres propuestos.
- Resuelto: el indicador mostrará un conteo visible y un nombre accesible que indique la cantidad de errores.
- Resuelto: se autoriza añadir `@playwright/test` y descargar Chromium para QA local.
