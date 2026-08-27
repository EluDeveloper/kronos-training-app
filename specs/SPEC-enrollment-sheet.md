# Spec: Fase C — Ficha de inscripción

Estado: implementada y verificada en Firebase Hosting el 2026-08-26.
Módulo: `athletes-payments`.
Capability map: `specs/CAPABILITY-MAP.md`.
QA transversal: `specs/SPEC-quality-gates.md`.
Especificaciones relacionadas: `specs/SPEC-athletes-payments.md`, `specs/SPEC-athlete-form-tabs.md`.

Esta spec define únicamente la primera rebanada de Fase C. La evaluación o integración de WhatsApp Business Cloud API queda fuera de esta autorización y requerirá una spec posterior.

## Supuestos y decisiones propuestas

1. La ficha se genera desde un atleta existente en `Atletas`; no se genera desde un formulario de alta incompleto.
2. La fecha de pago es una regla recurrente basada en `athlete.membership.paymentDay`: la ficha comunicará, por ejemplo, `Tu fecha de pago será el 26 de cada mes.` No se listará el historial de pagos.
3. La ficha incluirá el contacto de emergencia para validar la captura, pero no incluirá salud, antecedentes médicos ni el teléfono personal del atleta. El teléfono personal sólo se usa, de forma separada, para prellenar el destinatario de WhatsApp Web.
4. La acción será de lectura y requerirá acceso al módulo `athletes` y a la acción existente `athletesIntake` o `athletesIntakeManage`; no requerirá `athletesManage`, `paymentsManage` ni un permiso nuevo.
5. Se reutilizarán la identidad visual y las primitivas de generación de los recibos actuales —logo, encabezado oscuro, acento naranja, formato A5, tipografía y paginación— sin alterar el contrato visible de los recibos existentes.
6. La primera rebanada descargará el PDF y abrirá WhatsApp Web para que el usuario lo adjunte y envíe manualmente. No habrá carga automática del archivo ni envío automático.

## Objective

Permitir que recepción o un Admin autorizado abra una ficha de inscripción de un atleta, revise la información antes de compartirla, descargue o imprima un PDF con el lenguaje visual de los recibos Kronos y, si lo decide, abra un mensaje manual en WhatsApp Web.

El documento debe comunicar claramente los datos de inscripción, la fecha recurrente de pago y el contacto de emergencia para validación, tolerar registros legacy incompletos y evitar cualquier exposición de salud u otros datos de admisión.

## User Stories

- Como usuario autorizado de Atletas, quiero generar la ficha de un atleta desde su fila para no capturar datos nuevamente.
- Como recepción o Admin, quiero revisar la ficha antes de descargarla o compartirla para detectar datos ausentes o incorrectos.
- Como usuario, quiero ver claramente cuándo debe pagar el atleta cada mes, sin confundir la fecha recurrente con un historial de pagos.
- Como usuario de pantalla pequeña, quiero consultar la ficha y alcanzar sus acciones sin overflow horizontal.
- Como administrador, quiero revisar el nombre, teléfono y parentesco del contacto de emergencia para detectar errores de captura antes de compartir la ficha.
- Como responsable de privacidad, quiero que la ficha excluya antecedentes de salud y el teléfono personal del atleta.

## Alcance

### Primera rebanada incluida

- Añadir una acción accesible `Ficha de inscripción` en la fila de un atleta dentro de `Atletas`.
- Mostrar la acción sólo cuando la sesión tenga acceso al módulo `athletes` y a `athletesIntake` o `athletesIntakeManage`. Admin conserva el bypass actual. No se modifica el catálogo de permisos ni las reglas de Firebase.
- Construir una representación pura y testeable de la ficha a partir de un `Athlete`, su `paymentDay` y una proyección explícita de su contacto de emergencia.
- Mostrar una vista previa modal antes de ejecutar impresión, descarga o apertura de WhatsApp Web.
- Generar un PDF A5 vertical con el diseño visual de recibos Kronos.
- Permitir imprimir, descargar el PDF y abrir WhatsApp Web con un mensaje neutral para adjuntar el PDF manualmente.
- Conservar el comportamiento existente de recibos de mensualidades, tienda, visitas y avisos de cobranza.

