# Spec: E8-PROD-1 — Contrato operativo de recordatorios WhatsApp

Estado: **implementada y verificada localmente el 2026-09-10**.
Autorización del usuario: «Sí, autorizo» para los valores, alcance y límites
presentados en E8-PROD-1.
Fecha: 2026-09-10, America/Mexico_City.
Módulo: `athletes-payments`; fuente secundaria: `store-inventory`;
verificación transversal: `experience-quality`.
Capability map: `../../specs/CAPABILITY-MAP.md`, aprobado el 2026-08-26.
Spec matriz: `../../specs/SPEC-payment-notifications-whatsapp.md`.

## Objetivo

Fijar un único contrato operativo para los recordatorios automáticos antes de
conectar recursos de Meta o desplegar Functions. Esta fase elimina la discrepancia
entre las propuestas históricas y los valores que ya fueron implementados y probados
localmente. Su resultado es una configuración no secreta, determinista, validada y
lista para ser consumida por las fases de transporte, scheduler y despliegue.

El éxito de esta fase no significa que WhatsApp quede habilitado. Al terminar,
proveedor real, credenciales, recursos remotos, mensajes y despliegue permanecen
apagados y requieren sus respectivas fases y autorizaciones.

## Supuestos propuestos

1. Se conservan los valores ya implementados y cubiertos por pruebas: ejecución
   diaria a las 09:00 de `America/Mexico_City`; mensualidad tres días antes, el día
   de vencimiento y tres días después; tienda miércoles y viernes.
2. Se conserva el máximo de un recordatorio por atleta y fecha local. Cuando
   coinciden mensualidad y tienda se genera un solo recordatorio combinado.
3. Sólo son elegibles atletas activos, con consentimiento de recordatorios vigente
   y ligado al teléfono actual; `unknown`, opt-out o teléfono cambiado fallan cerrado.
4. Un reintento técnico del mismo job no cuenta como un recordatorio adicional,
   pero nunca se reenvía automáticamente un resultado `unknown`.
5. El aviso PDF sigue siendo interno e informativo, no factura ni CFDI.
6. Esta fase no introduce ventana de silencio adicional: el único envío automático
   se origina en la corrida programada de las 09:00. Los reintentos productivos y su
   ventana se fijarán en la fase operativa correspondiente.

## Alcance

### Incluye

- Hacer explícitos y coherentes los valores operativos aprobados entre spec matriz,
  configuración de Functions y pruebas.
- Mantener la configuración en código y variables de entorno no secretas, con
  validación fail-closed de zona horaria, horas, días y máximo diario.
- Añadir pruebas de regresión que acrediten cada punto de la cadencia, meses de
  28/29/30/31 días, combinación de deudas y deduplicación diaria.
- Registrar en `tasks/todo.md` el checkpoint y dejar trazabilidad en la spec matriz.

### Excluye

- Crear o modificar WABA, número remitente, plantillas, webhook o credenciales.
- Implementar el transporte Meta, activar el worker real o enviar mensajes.
- Desplegar Functions, cambiar CI/hosting, crear Scheduler/Cloud Tasks o usar datos
  de producción.
- Cambiar Realtime Database, reglas, índices, autenticación, permisos o retención.
- Cambiar pantallas Vue; por ello Chrome y Playwright no aplican a esta fase.

## Contrato operativo propuesto

| Parámetro | Valor |
| --- | --- |
| Zona horaria | `America/Mexico_City` |
| Corrida del scheduler | Diaria a las `09:00` |
| Mensualidad previa | 3 días calendario antes del vencimiento |
| Mensualidad al vencimiento | El día de vencimiento |
| Mensualidad vencida | 3 días calendario después del vencimiento |
| Tienda | Miércoles y viernes |
| Máximo diario | 1 recordatorio por atleta y fecha local |
| Coincidencia de deudas | 1 recordatorio combinado |
| Resultado ambiguo de Meta | `unknown`, sin reenvío automático |
| Documento | `AVISO DE PAGO`, informativo y no fiscal |

El día de pago 29, 30 o 31 se ajusta al último día real del mes. El scheduler puede
repetir una corrida sin crear otro job para el mismo atleta y fecha. Si la ejecución
del día falla por completo, esta fase no promete catch-up en otra fecha; esa política
pertenece a la fase de scheduler y recuperación productivos.

## Tecnología y estructura

Node 22, TypeScript, `firebase-admin` 14.3.0 y `firebase-functions` 7.3.2 existentes.
No se añaden dependencias ni scripts. Archivos probables, relativos a `app/`:

```text
functions/SPEC-whatsapp-production-configuration.md
functions/src/notifications/reminders.ts
functions/tests/reminders.test.ts
../specs/SPEC-payment-notifications-whatsapp.md
../tasks/todo.md
```

Estilo vigente: tipos y código en inglés, documentación en español, comillas simples,
sin punto y coma y reloj/configuración inyectables.

## Implementación y verificación

La fase se implementará con TDD en una sola rebanada:

1. Registrar aprobación y actualizar la spec matriz/tarea sin cambiar comportamiento.
2. Añadir primero las pruebas de contrato faltantes y comprobar RED si revelan una
   divergencia real.
3. Aplicar sólo los cambios mínimos necesarios en configuración o documentación.
4. Ejecutar pruebas de Functions, typecheck, build, ESLint focalizado y
   `git diff --check` sin revertir cambios preexistentes.
5. Revisar el diff y entregar reporte de impacto. Chrome y Playwright no aplican
   porque no se modifica aplicación web ni se habilita un flujo remoto.

Comandos desde `app/`:

```powershell
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
.\node_modules\.bin\eslint.cmd functions/src/notifications/reminders.ts functions/tests/reminders.test.ts -c .eslintrc.cjs --rule "import/extensions: off"
git diff --check
```

## Criterios de aceptación

- [x] Spec matriz, código y pruebas expresan exactamente la misma cadencia.
- [x] Los casos previo, vencimiento y vencido funcionan en fechas normales y para
  vencimientos 28/29/30/31 ajustados al último día del mes.
- [x] Tienda sólo genera candidatos miércoles y viernes.
- [x] Mensualidad y tienda del mismo atleta/fecha producen un candidato combinado.
- [x] Dos corridas de la misma fecha crean como máximo un job por atleta.
- [x] Consentimiento ausente, opt-out, teléfono cambiado, atleta inactivo y saldo
  no positivo no crean un recordatorio.
- [x] Configuración inválida falla antes de ejecutar lecturas o crear jobs.
- [x] No se realizan llamadas de red, mensajes, escrituras remotas ni despliegues.
- [x] Pruebas, typecheck, build, lint focalizado y whitespace pasan, o cualquier
  fallo basal queda separado y documentado.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Contactar demasiado al atleta | Máximo de un recordatorio diario y combinación de deudas |
| Fechas de pago inválidas al final de mes | Ajuste determinista y pruebas 28/29/30/31 |
| Configuración distinta entre docs y runtime | Un solo contrato y regresión sobre defaults |
| Activación accidental | Sin proveedor real, secretos, recursos remotos ni despliegue |
| Confundir aviso con comprobante fiscal | Título y leyenda informativa obligatorios |
| Pérdida de una corrida | Se documenta como pendiente para la fase de recuperación productiva |

## Límites

Siempre: preservar secretos, datos, servicios y árbol sucio; usar sólo datos
sintéticos si una prueba los requiere; mantener proveedor real deshabilitado.

Preguntar antes: cambiar esta cadencia, añadir ventana de silencio, modificar reglas,
esquema, dependencias, infraestructura, retención, reintentos, recursos Meta, datos
reales o despliegue.

Nunca: enviar mensajes reales, guardar secretos en Git o cliente, usar datos de
clientes para QA, tratar `unknown` como reintentable o presentar el aviso como CFDI.

## Resultado local

La revisión detectó una divergencia en los bordes de mes: si el periodo adyacente
todavía no tenía fila de pago, el barrido sólo evaluaba el periodo local y podía
omitir el aviso previo del mes siguiente o el vencido del mes anterior. Una prueba
RED reprodujo ambos casos. El cálculo ahora incluye los periodos anterior, actual y
siguiente, además de los periodos persistidos, sin revivir balances ya liquidados.

Evidencia: 153/153 pruebas de Functions, typecheck, build y ESLint focalizado
aprobados. El lint desactiva únicamente `import/extensions` para el archivo de prueba,
pues la suite vigente usa extensiones `.ts` bajo `tsx`; las demás reglas permanecen
activas. Whitespace aprobado. La revisión de corrección, legibilidad, arquitectura,
seguridad y rendimiento no dejó hallazgos Critical/Required. Chrome y Playwright no
aplican: no se modificó la aplicación web ni se habilitó un flujo remoto.

## Gate de autorización

La autorización explícita se recibió el 2026-09-10. Cubre sólo la consolidación
documental, configuración local y pruebas descritas. No cubre Meta, secretos,
infraestructura remota, datos reales, mensajes ni despliegue. Cualquier cambio de
cadencia o ampliación del alcance devuelve esta spec a propuesta.