### No incluye

- Datos de `athleteIntake` salvo el contacto de emergencia: estado civil, salud, lesiones, síntomas, condiciones, actividad deportiva o instalaciones.
- Historial de `Payment`, abonos aplicados, periodos pagados, saldos, importes o métodos de pago.
- Cambios de Firebase, reglas, índices, autenticación, permisos o modelo persistido.
- Guardar la ficha en Firebase, Storage o una colección de documentos.
- Modificar pagos, aplicar abonos, recalcular saldos o alterar el historial.
- Envío automático, adjunto automático, plantillas, consentimiento, auditoría de entregas o integración con WhatsApp Business Cloud API.
- Rediseño general de `Atletas`, `Pagos`, el diálogo de recibos o la navegación.
- Ficha pública o formulario de inscripción para personas que todavía no son atletas.

## Contract and data rules

La capa de construcción debe recibir únicamente una proyección explícita del contacto de emergencia, no el objeto completo `AthleteIntake`. Así, el renderer no puede incluir accidentalmente salud, antecedentes médicos ni otros datos de admisión. El teléfono personal del atleta queda fuera de `EnrollmentSheetData`.

```ts
export interface EnrollmentEmergencyContact {
  name: string | null
  phone: string | null
  relationship: string | null
}

export interface EnrollmentSheetData {
  kind: 'enrollment'
  folio: string
  issuedAt: ISOTimestamp
  athleteName: string
  birthDate: ISODate | null
  registrationDate: ISODate | null
  paymentDay: number | null
  emergencyContact: EnrollmentEmergencyContact | null
}

function buildEnrollmentSheet(
  athlete: Athlete,
  emergencyContact: EmergencyContact | null,
  issuedAt = Date.now(),
): EnrollmentSheetData
```

### Reglas de construcción

- `athleteName` proviene de `athlete.profile.name`.
- `birthDate` proviene de `athlete.profile.birthDate`; si falta, se conserva como `null` y la vista muestra `Sin capturar`. No se infiere la fecha desde la edad ni desde otro campo.
- `registrationDate` proviene de `athlete.membership.registrationDate` y se presenta como fecha de calendario, sin desplazamiento de zona horaria.
- `paymentDay` proviene de `athlete.membership.paymentDay`. Cuando es válido, la ficha muestra exactamente `Tu fecha de pago será el {paymentDay} de cada mes.`; no se consulta ni se lista el historial de pagos.
- `emergencyContact` se construye a partir de la proyección recibida. Los campos se muestran con nombre, teléfono y parentesco; un valor ausente se presenta como `Sin capturar`.
- Si no existe un registro de admisión legacy, `emergencyContact` es `null`, se muestra una advertencia de captura incompleta y no se inventan datos.
- El folio es estable para el atleta y la fecha de inscripción; abrir dos veces la misma ficha no debe producir folios aleatorios.
- Las fechas de calendario (`birthDate`, `registrationDate`) se formatean a partir de sus componentes `YYYY-MM-DD`, sin desplazamiento por zona horaria.
- La representación no incluye el teléfono personal del atleta, plan, importes, métodos, saldo, historial de pagos, estado civil ni salud. El teléfono del contacto de emergencia sí se incluye por solicitud explícita.

### Estados de disponibilidad

- Mientras los datos de admisión están cargando, la vista debe mostrar un estado de carga y bloquear PDF, impresión y WhatsApp.
- Si la lectura de admisión falla por permiso o conexión, la vista debe mostrar un error accionable y no generar una ficha incompleta que pueda confundirse con una captura válida.
- Si la lectura termina correctamente pero no existe contacto de emergencia, la ficha puede abrirse para mostrar `Sin capturar`; la ausencia debe ser visible antes de descargar o compartir.
- Si falta la fecha de nacimiento, se permite generar la ficha, pero la ausencia debe ser visible tanto en la vista previa como en el PDF.
- Si falta o es inválido `paymentDay`, se muestra `Sin capturar` y no se sustituye por el día actual ni por una fecha calculada.

## Interaction Contract

1. El usuario abre `Atletas` y elige `Ficha de inscripción` en un atleta existente.
2. La aplicación prepara la ficha con el estado actual del atleta y la proyección persistida del contacto de emergencia, sin escribir datos.
3. Se abre una vista previa titulada `Ficha de inscripción`, con folio y fecha de emisión.
4. La vista previa contiene:
   - `Datos de inscripción`: nombre, fecha de nacimiento y fecha de inscripción.
   - `Fecha de pago`: el texto `Tu fecha de pago será el {paymentDay} de cada mes.` cuando existe un día válido.
   - `Contacto de emergencia`: nombre, teléfono y parentesco para validar la captura.
   - `Sin capturar` para nacimiento, día de pago o cualquier dato de emergencia ausente.
   - Una advertencia informativa cuando falte información; no se reemplaza por un valor ficticio.
5. Abrir la vista previa no descarga, imprime ni abre una ventana externa automáticamente.
6. `PDF` genera el documento y dispara la descarga con un nombre determinista que identifique la ficha y el folio.
7. `Imprimir` genera el mismo documento y abre la ventana de impresión sin escribir en Firebase.
8. `WhatsApp Web` descarga primero el PDF y abre WhatsApp Web con un mensaje neutral. El archivo debe adjuntarse y enviarse manualmente; la aplicación no sube el PDF, no pulsa enviar y no usa una API de Meta.
9. El mensaje de WhatsApp no incluye salud, contacto de emergencia, importes ni la fecha de nacimiento. El PDF puede contener el contacto de emergencia para la validación solicitada, por lo que la interfaz debe recordarle al usuario revisar el destinatario antes de adjuntarlo. Si el teléfono personal no tiene diez dígitos, WhatsApp Web se abre sin destinatario prellenado y la interfaz informa que debe elegirse el contacto manualmente.
10. Todas las acciones de documento tienen estado ocupado, evitan ejecuciones duplicadas y muestran un error visible si el navegador bloquea una ventana o falla la generación.
11. Cerrar la vista previa no modifica el atleta, los pagos ni filtros de `Atletas`.

## Visual and accessibility requirements

- Reutilizar el lenguaje visual de `ReceiptDialog`: encabezado oscuro Kronos, acento naranja, logo oficial con fallback, jerarquía tipográfica, bloques con títulos visibles y pie de documento.
- El PDF debe conservar formato A5 vertical, repetir encabezado y pie al paginar y mantener legibles el contacto y la regla de pago.
- La vista previa debe usar etiquetas visibles y una sección claramente diferenciada para `Fecha de pago` y otra para `Contacto de emergencia`; no depender sólo de color.
- El diálogo debe tener nombre accesible, foco visible, orden de teclado lógico y botones con nombres accionables.
- Debe funcionar en `320`, `768`, `1024` y `1440` px sin scroll horizontal. En móvil, las acciones pueden envolverse en varias filas sin quedar ocultas.
- Los estados de carga, error y ausencia de datos deben diferenciarse mediante texto e iconos o estructura, no sólo color.
- No ocultar el aviso de privacidad ni datos faltantes en tooltips.

## Tech Stack

- Vue 3, TypeScript, Vuetify, Pinia y Firebase Realtime Database existentes.
- `jspdf` existente para PDF; no se agrega dependencia en esta fase.
- Utilidades existentes de fechas y normalización de WhatsApp, con una función específica para fechas de calendario si `formatDate` pudiera desplazar un `YYYY-MM-DD` por zona horaria.
- Store y servicio existentes de `athleteIntake`, con lectura autorizada y proyección exclusiva de `emergencyContact`.

## Commands

Ejecutar desde `app/` después de autorizar la spec y completar la implementación:

```sh
npm run typecheck
npm run build
npm run test:enrollment-sheet
npm run test:athlete-intake
npx playwright test --project=responsive --grep "ficha de inscripción"
```

`test:enrollment-sheet` es un script enfocado sobre `tsx` que precarga un workaround local para el fallo `uv_os_get_passwd` de este entorno Windows; no requiere instalar paquetes nuevos. El gate de Chrome se ejecutará manualmente según `SPEC-quality-gates.md` y `AGENTS.md`.

## Project Structure

```text
app/src/pages/atletas.vue                         → acción, lectura de admisión y apertura de la vista previa
app/src/components/kronos/EnrollmentSheetDialog.vue → vista previa, acciones y estados del documento
app/src/utils/enrollment-sheet.ts                 → contrato, proyección, folio y fechas de calendario
app/src/utils/enrollment-sheet-pdf.ts             → PDF paginado, descarga, impresión y WhatsApp manual
app/src/utils/kronos-pdf.ts                       → encabezado y logo compartidos con recibos
app/src/utils/receipts.ts                         → consumo de las primitivas compartidas sin cambiar su API
app/src/components/kronos/ReceiptDialog.vue       → regresión del flujo existente de recibos
app/src/stores/athlete-intake.ts                  → reutilización de la lectura existente, sin nuevos writes
app/src/services/athlete-intake.service.ts        → frontera de lectura existente, sin cambios de reglas
app/tests/enrollment-sheet.test.ts                 → contrato puro, fechas, legacy y privacidad
app/e2e/responsive/enrollment-sheet-responsive.spec.ts → smoke responsive protegido y read-only
app/package.json                                  → sólo el script de prueba enfocado, si se adopta
app/scripts/node-userinfo-preload.cjs             → workaround de ejecución de tests para el runner Windows actual
specs/SPEC-enrollment-sheet.md                    → contrato aprobado de Fase C
Docs/implementation-reports/                      → reporte final de impacto y evidencia
```

La lista es de archivos probables, no una autorización para modificar todos ellos. No se prevé cambio en `database.rules.json` ni en `app/src/stores/payments.ts`.

## Code Style

Mantener la frontera de datos en utilidades puras, proyectar sólo el contacto de emergencia y separar el teléfono personal usado para compartir del contrato que renderiza el PDF:

```ts
return {
  kind: 'enrollment',
  folio: buildEnrollmentFolio(athlete),
  issuedAt,
  athleteName: athlete.profile.name,
  birthDate: athlete.profile.birthDate ?? null,
  registrationDate: athlete.membership.registrationDate ?? null,
  paymentDay: Number.isInteger(athlete.membership.paymentDay)
    ? athlete.membership.paymentDay
    : null,
  emergencyContact: emergencyContact
    ? {
      name: emergencyContact.name?.trim() || null,
      phone: emergencyContact.phone?.trim() || null,
      relationship: emergencyContact.relationship?.trim() || null,
    }
    : null,
}
```

Prefer funciones deterministas, tipos explícitos, etiquetas en español y nombres de datos en inglés consistentes con `domain.ts`. No copiar un HTML legacy ni duplicar una segunda implementación de colores, logo o paginación si puede extraerse una primitiva pequeña y compatible con `ReceiptData`.

## Testing Strategy

### Unitarias enfocadas

- Construir una ficha válida con nombre, nacimiento, inscripción, día recurrente y contacto de emergencia.
- Generar el texto `Tu fecha de pago será el 26 de cada mes.` para un día válido y `Sin capturar` para un día ausente o inválido.
- Proyectar nombre, teléfono y parentesco del contacto de emergencia, recortando valores y conservando ausencias como `null`.
- Conservar `null` para nacimiento ausente y producir el estado visible correspondiente.
- Verificar que el contrato y el resultado no contienen `healthHistory`, estado civil ni ningún dato de admisión distinto al contacto de emergencia.
- Verificar que el folio y el nombre del archivo sean estables.
- Verificar el formateo de fechas de calendario sin desplazamiento por zona horaria.

### Integración y regresión

- Confirmar que la página consume el `athleteIntake` store sólo en lectura para la ficha y proyecta únicamente `emergencyContact`.
- Confirmar que un error de lectura o permiso de admisión no se presenta como contacto vacío válido.
- Regresar `ReceiptDialog` y al menos una ruta existente de recibo para demostrar que extraer primitivas no cambia el PDF ni las acciones actuales.
- Probar la generación de PDF con un contacto completo, datos ausentes y una vista suficientemente larga para confirmar encabezado/pie.

### Playwright complementario

- Ejecutar la matriz contra `https://kronos-training-fd5e5.web.app/`, reutilizando únicamente la instancia existente y un atleta QA identificable; no habilitar otra instancia ni mostrar datos médicos.
- Recorrer `Atletas` → acción de ficha → vista previa; no escribir ni eliminar datos.
- Ejecutar la matriz de `320`, `768`, `1024` y `1440` px.
- Comprobar diálogo accesible, ausencia de overflow horizontal, visibilidad de nombre, regla recurrente, contacto y alcance de botones.
- Capturar regresiones visuales sólo para la vista previa en `320` y `1440` px, con datos QA estables.
- No declarar la fase completa con Playwright; Chrome es el gate runtime obligatorio.

### QA web obligatorio en Chrome

El flujo protegido debe validarse en `https://kronos-training-fd5e5.web.app/` desde su entrada real hasta su resultado final: abrir `Atletas`, crear un atleta claramente identificado como QA con contacto de emergencia, abrir la ficha, revisar nombre, nacimiento, inscripción, regla de fecha recurrente y contacto, confirmar que no aparece salud, descargar el PDF, comprobar la apertura de impresión sin confirmar una impresión real, abrir WhatsApp Web sin enviar mensajes, cerrar la vista previa y eliminar el atleta QA al finalizar.

Antes de autenticarse se debe detener el agente y solicitar al usuario:

> Inicia sesión manualmente en el perfil de Chrome de pruebas. No compartas tus credenciales. Cuando termines, confirma que puedo continuar.

La validación revisará resultado funcional, consola sin errores o warnings nuevos, red, DOM/árbol de accesibilidad, evidencia visual y responsive. Los únicos writes autorizados son crear el atleta QA, guardar su admisión y eliminarlo al finalizar; no se inspeccionarán credenciales, cookies, tokens ni almacenamiento de autenticación.

## Boundaries

### Always

- Trabajar en `app/`; conservar `AppKronos/` como referencia histórica.
- Reutilizar `jspdf`, el logo oficial y las primitivas visuales existentes de recibos.
- Mantener el contrato de recibos actual y añadir pruebas de regresión si se extrae código compartido.
- Leer admisión sólo con el permiso existente y proyectar únicamente el contacto de emergencia.
- Mantener salud, antecedentes y demás admisión fuera del contrato, vista previa, PDF y mensaje de WhatsApp.
- No escribir en Firebase para generar, imprimir o compartir una ficha.
- Usar datos QA en la instancia existente `kronos-training-fd5e5.web.app` y validar el flujo completo en Chrome antes de cerrar la fase.

### Ask first

- Añadir o actualizar dependencias, incluidos paquetes de WhatsApp o PDF.
- Cambiar reglas, permisos, autenticación, esquema, índices o estrategia de almacenamiento.
- Incluir teléfono, plan, importes, estado de pago o cualquier campo adicional en el PDF o mensaje.
- Cambiar las semánticas propuestas de “fechas de pago”, datos ausentes o acceso por módulos.
- Desplegar una nueva versión, crear otra instancia o escribir datos distintos del atleta QA expresamente autorizado.

### Never

- Implementar WhatsApp Business Cloud API dentro de esta fase.
- Poner secretos, tokens o credenciales en el cliente, el repositorio o los tests.
- Automatizar el envío o adjunto del PDF en WhatsApp.
- Leer, renderizar o copiar datos de salud, antecedentes o cualquier admisión distinta del contacto de emergencia en la ficha.
- Modificar `AppKronos/kronos.html` como sustituto de la aplicación Vue.

## Risks and mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| “Fecha de pago” se interpreta como historial y no como regla recurrente | Alto | Mostrar una frase explícita basada en `paymentDay` y no consultar ni renderizar `Payment` |
| El contacto de emergencia contiene PII y se comparte con un destinatario equivocado | Alto | Mostrarlo sólo con permiso de admisión, advertir antes de compartir y exigir adjunto/envío manual |
| Un usuario tiene Atletas pero no permiso para consultar admisión | Alto | Exigir `athletes` + `athletesIntake` y no confundir falta de permiso con contacto vacío |
| Fecha legacy ausente | Medio | Mostrar `Sin capturar`, no inventar valores y conservar la posibilidad de corregir el atleta |
| La ficha no refleja un contacto de emergencia todavía no guardado | Medio | Generar sólo con el valor persistido leído; informar al administrador que debe guardar cambios primero |
| Extracción de estilos cambia recibos existentes | Alto | Mantener API y snapshots/QA de recibos antes de cerrar la rebanada |
| El usuario cree que WhatsApp adjuntó o envió el archivo | Alto | Mensaje y ayuda visibles: PDF descargado, adjunto manual y envío bajo confirmación del usuario |
| El PDF descargado contiene PII operativa | Medio | No persistirlo en Firebase, limitar el contrato y documentar el riesgo de archivos locales compartidos |

## Success Criteria

- [x] La spec queda revisada y autorizada antes de modificar comportamiento o tareas de implementación.
- [x] Un usuario con acceso a `athletes` y `athletesIntake` puede abrir la ficha desde un atleta existente sin escribir datos.
- [x] La vista previa muestra nombre, fecha de nacimiento, fecha de inscripción y la frase de fecha recurrente, por ejemplo `Tu fecha de pago será el 26 de cada mes.`
- [x] La vista previa y el PDF muestran nombre, teléfono y parentesco del contacto de emergencia, con `Sin capturar` cuando falte algún dato.
- [x] El documento tolera nacimiento, día de pago o contacto ausente con estados explícitos y no inventa valores.
- [x] El contrato testeable no contiene salud, antecedentes, estado civil ni otros datos de `AthleteIntake` fuera del contacto de emergencia proyectado.
- [x] El PDF A5 conserva el lenguaje visual de recibos Kronos y permite revisar antes de descargar o imprimir.
- [x] Descargar e imprimir funcionan sin afectar atletas, admisión, pagos, permisos ni reglas existentes.
- [x] WhatsApp Web se abre únicamente por acción explícita, sin adjunto ni envío automático y sin información sensible en el mensaje.
- [x] El flujo funciona sin overflow en `320`, `768`, `1024` y `1440` px y mantiene accesibilidad de diálogo, datos y acciones.
- [x] Pasan typecheck, build, pruebas enfocadas, regresiones de recibos y QA Chrome del flujo completo; cualquier falla baseline queda separada.
- [x] El reporte final incluye árbol de archivos, flujos afectados/no afectados, diagrama, evidencia y riesgos pendientes.

## Open Questions

1. Resuelto: se usará la frase `Tu fecha de pago será el {paymentDay} de cada mes.`.
2. Resuelto: el contacto de emergencia aparecerá en vista previa y PDF, pero no en el texto de WhatsApp.
3. Resuelto: la acción estará disponible con acceso a `athletes` y lectura de admisión mediante `athletesIntake` o `athletesIntakeManage`; Admin conserva el bypass.
4. Resuelto: una lectura correcta con datos ausentes permitirá generar la ficha mostrando `Sin capturar`; un error de lectura bloqueará la generación.

## Authorization Gate

El usuario autorizó esta versión el 2026-08-26 y posteriormente autorizó validar y publicar únicamente en la instancia existente `kronos-training-fd5e5.web.app`, crear un atleta QA y eliminarlo al finalizar. La implementación no instaló dependencias ni cambió permisos, reglas o esquema. Si una decisión posterior cambia alcance, datos, permisos o estrategia de verificación, la spec vuelve a `propuesta` y requiere nueva autorización antes de continuar.
