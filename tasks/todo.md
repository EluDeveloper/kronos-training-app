# Task List: Adopción de SDD en Kronos

## Mantenimiento técnico

- [x] Declarar npm y `app/package-lock.json` como fuente autoritativa.
- [x] Corregir las vulnerabilidades alcanzables sin aplicar `npm audit fix --force`; producción queda en cero y el tooling conserva 5 moderadas documentadas.
- [x] Instalar/habilitar JDK 21 para el emulador de reglas.
- [x] Ejecutar `npm run test:rules` con Java 21 y documentar el resultado (26/26).

## Roadmap funcional aprobado para planificación

- [x] Revisar y autorizar `specs/SPEC-athlete-form-tabs.md` antes de implementar Fase B.
- [x] Revisar y autorizar `specs/SPEC-quality-gates.md` antes de integrar Playwright.
- [x] Fase B: dividir el formulario de atleta en pestañas.
- [x] Fase C: generar ficha de inscripción reutilizando el diseño de recibos.
- [x] Revisar y autorizar `specs/SPEC-kiosk-code.md` antes de implementar Fase D.
- [x] Fase D: mantener el código aleatorio y añadir credencial QR regenerable para Kiosco.
- [ ] Fase E: implementar notificaciones de pagos con WhatsApp Business.
- [ ] Fase F: evaluar notificaciones push como alternativa.

## Fase E: Notificaciones de pagos por WhatsApp Business

- [x] E0 — Revisar y autorizar specs/SPEC-payment-notifications-whatsapp.md; mantener fuera de alcance los secretos, recursos Meta, writes QA y despliegue.
  - Aceptación: spec en estado aprobada, alcance y gates registrados en plan.
  - Verificación: revisión documental y árbol limpio salvo cambios de documentación.
  - Archivos: specs/SPEC-payment-notifications-whatsapp.md, tasks/plan.md, tasks/todo.md.
- [x] E1 — Construir contratos puros de deuda, elegibilidad, cadencia, correlación e idempotencia.
  - Aceptación: mensualidad/tienda se calculan desde datos canónicos; opt-out, teléfono cambiado, athleteId ausente y estados inválidos fallan cerrado; las claves y transiciones son deterministas.
  - Verificación: RED confirmado; GREEN con 7/7 pruebas enfocadas, typecheck y lint del alcance. Build bloqueado por el fallo basal EPERM de app/node_modules/.vite-temp, documentado en tasks/plan.md.
  - Dependencias: E0.
  - Archivos probables: app/src/utils/payment-notification.ts, app/tests/payment-notification.test.ts.
- [x] E2 — Construir el contrato de comprobante y aviso informativo para backend.
  - Aceptación: pago aplicado y recordatorio distinguen recibo de aviso; no entra healthHistory, athleteIntake, emergencyContact, kioskCode ni secretos.
  - Verificación: 9/9 pruebas enfocadas, lint y typecheck. Build bloqueado por el fallo basal EPERM de app/node_modules/.vite-temp, documentado en tasks/plan.md.
  - Dependencias: E1.
  - Archivos probables: app/src/utils/payment-notification.ts, app/src/utils/receipts.ts, app/tests/payment-notification.test.ts.
- [x] E3 — Integrar consentimiento y opt-out en la aplicación.
  - Aceptación: consentimiento explícito ligado al teléfono E.164, retiro visible, permisos mínimos y persistencia separada.
  - Implementación: diálogo dedicado en Atletas, dos propósitos independientes, teléfono enmascarado, opt-in/opt-out explícitos y persistencia en v1/notificationPreferences/{athleteId}.
  - Verificación: 13/13 contratos enfocados, 30/30 reglas con emulador/JDK21, typecheck, lint y build; regresiones enrollment, kiosk y store kiosk pasan.
  - QA Chrome: confirmado manualmente por el usuario en localhost; captura de evidencia muestra diálogo, teléfono enmascarado, propósitos independientes y aviso sin envío de mensajes.
  - No se hicieron writes QA en producción, envíos Meta ni despliegues.
  - Dependencias: E1 y E2.
  - Archivos: app/src/pages/atletas.vue, app/src/components/kronos/WhatsAppConsentDialog.vue, app/src/services/notification-preferences.service.ts, app/src/stores/notification-preferences.ts, app/src/utils/payment-notification.ts, app/database.rules.json, app/tests/database.rules.test.mjs, app/tests/payment-notification.test.ts.
- [ ] E4 — Crear frontera de Cloud Functions y adaptador fake de WhatsApp.
  - Aceptación: ningún secreto llega al cliente; el fake permite probar respuestas accepted/rejected/unknown sin red externa.
  - Verificación: typecheck/tests de functions y auditoría de bundle; requiere autorización de dependencias e infraestructura.
  - Dependencias: E1–E3.
  - Archivos probables: app/firebase.json, functions/package.json, functions/package-lock.json, functions/src/index.ts, functions/src/whatsapp/client.ts.
- [ ] E5 — Integrar eventos, jobs, locks, reintentos y webhook.
  - Aceptación: triggers concurrentes y webhooks duplicados no duplican mensajes; unknown no se reintenta ciegamente; estados sólo avanzan.
  - Verificación: integración con emuladores/fakes y reglas; sin credenciales Meta.
  - Dependencias: E4.
  - Archivos probables: functions/src/notifications/payment-events.ts, functions/src/notifications/jobs.ts, functions/src/notifications/consent.ts, functions/src/whatsapp/webhook.ts, functions/tests/payment-notifications.test.ts.
- [ ] E6 — Integrar scheduler y recordatorios de adeudos.
  - Aceptación: cadencia aprobada, límites por atleta/día, vencimientos 28/30/31 y mensualidad+tienda combinadas sin duplicar.
  - Verificación: pruebas con reloj inyectable y scheduler fake; configuración real requiere autorización.
  - Dependencias: E5.
  - Archivos probables: functions/src/notifications/reminders.ts, functions/src/notifications/jobs.ts, functions/tests/payment-notifications.test.ts.
- [ ] E7 — Integrar plantillas, PDF backend y proveedor Meta.
  - Aceptación: sólo plantilla Utility aprobada y documento privado compatible; no hay fallback libre ni secretos en logs; proveedor real queda apagado hasta autorizarlo.
  - Verificación: contract tests con fake y prueba aislada del proveedor; configuración/credenciales requieren autorización.
  - Dependencias: E4–E6.
  - Archivos probables: functions/src/whatsapp/client.ts, functions/src/whatsapp/templates.ts, functions/src/pdf/payment-receipts.ts, functions/tests/pdf-receipts.test.ts.
- [ ] E8 — Ejecutar gates y cerrar la fase.
  - Aceptación: pruebas, typecheck, build, reglas, QA Chrome del flujo completo, Playwright complementario y reporte de impacto.
  - Verificación: comandos de app/functions, Chrome en https://kronos-training-fd5e5.web.app/ y evidencia sin datos reales.
  - Dependencias: E7 y autorizaciones de QA/despliegue.
  - Archivos probables: app/e2e/responsive/payment-notifications-responsive.spec.ts, Docs/implementation-reports/YYYY-MM-DD-payment-notifications-whatsapp.md.
- [x] E8-PROD-1 — Consolidar el contrato operativo de recordatorios automáticos.
  - Aceptación: spec matriz, runtime y pruebas coinciden en 09:00 America/Mexico_City; mensualidad -3/0/+3 días; tienda miércoles/viernes; un recordatorio diario combinado por atleta.
  - Verificación: bordes 28/29/30/31, elegibilidad fail-closed, idempotencia, suite de Functions, typecheck, build, lint focalizado y whitespace.
  - Dependencias: E8-MANT local completada y autorización de SPEC-whatsapp-production-configuration.md recibida el 2026-09-10.
  - Archivos: app/functions/SPEC-whatsapp-production-configuration.md, app/functions/src/notifications/reminders.ts, app/functions/tests/reminders.test.ts, specs/SPEC-payment-notifications-whatsapp.md, tasks/plan.md, tasks/todo.md.
  - Límites: sin Meta, secretos, infraestructura remota, datos reales, mensajes, cambios de reglas/esquema ni despliegue.
- [x] E8-PROD-2 — Implementar el transporte Meta local, aislado y deshabilitado.
  - Aceptación: host Graph fijo; versión, IDs y entradas validadas; upload PDF multipart y envío de plantilla exactos; respuestas acotadas; errores sanitizados; incertidumbre fail-closed.
  - Verificación: RED/GREEN con `fetch` fake, regresión del proveedor, suite de Functions, typecheck, build, lint focalizado, whitespace y revisión de cinco ejes.
  - Dependencias: E8-PROD-1 completada y autorización de `app/functions/SPEC-whatsapp-meta-transport.md` recibida el 2026-09-10.
  - Archivos probables: app/functions/SPEC-whatsapp-meta-transport.md, app/functions/src/whatsapp/meta-graph-api-transport.ts, app/functions/tests/meta-graph-api-transport.test.ts, app/functions/src/index.ts, tasks/plan.md, tasks/todo.md.
  - Límites: sin red real, secretos, recursos Meta, conexión al worker, mensajes, datos productivos, cambios de reglas/esquema, CI/hosting ni despliegue.
- [x] E8-PROD-3 — Integrar el runtime productivo seguro, apagado por defecto.
  - Aceptación: modos cerrados y fail-closed; fake sólo en demo+loopback; Meta sólo con entorno/configuración explícitos; secreto leído dentro del handler; un solo trigger de jobs.
  - Verificación: RED/GREEN del resolver/factory, integración del worker con fetch fake, suite de Functions, typecheck, build, lint, whitespace e inspección de exports.
  - Dependencias: E8-PROD-2 completada y autorización de `app/functions/SPEC-whatsapp-production-runtime.md` recibida el 2026-09-11.
  - Archivos: app/functions/SPEC-whatsapp-production-runtime.md, app/functions/src/whatsapp/provider-runtime.ts, app/functions/src/whatsapp/meta-graph-api-transport.ts, app/functions/src/notifications/local-worker.ts, app/functions/tests/provider-runtime.test.ts, app/functions/tests/notification-runtime-worker.test.ts, app/functions/tests/local-worker.test.ts, tasks/plan.md, tasks/todo.md, Docs/implementation-reports/2026-09-11-whatsapp-production-runtime.md.
  - Límites: sin crear/asignar secretos, red real, recursos Meta, mensajes, datos productivos, cambios de reglas/esquema, CI/hosting ni despliegue.
- [x] E8-PROD-4 — Integrar el webhook productivo seguro y opt-out.
  - Estado: implementada y verificada localmente el 2026-09-21.
  - Aceptación: dos secretos con lectura por rama; raw body autenticado y acotado; match exacto de WABA/número; estados monotónicos y BAJA deduplicada; un solo endpoint.
  - Verificación: RED/GREEN de frontera y stores, integraciones RTDB Emulator, suite de Functions, typecheck, build, lint, whitespace e inspección de metadata.
  - Dependencias: E8-PROD-3 completada; requiere autorización de `app/functions/SPEC-whatsapp-production-webhook.md`.
  - Archivos: app/functions/SPEC-whatsapp-production-webhook.md, app/functions/src/whatsapp/http.ts, app/functions/src/whatsapp/webhook-runtime.ts, app/functions/src/whatsapp/realtime-opt-out.ts, app/functions/src/whatsapp/realtime-status-inbox.ts, app/functions/src/whatsapp/local-status-inbox.ts, app/functions/tests/whatsapp-production-webhook.test.ts, app/functions/tests/opt-out-http.integration.ts, app/functions/tests/status-inbox-http.integration.ts, tasks/plan.md, tasks/todo.md, Docs/implementation-reports/2026-09-21-whatsapp-production-webhook.md.
  - Límites: sin crear/asignar secretos, registrar webhook, red Meta, mensajes, datos publicados, cambios de reglas/esquema/dependencias, CI/hosting ni despliegue.
- [x] E8-PROD-5 — Recuperar automáticamente jobs pendientes y reintentos vencidos.
  - Estado: implementada y verificada localmente el 2026-09-21.
  - Aceptación: `recoveryAt` indexado; scheduler cada cinco minutos apagado por defecto; lotes de 25 y grupos de tres; leases concurrentes; backoff 1/5/30/180, cuatro reintentos y ventana de 24 horas; `unknown` nunca se reenvía.
  - Verificación: 9/9 pruebas focalizadas, 211/211 Functions, 40/40 Rules + RTDB, 1/1 recorrido automático Functions + RTDB, typecheck, build, lint, whitespace, metadata y revisión de cinco ejes.
  - Dependencias: E8-PROD-4 completada y autorización de `app/functions/SPEC-whatsapp-production-recovery.md` recibida el 2026-09-21.
  - Archivos: app/functions/SPEC-whatsapp-production-recovery.md, app/functions/src/notifications/jobs.ts, app/functions/src/notifications/realtime-job-store.ts, app/functions/src/notifications/production-recovery.ts, app/functions/src/index.ts, app/functions/tests/notification-recovery.test.ts, app/functions/tests/notification-recovery.integration.ts, app/database.rules.json, app/tests/database.rules.test.mjs, tasks/plan.md, tasks/todo.md, Docs/implementation-reports/2026-09-21-whatsapp-production-recovery.md.
  - Límites: sin crear/habilitar recursos remotos, asignar secretos, migrar datos publicados, red Meta, mensajes, dependencias, CI/hosting ni despliegue.
- [x] E8-PROD-6 — Añadir mantenimiento y telemetría operativa productiva.
  - Estado: implementada y verificada localmente el 2026-09-21.
  - Aceptación: fallback de estados y limpieza acotada; TTL de 30 días para nuevos marcadores webhook; scheduler apagado; telemetría allowlist sin PII ni secretos; fallos observables.
  - Verificación: 7/7 pruebas focalizadas, 218/218 Functions, 44/44 Rules + RTDB, typecheck, build, lint, whitespace, metadata y revisión de cinco ejes.
  - Dependencias: E8-PROD-5 completada y autorización de `app/functions/SPEC-whatsapp-production-operations.md` recibida el 2026-09-21.
  - Archivos: app/functions/SPEC-whatsapp-production-operations.md, app/functions/src/operations/telemetry.ts, app/functions/src/whatsapp/production-maintenance.ts, app/functions/src/whatsapp/realtime-webhook-events.ts, app/functions/src/whatsapp/http.ts, app/functions/src/notifications/production-recovery.ts, app/functions/src/index.ts, app/functions/tests/whatsapp-production-operations.test.ts, app/functions/tests/whatsapp-production-operations.integration.ts, app/functions/tests/whatsapp-webhook.integration.ts, app/database.rules.json, app/tests/database.rules.test.mjs, tasks/plan.md, tasks/todo.md, Docs/implementation-reports/2026-09-21-whatsapp-production-operations.md.
  - Límites: sin recursos o datos productivos, backfill, borrado real, secretos, Meta, mensajes, alertas Cloud, dependencias, CI/hosting ni despliegue.
- [ ] E8-PROD-7 — Preparar despliegue seguro y un canario real de WhatsApp.
  - Estado: pausada el 2026-09-23 por cambio de prioridad. P7-1–P7-6 completados localmente; Firebase QA existe pero falta inventario coherente; alta Meta detenida por número ya registrado. La nueva prioridad no quedó especificada.
  - Aceptación: defaults inertes; kill switch y allowlist QA en productor+worker; predeploy reproducible; Firebase/Meta inventariados; un solo destinatario QA; rollback probado.
  - Verificación: 218+ pruebas Functions, typecheck, build, rules, audit, inventario remoto, webhook firmado, un comprobante y recordatorio QA, estados monotónicos, BAJA y ausencia de destinatarios no autorizados.
  - Dependencias: E8-PROD-6; revisión y autorización explícita de `app/functions/SPEC-whatsapp-production-rollout.md`.
  - Gates separados: endurecimiento local; billing/APIs/IAM/secrets/deploy; WABA/número/plantillas/webhook; writes y mensajes reales.
  - [x] P7-0 — Revisar y autorizar primero el endurecimiento local de la spec; no incluye infraestructura, secretos, deploy ni mensajes.
  - [x] P7-1 — Probar y construir el contrato puro `disabled | qa | production`, dejando `production` imposible en esta fase.
    - Archivos: app/functions/src/notifications/rollout.ts, app/functions/tests/notification-rollout.test.ts.
  - [x] P7-2 — Aplicar el gate a triggers y recordatorios para que defaults no creen jobs y QA sólo cree los del atleta canario.
    - Archivos: app/functions/src/notifications/triggers.ts, app/functions/src/notifications/reminders.ts y sus pruebas.
  - [x] P7-3 — Revalidar allowlist antes de Meta y durante recovery; ningún job inyectado de otro atleta usa red.
    - Archivos: app/functions/src/notifications/local-worker.ts, app/functions/src/notifications/production-recovery.ts y pruebas runtime.
  - [x] Checkpoint P7-1–P7-3 — Pruebas enfocadas y suite Functions; cero jobs/fetch fuera del canario.
  - [x] P7-4 — Añadir predeploy, región/límites y retirar o corregir el health endpoint engañoso.
    - Archivos: app/firebase.json, app/functions/src/index.ts y pruebas de metadata.
  - [x] P7-5 — Con autorización de dependencia, probar firebase-admin@14.4.0 y actualizar sólo package/lock; nunca usar audit fix --force.
    - Archivos: app/functions/package.json, app/functions/package-lock.json.
    - Autorización: recibida el 2026-09-23.
    - Evidencia: 228/228 Functions, 20/20 integraciones RTDB, typecheck y build; audit pasó de seis a dos vulnerabilidades moderadas transitivas, sin altas ni críticas.
  - [x] P7-6 — Ejecutar suite, typecheck, build, rules, audit y revisión de cinco ejes; presentar el gate de infraestructura.
    - Evidencia: 228/228 Functions, 20/20 integraciones RTDB, 38/38 reglas, typecheck, build, lint y whitespace; audit conserva dos moderadas transitivas sin altas ni críticas.
  - [ ] P7-7 — Con autorización separada, preparar el proyecto aislado `kronos-training-qa` en disabled.
    - [ ] P7-7A — Crear el baseline Firebase QA, sin Analytics, billing, datos de app, secretos ni deploy.
      - Estado: autorizado y aprovisionado el 2026-09-23; verificación de propagación pendiente.
      - Aceptación: projectId exacto, propietario/jerarquía confirmados, baseline automático inventariado y ausencia de RTDB/Auth/Functions o recursos de Kronos.
      - Evidencia parcial: creación CLI exitosa y cero apps; captura del usuario confirma visualmente el proyecto `kronos-training-qa`/“Kronos Training QA”; `projects:list` aún no muestra QA y RTDB list devuelve 403 de IAM. No avanzar a P7-7B hasta obtener inventario consistente.
    - [ ] P7-7B — Enlazar manualmente Blaze/presupuesto y preparar APIs, RTDB/Auth, IAM mínimo y secretos.
      - Estado: no autorizado; requiere gate posterior a P7-7A.
    - [ ] P7-7C — Desplegar reglas y Functions específicas con todos los modos en `disabled`.
      - Estado: no autorizado; requiere gate posterior a P7-7B.
  - [ ] P7-8 — Con autorización separada, crear desde cero app Meta, WABA, número, plantillas y webhook sin habilitar envíos generales.
    - Estado: onboarding iniciado y pausado al agregar el teléfono; Meta informa que el número ya está registrado con WhatsApp. El usuario indica que todos los números disponibles ya tienen WhatsApp y no puede eliminar esas cuentas. No desconectar ni migrar números.
    - Decisión pendiente: remitente de prueba Meta para validar QA, línea dedicada o evaluación de coexistencia. Usar el remitente de prueba cambia los criterios de verificación y requiere actualizar/autorización de spec antes de configurar.
  - [ ] P7-9 — Con autorización específica de datos, teléfono y mensajes, ejecutar un único canario real, BAJA y rollback.
  - [ ] Checkpoint final — Reporte con recursos, mensajes, writes, limpieza, costos, evidencia y riesgos; production continúa bloqueado.

### Checkpoint: Fase E — contratos locales

- [x] E1 y E2 pasan pruebas enfocadas, typecheck y lint.
- [x] No se modifican Firebase, dependencias, funciones, credenciales, datos publicados ni despliegues.
- [x] Revisar el contrato antes de avanzar a E3, que requiere un gate de reglas/esquema.

### QA local: bootstrap de dispositivo

- [x] QA1 — Documentar el alcance aprobado y la decisión de seguridad para emuladores locales.
  - Aceptación: modo emulator opt-in, helper externo y rechazo de producción quedan documentados; gestión futura de dispositivos fuera de alcance.
  - Verificación: `specs/SPEC-local-device-qa-bootstrap.md` y ADR.
- [x] QA2 — Conectar Auth y Realtime Database a emuladores locales sólo en modo explícito.
  - Aceptación: configuración demo sin secretos, modo normal sin cambios y puertos de loopback fijos.
  - Verificación: typecheck y arranque de emuladores.
- [x] QA3 — Crear helper para autorizar un UID en el emulador.
  - Aceptación: escribe sólo `v1/authorizedDevices/{uid}` local; valida UID y bloquea producción antes de la petición.
  - Verificación: pruebas unitarias del helper.
- [x] QA4 — Ejecutar el recorrido completo local en Chrome.
  - Aceptación: logo/UID, autorización, primer Admin y login local; sin credenciales automatizadas ni datos reales.
  - Verificación: recorrido local confirmado por el usuario y evidencia visual compartida desde Chrome.

## Foundation

- [x] Revisar y aprobar el capability map.
- [x] Elegir la fuente de verdad para las skills.
- [x] Configurar el flujo de QA con Chrome DevTools MCP.
- [x] Documentar como regla global la validación del flujo completo afectado en Chrome.
- [x] Documentar Playwright como complemento de responsive, no como sustituto de Chrome o `frontend-ui-engineering`.

## Pilot

- [x] Elegir el primer flujo vertical: alta y edición de atletas.
- [x] Crear `specs/SPEC-athletes-payments.md`.
- [x] Descomponer la spec en tareas ejecutables.
- [x] Aprobar la spec del piloto.
- [x] Confirmar el modelo de acceso y privacidad para datos de salud: nodo `athleteIntake` separado y permisos `athletesIntake`/`athletesIntakeManage` con mínimo privilegio.
- [x] Implementar el modelo backward-compatible y validación determinista.
- [x] Añadir pruebas enfocadas de contacto de emergencia y cuestionario de salud.
- [x] Integrar errores por campo y estados de formulario.
- [x] Integrar secciones accesibles y campos condicionales.
- [x] Mejorar estados de carga, error y resultados vacíos.
- [x] Implementar la primera tarea sin mezclar módulos.
- [x] Ejecutar pruebas de reglas con Java 21; typecheck, lint, build, pruebas enfocadas y QA Chrome de producción ya pasan.
- [x] Entregar el reporte de impacto.

## Checkpoint: Foundation

- [x] Las reglas del agente están documentadas.
- [x] El mapa de capacidades está aprobado.
- [x] Los fallos previos del entorno están separados de los fallos nuevos.

## Checkpoint: Pilot

- [x] La rebanada funciona de extremo a extremo.
- [x] La spec coincide con el comportamiento implementado.
- [x] El reporte identifica archivos y flujos afectados.

## Checkpoint: Antes de Fase B

- [x] Las specs propuestas están disponibles para revisión.
- [x] El usuario autoriza `specs/SPEC-athlete-form-tabs.md`.
- [x] El usuario autoriza `specs/SPEC-quality-gates.md` y la dependencia `@playwright/test`.
- [x] Se define autenticación manual local y no versionada para pruebas Playwright protegidas; no se automatizan credenciales ni escrituras.

## Fase B: Formulario por pestañas

- [x] B1 — Integrar Playwright Test, Chromium, ignores y configuración responsive segura.
  - Aceptación: cuatro viewports configurados; producción no es el destino predeterminado; estado autenticado excluido de Git.
  - Verificación: `npx playwright test --project=responsive-public` y auditoría npm.
- [x] B2 — Probar y añadir el contrato de errores por pestaña.
  - Aceptación: conteos y primer error siguen el orden Personal → Membresía → Admisión.
  - Verificación: `npm run test:athlete-intake` con evidencia RED/GREEN.
- [x] B3 — Implementar tabs accesibles en alta/edición.
  - Aceptación: no se pierden datos, el primer tab inválido se activa/enfoca y permisos/carga se conservan.
  - Verificación: test enfocado, typecheck, lint y build.
- [x] B4 — Ejecutar QA responsive y flujo completo afectado.
  - Aceptación: Playwright pasa a 320/768/1024/1440 y Chrome valida alta/edición completa sin errores nuevos.
  - Verificación: Playwright, Chrome DevTools y reporte de impacto.

## Checkpoint: Fase B

- [x] B1–B3 pasan pruebas automatizadas, typecheck y build.
- [x] B4 completa Playwright y Chrome con login manual autorizado.
- [x] Reporte, commits y push quedan sincronizados en `develop` y `main`.

## Fase C: Ficha de inscripción

- [x] C0 — Revisar y autorizar `specs/SPEC-enrollment-sheet.md`.
  - Aceptación: fecha recurrente, contacto de emergencia, permisos, privacidad y QA quedan definidos.
  - Verificación: spec en estado `aprobada para implementación`.
- [x] C1 — Probar y construir el contrato puro de ficha.
  - Aceptación: mapea atleta, día recurrente y sólo la proyección del contacto; datos ausentes muestran `Sin capturar` y no entra historial/salud.
  - Verificación: prueba RED/GREEN con `npm run test:enrollment-sheet`.
  - Dependencias: C0.
  - Archivos probables: `app/tests/enrollment-sheet.test.ts`, `app/src/utils/enrollment-sheet.ts`, `app/package.json`.
- [x] C2 — Reutilizar el lenguaje visual de recibos y generar el PDF.
  - Aceptación: PDF A5 con header Kronos, folio estable, descarga/impresión/WhatsApp manual y recibos sin regresión.
  - Verificación: prueba enfocada de ambos documentos, typecheck y build.
  - Dependencias: C1.
  - Archivos probables: `app/src/utils/kronos-pdf.ts`, `app/src/utils/receipts.ts`, `app/src/utils/enrollment-sheet.ts`, `app/tests/enrollment-sheet.test.ts`.
- [x] C3 — Integrar vista previa accesible en `Atletas`.
  - Aceptación: acción visible con lectura de admisión, estados de carga/error/datos ausentes y datos sensibles limitados al contacto solicitado.
  - Verificación: test enfocado, lint, typecheck y revisión de teclado/DOM.
  - Dependencias: C2.
  - Archivos probables: `app/src/components/kronos/EnrollmentSheetDialog.vue`, `app/src/pages/atletas.vue`.
- [x] C4 — Ejecutar QA responsive y flujo completo afectado.
  - Aceptación: Playwright pasa a `320/768/1024/1440`; Chrome valida vista previa, PDF, impresión y WhatsApp sin envío ni errores nuevos.
  - Verificación: Playwright, Chrome DevTools y reporte de impacto.
  - Dependencias: C3.
  - Archivos probables: `app/e2e/responsive/enrollment-sheet-responsive.spec.ts`, `Docs/implementation-reports/2026-08-26-enrollment-sheet.md`.

## Checkpoint: Fase C

- [x] C1–C3 pasan pruebas automatizadas, lint, typecheck y build.
- [x] C4 completa Playwright y Chrome con login manual autorizado.
- [x] La spec coincide con el comportamiento y el reporte documenta privacidad, archivos, flujos y riesgos.

## Fase D: Código aleatorio y credencial QR

- [x] D1 — Probar y extraer el contrato de código aleatorio y QR.
  - Aceptación: genera exactamente 6 dígitos con fuente criptográfica, reintenta colisiones de forma acotada y el QR decodifica el mismo código sin PII.
  - Verificación: evidencia RED/GREEN con `npm run test:kiosk-code`.
  - Dependencias: spec aprobada.
  - Archivos probables: `app/tests/kiosk-code.test.ts`, `app/src/utils/kiosk-code.ts`, `app/package.json`.
- [x] D2 — Integrar credencial visual y regeneración ilimitada en Atletas.
  - Aceptación: tarjeta PNG con textos autorizados; candidato pendiente no se comparte; el código anterior permanece hasta guardar exitosamente.
  - Verificación: prueba enfocada, typecheck y revisión de accesibilidad/DOM.
  - Dependencias: D1.
  - Archivos probables: `app/src/components/kronos/KioskCredentialCard.vue`, `app/src/components/kronos/KioskCredentialDialog.vue`, `app/src/pages/atletas.vue`, `app/components.d.ts`.
- [x] D3 — Integrar lectura QR segura en Kiosco.
  - Aceptación: lector QR-only acepta seis dígitos, rechaza otros payloads, libera la cámara y conserva captura manual/productos.
  - Verificación: prueba enfocada, typecheck, lint y build.
  - Dependencias: D2.
  - Archivos probables: `app/src/components/kronos/BarcodeScanner.vue`, `app/src/pages/kiosco.vue`, `app/tests/kiosk-code.test.ts`.
- [x] D4 — Ejecutar QA responsive y flujo completo afectado.
  - Aceptación: Chrome pasa en `320/768/1024/1440`; valida PNG, regeneración, código anterior/nuevo, QR y fallback sin completar venta. Playwright se descubre y omite por la restricción aprobada de dispositivo único.
  - Verificación: Chrome en producción, cobertura Playwright descubierta y reporte de impacto.
  - Dependencias: D3 y autorización separada de despliegue para validar la versión publicada.
  - Archivos probables: `app/e2e/responsive/kiosk-credential-responsive.spec.ts`, `app/playwright.config.ts`, `Docs/implementation-reports/2026-08-26-kiosk-credential.md`.

## Checkpoint: Fase D

- [x] D1–D3 pasan pruebas automatizadas, reglas, lint enfocado, typecheck y build; el lint global conserva deuda previa documentada en el reporte.
- [x] D4 completa Chrome en la instancia autorizada y documenta la omisión de Playwright por seguridad de dispositivo.
- [x] La spec coincide con el comportamiento y el reporte documenta seguridad, archivos, flujos y riesgos residuales.

## Mejora Punto de Venta y Kiosco

- [x] PK0 — Autorizar la spec, registrar el plan y modelar amenazas.
  - Aceptación: alcance cerrado, Coach sin permisos implícitos, política fail-closed y despliegue/escrituras reales fuera de la autorización local.
  - Verificación: `specs/SPEC-store-kiosk-improvements.md` aprobada y plan actualizado.
  - Dependencias: Fase D.
  - Archivos: spec, `tasks/plan.md`, `tasks/todo.md`.
- [x] PK1 — Probar e implementar contratos puros de acceso, catálogo, ganancia y política.
  - Aceptación: Coach no es Admin y empieza vacío; sólo stock activo mayor a cero se ofrece; ganancia usa snapshots y excluye canceladas; política inválida niega acceso.
  - Verificación: prueba RED/GREEN enfocada.
  - Dependencias: PK0.
  - Archivos probables: `app/tests/store-kiosk-improvements.test.ts`, `app/src/types/access.ts`, `app/src/types/domain.ts`, `app/src/utils/store-kiosk.ts`, `app/package.json`.
- [x] PK2 — Integrar Coach y configuración de Kiosco para Admin.
  - Aceptación: se puede guardar Coach sin permisos; Admin asigna permisos después; configuración valida modos y sólo UIDs de Admin habilitados.
  - Verificación: pruebas de reglas y flujo de formulario sin escribir datos reales.
  - Dependencias: PK1.
  - Archivos probables: `app/src/pages/usuarios.vue`, servicio/store de configuración, `app/database.rules.json`, pruebas de reglas.
- [x] PK3 — Corregir y completar Punto de Venta.
  - Aceptación: `Cobro` permanece visible y reiniciado al vaciar carrito; selector omite stock cero; Admin ve ganancia bruta de toda venta no cancelada.
  - Verificación: prueba enfocada, DOM/responsive y consola limpia.
  - Dependencias: PK1.
  - Archivos probables: `app/src/pages/tienda.vue`, utilidad y prueba enfocada.
- [x] PK4 — Actualizar identificación y cierre del Kiosco.
  - Aceptación: QR inicia al continuar, código manual es secundario, `Pagar ahora` respeta la política tras verificar Admin y éxito vuelve al inicio en 5 segundos.
  - Verificación: prueba enfocada, flujo local y liberación de cámara.
  - Dependencias: PK1 y PK2.
  - Archivos probables: `app/src/pages/kiosco.vue`, store/utilidad de política y prueba enfocada.
- [x] PK5 — Ejecutar gates y entregar evidencia.
  - Aceptación: reglas, pruebas, typecheck, lint enfocado y build pasan; Chrome cubre el flujo publicado cuando se autorice despliegue; reporte incluye árbol, diagrama, flujos y riesgos.
  - Verificación: comandos del repositorio, revisión de cinco ejes y reporte de impacto.
  - Dependencias: PK2–PK4.
  - Archivos probables: `app/e2e/responsive/store-kiosk-improvements.spec.ts`, `Docs/implementation-reports/`.

## Checkpoint: Mejora Punto de Venta y Kiosco

- [x] PK1–PK4 cumplen los 13 criterios de aceptación sin dependencias nuevas; el temporizador de éxito se verificó por contrato automatizado para respetar la prohibición de crear ventas durante QA.
- [x] Reglas y controles de cliente niegan por defecto configuraciones ausentes o inválidas.
- [x] PK5 documenta QA local y publicada, incluida la matriz responsive autenticada y el límite de no completar ventas.

## Iniciativa: Control administrativo y trazabilidad

- [x] CAT0 — Autorizar el mapa, crear las siete specs y registrar el plan.
  - Aceptación: módulos, dependencias, decisiones, riesgos y gates están documentados con estado aprobado para planificación.
  - Verificación: revisión documental de `specs/CAPABILITY-MAP.md`, siete `SPEC-*.md`, `tasks/plan.md` y este checklist.
  - Archivos: documentación únicamente.
- [x] CAT1 — Autorizar el plan completo y preservar la spec de reportes.
  - Aceptación: esquema/reglas locales autorizados; datos reales y despliegue prohibidos; `reporting-contracts` queda aprobado y bloqueado sólo por el gate de esta iniciativa.
  - Verificación: `specs/SPEC-reporting-contracts.md`, plan y capability map coinciden.
  - Archivos: documentación únicamente.

### Store Payment Corrections

- [x] SC1 — Probar y construir el contrato de pagos efectivos.
  - Aceptación: reverso aporta cero; cambio de método conserva importe; orden y redondeo son deterministas; doble reverso se rechaza.
  - Verificación: RED confirmado por módulo ausente; GREEN 5/5 con el preload local, más typecheck.
  - Dependencias: CAT0 y aprobación del plan.
  - Archivos probables: `app/src/types/domain.ts`, `app/src/utils/store-payment-adjustments.ts`, `app/tests/store-payment-corrections.test.ts`.
- [x] SC2 — Persistir ajustes append-only con reglas fail-closed.
  - Aceptación: sólo permiso autorizado crea ajustes; motivo/actor/fecha son obligatorios; ajuste no se edita/elimina; grupo se escribe atómicamente.
  - Verificación: 7/7 pruebas de dominio, 40/40 reglas y typecheck; conciliación de saldo en escritura multipath.
  - Dependencias: SC1 y autorización local de esquema/reglas.
  - Archivos probables: `app/src/services/sales.service.ts`, `app/database.rules.json`, `app/tests/database.rules.test.mjs`.

#### Checkpoint SC-A

- [x] Contratos y reglas pasan antes de integrar UI; no hay writes remotos ni migración.

- [x] SC3 — Integrar corrección individual y grupal en Tienda.
  - Aceptación: Admin selecciona pago/grupo, acción, método y motivo; previsualiza efecto; conflicto no deja escrituras parciales.
  - Verificación: prueba enfocada, typecheck y revisión DOM/teclado.
  - Dependencias: SC2.
  - Archivos probables: `app/src/components/kronos/StorePaymentCorrectionDialog.vue`, `app/src/pages/tienda.vue`, `app/src/stores/commerce.ts`.
- [x] SC4 — Adoptar pagos efectivos en saldos, recibos y finanzas.
  - Aceptación: Tienda, PDF y movimientos financieros reconcilian; originales siguen visibles; comprobante identifica corrección.
  - Verificación: pruebas de correcciones, `npm run test:finance` y regresión de recibos/notificaciones.
  - Dependencias: SC3.
  - Archivos probables: `app/src/utils/kronos.ts`, `app/src/utils/receipts.ts`, `app/src/utils/financial-reports.ts`, `app/tests/store-payment-corrections.test.ts`.
- [x] SC5 — Ejecutar QA completo de correcciones.
  - Aceptación: cobro individual y conjunto recorren corrección/reverso, deuda reactivada y comprobante; consola/red sin errores nuevos.
  - Verificación: typecheck, build, reglas, Chrome, Playwright `320/768/1024/1440` y reporte.
  - Dependencias: SC4 y autorización de login/escrituras QA aisladas.
  - Archivos probables: `app/e2e/responsive/store-payment-corrections-responsive.spec.ts`, `Docs/implementation-reports/2026-09-24-store-payment-corrections.md`.

#### Checkpoint SC-B

- [x] Un cobro corregido conserva auditoría y todos los consumidores muestran el mismo saldo.

### Store Debt Statement

- [x] SD1 — Probar y construir el estado de cuenta puro de tienda.
  - Aceptación: uno/varios/todos los adeudos del mismo atleta; excluye mensualidad, visitas, canceladas y saldo cero; totales reconcilian a $0.01.
  - Verificación: RED/GREEN con `npx tsx --test tests/store-debt-statement.test.ts`.
  - Dependencias: SC4.
  - Archivos probables: `app/src/utils/store-debt-statement.ts`, `app/src/utils/receipts.ts`, `app/tests/store-debt-statement.test.ts`.
- [x] SD2 — Integrar selección y vista previa en Tienda.
  - Aceptación: seleccionar uno, varios o todos; descargar/imprimir/compartir manual; acción deshabilitada sin deuda.
  - Verificación: prueba enfocada, teclado, typecheck y build.
  - Dependencias: SD1.
  - Archivos probables: `app/src/components/kronos/StoreDebtStatementDialog.vue`, `app/src/pages/tienda.vue`.
- [x] SD3 — Validar PDF y responsive del estado de cuenta.
  - Aceptación: PDF legible, sin mensualidad ni PII no solicitada; cuatro viewports y flujo Chrome completos.
  - Verificación: Chrome, Playwright y reporte de impacto.
  - Dependencias: SD2.
  - Archivos probables: `app/e2e/responsive/store-debt-statement-responsive.spec.ts`, `Docs/implementation-reports/2026-09-24-store-debt-statement.md`.

### Membership Advance Payments

- [x] MA1 — Probar fechas de corte y clasificación de adelantos.
  - Aceptación: estados advance/pending/overdue/paid; meses 28–31 correctos; reloj y zona horaria inyectables.
  - Verificación: RED/GREEN con `npx tsx --test tests/membership-advance-payments.test.ts`.
  - Dependencias: CAT0 y aprobación del plan.
  - Archivos probables: `app/src/utils/membership-periods.ts`, `app/tests/membership-advance-payments.test.ts`, `app/src/types/domain.ts`.
- [x] MA2 — Abrir periodos futuros con snapshot inmutable.
  - Aceptación: hasta 12 meses, un periodo por operación, parcial/completo; plan/precio/día posteriores no alteran el periodo.
  - Verificación: prueba de servicio y typecheck.
  - Dependencias: MA1 y autorización local de esquema/reglas si el snapshot lo requiere.
  - Archivos probables: `app/src/services/payments.service.ts`, `app/src/stores/payments.ts`, `app/tests/membership-advance-payments.test.ts`.
- [x] MA3 — Integrar selector, estados y recibo de adelanto.
  - Aceptación: UI explica periodo/corte; historial y PDF dicen Adelantado; dashboard/recordatorios no marcan mora prematura.
  - Verificación: pruebas enfocadas y regresión de notificaciones/finanzas.
  - Dependencias: MA2.
  - Archivos probables: `app/src/components/kronos/MembershipPaymentDialog.vue`, `app/src/pages/pagos.vue`, `app/src/utils/receipts.ts`, `app/src/utils/payment-notification.ts`.
- [x] MA4 — Ejecutar QA completo de adelantos.
  - Aceptación: parcial y total antes del corte, periodo futuro, recibo y alertas correctas; consola limpia.
  - Verificación: pruebas, typecheck, build, Chrome, Playwright y reporte.
  - Dependencias: MA3 y autorización de login/write QA aislado.
  - Archivos probables: `app/e2e/responsive/membership-advance-responsive.spec.ts`, `Docs/implementation-reports/2026-09-24-membership-advance-payments.md`.

### Athlete Lifecycle Statuses

- [x] AL1 — Probar el contrato de transiciones de atleta.
  - Aceptación: sólo transiciones autorizadas; Pausa/Baja separadas; motivo y fechas válidos; histórico legado marcado parcial.
  - Verificación: RED/GREEN con `npx tsx --test tests/athlete-lifecycle.test.ts`.
  - Dependencias: CAT0 y aprobación del plan.
  - Archivos probables: `app/src/types/domain.ts`, `app/src/utils/athlete-lifecycle.ts`, `app/tests/athlete-lifecycle.test.ts`.
- [x] AL2 — Persistir estado y evento en una operación atómica.
  - Aceptación: precondición de estado, actor/fecha servidor, idempotencia; eventos no editables/eliminables.
  - Verificación: prueba de servicio y `npm run test:rules`.
  - Dependencias: AL1 y autorización local de esquema/reglas.
  - Archivos probables: `app/src/services/athletes.service.ts`, `app/src/services/athlete-lifecycle.service.ts`, `app/database.rules.json`, `app/tests/database.rules.test.mjs`.
- [x] AL3 — Integrar Pausa, Baja y Reactivación en Atletas.
  - Aceptación: diálogo específico, fecha esperada sólo para Pausa, historial visible y confirmación accesible.
  - Verificación: prueba enfocada, teclado, typecheck y build.
  - Dependencias: AL2.
  - Archivos probables: `app/src/components/kronos/AthleteStatusDialog.vue`, `app/src/pages/atletas.vue`, `app/src/stores/athletes.ts`.
- [x] AL4 — Adoptar estados en Kiosco, cobranza y Comunidad.
  - Aceptación: pausados/bajas no ingresan ni generan obligación nueva; Comunidad incluye pausados y excluye bajas; adeudos previos se conservan.
  - Verificación: regresiones de Kiosco, pagos, dashboard y Comunidad.
  - Dependencias: AL3.
  - Archivos probables: `app/src/pages/kiosco.vue`, `app/src/pages/dashboard.vue`, `app/src/pages/comunidad.vue`, `app/src/components/kronos/MembershipPaymentDialog.vue`.
- [x] AL5 — Ejecutar QA completo de ciclo de vida.
  - Aceptación: Activo→Pausa→Activo y Activo/Pausa→Baja funcionan, persisten y no crean eventos dobles.
  - Verificación: reglas, typecheck, build, Chrome, Playwright y reporte.
  - Dependencias: AL4 y autorización de login/write QA aislado.
  - Archivos probables: `app/e2e/responsive/athlete-lifecycle-responsive.spec.ts`, `Docs/implementation-reports/2026-09-24-athlete-lifecycle.md`.

#### Checkpoint AA

- [x] Adelantos no generan morosidad prematura y los tres estados de atleta se respetan en el flujo completo.

### Inventory Reconciliation

- [x] IR1 — Probar contratos de cierre y resolución.
  - Aceptación: stock antes/conteo/variación exactos; resolución parcial acotada; reintentos idempotentes.
  - Verificación: RED/GREEN con `npx tsx --test tests/inventory-reconciliation.test.ts`.
  - Dependencias: CAT0 y aprobación del plan.
  - Archivos probables: `app/src/types/domain.ts`, `app/src/utils/inventory-reconciliation.ts`, `app/tests/inventory-reconciliation.test.ts`.
- [x] IR2 — Finalizar cierre y stock mediante actualización atómica.
  - Aceptación: todos los productos se actualizan o ninguno; stock concurrente diferente rechaza; cierre finalizado es inmutable.
  - Verificación: pruebas de servicio y `npm run test:rules`.
  - Dependencias: IR1 y autorización local de esquema/reglas.
  - Archivos probables: `app/src/services/closures.service.ts`, `app/database.rules.json`, `app/tests/database.rules.test.mjs`, `app/tests/inventory-reconciliation.test.ts`.
- [x] IR3 — Persistir resoluciones y recuperaciones.
  - Aceptación: found ajusta stock una vez; covered registra ingreso; written-off no crea gasto de caja; pendientes parciales reconcilian.
  - Verificación: prueba enfocada y `npm run test:finance`.
  - Dependencias: IR2.
  - Archivos probables: `app/src/services/inventory-resolutions.service.ts`, `app/src/utils/financial-reports.ts`, `app/src/stores/closures.ts`, `app/tests/inventory-reconciliation.test.ts`.
- [x] IR4 — Integrar borrador, finalización y resolución en Cierres.
  - Aceptación: resumen previo, confirmación irreversible, historial y diálogo de resolución accesibles.
  - Verificación: DOM/teclado, typecheck y build.
  - Dependencias: IR3.
  - Archivos probables: `app/src/pages/cierres.vue`, `app/src/components/kronos/InventoryResolutionDialog.vue`, `app/src/stores/closures.ts`.
- [x] IR5 — Ejecutar QA de dos cierres consecutivos.
  - Aceptación: 10→8 y después 8→6 producen -2 y -2; resolución no duplica movimientos; consola limpia.
  - Verificación: reglas, pruebas, Chrome, Playwright y reporte.
  - Dependencias: IR4 y autorización de writes QA aislados.
  - Archivos probables: `app/e2e/responsive/inventory-reconciliation-responsive.spec.ts`, `Docs/implementation-reports/2026-09-24-inventory-reconciliation.md`.

#### Checkpoint IR

- [x] El conteo físico es el nuevo stock y cada diferencia permanece trazable sin acumulación artificial.

### Workforce Payroll

- [x] WF1 — Probar contratos de tarifas, trabajo y liquidación.
  - Aceptación: snapshots de tarifa, centavos, duplicado diario de limpieza y selección de líneas se resuelven determinísticamente.
  - Verificación: RED/GREEN con `npx tsx --test tests/workforce-payroll.test.ts`.
  - Dependencias: CAT0 y aprobación del plan.
  - Archivos probables: `app/src/types/workforce.ts`, `app/src/utils/workforce-payroll.ts`, `app/tests/workforce-payroll.test.ts`.
- [x] WF2 — Persistir empleados y permisos Admin-only.
  - Aceptación: catálogo, historial de tarifa y vínculo opcional a usuario; no guarda datos bancarios; reglas niegan no Admin.
  - Verificación: pruebas de servicio y `npm run test:rules`.
  - Dependencias: WF1 y autorización local de esquema/reglas.
  - Archivos probables: `app/src/services/employees.service.ts`, `app/src/types/access.ts`, `app/database.rules.json`, `app/tests/database.rules.test.mjs`.
- [x] WF3 — Registrar trabajo y aprobaciones.
  - Aceptación: clases múltiples, limpieza diaria, tarifa congelada, estados pending/approved y corrección auditada.
  - Verificación: prueba enfocada y typecheck.
  - Dependencias: WF2.
  - Archivos probables: `app/src/services/work-entries.service.ts`, `app/src/stores/workforce.ts`, `app/src/components/kronos/WorkEntryDialog.vue`, `app/tests/workforce-payroll.test.ts`.
- [x] WF4 — Liquidar trabajo y crear un egreso idempotente.
  - Aceptación: sólo mismo empleado/no pagadas; método/folio correctos; reintento no duplica egreso; pagadas no se eliminan.
  - Verificación: prueba enfocada, reglas y `npm run test:finance`.
  - Dependencias: WF3.
  - Archivos probables: `app/src/services/payroll-settlements.service.ts`, `app/src/services/expenses.service.ts`, `app/src/components/kronos/PayrollSettlementDialog.vue`, `app/tests/workforce-payroll.test.ts`.
- [x] WF5 — Integrar el módulo Empleados y sus totales.
  - Aceptación: ruta/nav Admin-only, catálogo, trabajo, filtros y devengado/pagado/pendiente accesibles y responsive.
  - Verificación: DOM/teclado, typecheck y build.
  - Dependencias: WF4.
  - Archivos probables: `app/src/pages/empleados.vue`, `app/src/plugins/router/routes.ts`, `app/src/layouts/components/NavItems.vue`, `app/src/stores/workforce.ts`.
- [x] WF6 — Ejecutar QA completo de empleado a egreso.
  - Aceptación: alta → clases/días → aprobación → liquidación → egreso; sin duplicados ni PII innecesaria.
  - Verificación: reglas, pruebas, Chrome, Playwright y reporte.
  - Dependencias: WF5 y autorización de login/write QA aislado.
  - Archivos probables: `app/e2e/responsive/workforce-payroll-responsive.spec.ts`, `Docs/implementation-reports/2026-09-24-workforce-payroll.md`.

#### Checkpoint WF

- [x] Cada liquidación crea exactamente un egreso y los acumulados reconcilian a $0.01.

### Birthday Outreach Card

- [x] BD1 — Probar cola anual y persistir estado de felicitación.
  - Aceptación: próximo, hoy y vencido pendiente; año independiente; pausados incluidos, bajas excluidas; reglas mínimas.
  - Verificación: RED/GREEN y `npm run test:rules`.
  - Dependencias: AL5 y autorización local de esquema/reglas.
  - Archivos probables: `app/src/utils/birthday-greetings.ts`, `app/src/services/birthday-greetings.service.ts`, `app/tests/birthday-outreach.test.ts`, `app/database.rules.json`.
- [x] BD2 — Integrar pendientes y confirmación en Comunidad.
  - Aceptación: vencidos no desaparecen; marcar/desmarcar confirma y audita; estados vacío/carga/error accesibles.
  - Verificación: prueba enfocada, typecheck y DOM/teclado.
  - Dependencias: BD1.
  - Archivos probables: `app/src/pages/comunidad.vue`, `app/src/stores/birthday-greetings.ts`, `app/src/components/kronos/BirthdayGreetingList.vue`.
- [x] BD3 — Diseñar y generar la plantilla maestra de felicitación.
  - Aceptación: asset original aprobado, 1080×1080, zona segura para nombre, sin PII; render canvas determinista.
  - Verificación: inspección visual, prueba de dimensiones/nombre largo y descarga PNG.
  - Ajuste final: paleta y logo oficiales proporcionados por Kronos, copy aprobado y versión `kronos-athlete-v2`; Chrome sin errores de consola.
  - Dependencias: BD2 y revisión visual del diseño generado con `imagegen`.
  - Archivos probables: `app/src/assets/images/birthday-card-template.png`, `app/src/utils/birthday-card.ts`, `app/tests/birthday-outreach.test.ts`.
- [x] BD4 — Integrar tarjeta, descarga, compartir y QA.
  - Aceptación: vista previa, descarga y Web Share/WhatsApp manual; no envía automáticamente; cuatro viewports y consola limpia.
  - Verificación: typecheck, build, Chrome, Playwright, evidencia PNG y reporte.
  - Dependencias: BD3 y autorización de login QA.
  - Archivos probables: `app/src/components/kronos/BirthdayCardDialog.vue`, `app/src/pages/comunidad.vue`, `app/e2e/responsive/birthday-outreach-responsive.spec.ts`, `Docs/implementation-reports/2026-09-24-birthday-outreach-card.md`.

#### Checkpoint BD

- [x] Ningún cumpleaños pendiente desaparece y la tarjeta descargable no contiene edad, teléfono ni fecha completa.

## Gate antes de Reportes

- [x] SC, MA, AL, IR y WF están cerrados localmente con contratos auditables.
- [x] `reporting-contracts` permanece autorizado y queda listo para implementar con los contratos finales.
- Evidencia de cierre: 34/34 pruebas funcionales enfocadas, 44/44 reglas, lint de errores, typecheck, build y auditoría de producción sin vulnerabilidades; Chrome recorrió cobro→corrección→reverso, estado de cuenta, adelanto y recibo, Pausa→Activo, inventario, nómina→egreso y felicitación; matriz responsive 320/768/1024/1440 sin desbordamiento global.
- Despliegue: Hosting y reglas de Realtime Database publicados el 2026-09-24 en `kronos-training-fd5e5`; validación productiva de sólo lectura con registro QA y consola limpia; sin migración ni modificación manual de datos reales.

---

# Módulo de Reportes

Estado: Fase 1 completada y verificada localmente; Fase 2 autorizada el 2026-09-25 según `specs/SPEC-reporting-phase-2-access-shell.md`. El spec `specs/SPEC-reporting-contracts.md` permanece aprobado. Ninguna tarea autoriza migraciones, datos reales o despliegue.

## Gate de planificación

- [x] RP0 — Revisar capability map, spec, plan/tareas previos y reporte administrativo.
  - Aceptación: dependencias auditables confirmadas; límites de privacidad y semántica financiera reflejados; fases pequeñas con gates y rollback documentados.
  - Verificación: revisión cruzada de `specs/CAPABILITY-MAP.md`, `specs/SPEC-reporting-contracts.md`, `tasks/plan.md`, `tasks/todo.md` y `Docs/implementation-reports/2026-09-24-control-administrativo-trazabilidad.md`.
  - Dependencias: gate administrativo cerrado.
  - Archivos: documentación únicamente.

## Fase 1 — Contratos semánticos y cálculos puros

Estado: completada con autorización del usuario el 2026-09-24.

- [x] RP1 — Definir tipos, periodos, filtros y diccionario de métricas.
  - Descripción: crear el vocabulario único de Reportes, rangos día/semana/mes/trimestre/año/personalizado, comparación anterior/interanual, filtros serializables y etiquetas de calidad.
  - Aceptación: periodos respetan `America/Mexico_City`; filtro de productos vacío significa todos; cada métrica declara unidad, fecha de atribución, definición y calidad.
  - Verificación: RED/GREEN con `npx tsx --test tests/reporting-contracts.test.ts`; revisión de casos límite de zona, fin de mes/año y URL round-trip.
  - Dependencias: RP0 y autorización de Fase 1.
  - Archivos: `app/src/types/reporting.ts`, `app/src/utils/reporting-periods.ts`, `app/src/utils/reporting-metrics.ts`, `app/tests/reporting-contracts.test.ts`.
  - Alcance estimado: M (4 archivos).

- [x] RP2 — Probar proyección de Tienda y mensualidades.
  - Descripción: calcular unidades, venta bruta, costo histórico, utilidad/margen bruto, cobrado, recuperado, saldo/cartera, cancelaciones y mensualidades esperado/cobrado/vencido/adelantado/pendiente desde ventas y pagos efectivos.
  - Aceptación: uno/varios/todos los productos afectan sólo partidas seleccionadas; pagos multi-producto se asignan proporcionalmente con residuo determinista y etiqueta; detalle y KPI concilian a $0.01 sin confundir devengo con caja.
  - Verificación: RED/GREEN con fixtures de crédito parcial, cobro grupal, reverso, cambio de método, cancelación, adelanto y corte temporal.
  - Dependencias: RP1.
  - Archivos: `app/src/utils/reporting-store.ts`, `app/src/utils/reporting-memberships.ts`, `app/tests/reporting-store.test.ts`, `app/tests/reporting-operational.test.ts`.
  - Alcance estimado: M (4 archivos).

- [x] RP3 — Probar proyección de Atletas e inventario.
  - Descripción: calcular estados y evolución por año/mes/día desde eventos de ciclo de vida, y diferencias/resoluciones de inventario desde cierres finalizados.
  - Aceptación: activos, pausados, bajas, altas y reactivaciones derivan de eventos; legado insuficiente se marca parcial/no disponible; diferencias, encontrados, cubiertos y fondo perdido conservan su significado y concilian con el detalle.
  - Verificación: RED/GREEN con eventos completos/legados y cierres consecutivos 10→8→6 con resoluciones parciales.
  - Dependencias: RP1.
  - Archivos: `app/src/utils/reporting-athletes.ts`, `app/src/utils/reporting-inventory.ts`, `app/tests/reporting-operational.test.ts`.
  - Alcance estimado: M (4 archivos).

- [x] RP4 — Probar proyección de Personal, egresos, flujo y conciliación.
  - Descripción: calcular trabajo devengado/pagado/pendiente y separar ingresos reconocidos, cobros, egresos, flujo por cuenta y diferencias de cierre.
  - Aceptación: liquidación produce pago y egreso enlazados sin duplicar; flujo usa movimientos efectivos por método/cuenta; la salida no expone teléfono/contacto ni llama utilidad neta a un resultado incompleto.
  - Verificación: RED/GREEN con trabajo pendiente/aprobado/pagado, egresos pagados/pendientes y cierres con/sin diferencia; `npm run test:finance`.
  - Dependencias: RP1.
  - Archivos: `app/src/utils/reporting-workforce.ts`, `app/src/utils/reporting-finance.ts`, `app/tests/reporting-operational.test.ts`, `app/tests/reporting-finance.test.ts`, `app/src/utils/financial-reports.ts` (lectura, sin cambios).
  - Alcance estimado: M (5 archivos).

### Checkpoint R1 — Fundamentos auditables

- [x] Reporting 13/13 y regresión financiera 4/4 pasan; typecheck, lint focalizado y build pasan.
- [x] Cálculos puros concilian importes por detalle, exponen calidad y no infieren obligación/vencimiento para legado sin total y snapshot.
- [x] No hay Firebase, reglas, UI, datos reales ni despliegue en esta fase.
- [x] Fase 2: usuario autorizó `reports`, la validación de su booleano y lecturas condicionadas a permisos fuente; no se amplían expresiones `.read` de colecciones.

## Fase 2 — Adaptador canónico, permiso y shell

Estado: completada y verificada localmente el 2026-09-25. El permiso `reports` no concede lecturas de fuentes; no se ampliaron expresiones `.read` de colecciones de negocio.

- [x] RP5 — Implementar adaptador canónico de sólo lectura.
  - Descripción: cargar las colecciones auditables existentes y proyectarlas al dataset mínimo de Reportes sin PII excluida ni cálculos en la UI.
  - Aceptación: origen intercambiable detrás de una interfaz; estados carga/error/vacío distinguibles; no lee admisión, salud, teléfonos, secretos ni escribe Firebase.
  - Verificación: pruebas con adaptador fake, fallos parciales y dataset vacío; typecheck.
  - Dependencias: Checkpoint R1 y autorización de Fase 2.
  - Archivos probables: `app/src/services/reporting.service.ts`, `app/src/stores/reporting.ts`, `app/src/types/reporting.ts`, `app/tests/reporting-service.test.ts`.
  - Alcance estimado: M (4 archivos).

- [x] RP6 — Añadir permiso, reglas, ruta y shell de Reportes.
  - Descripción: incorporar `reports` como permiso independiente, mantener finanzas/inventario/personal Admin-only y crear la página base con filtros restaurables en URL.
  - Aceptación: no Admin con `reports` sólo accede al subconjunto autorizado; pruebas negativas bloquean datos Admin-only; ruta/nav y carga/error/vacío son accesibles.
  - Verificación: `npm run test:rules`, prueba de permisos/router, typecheck, build y Chrome del acceso permitido/denegado.
  - Dependencias: RP5 y autorización explícita de cambio de reglas/permisos.
  - Archivos probables: `app/src/types/access.ts`, `app/database.rules.json`, `app/tests/database.rules.test.mjs`, `app/src/plugins/router/routes.ts`, `app/src/pages/reportes.vue`.
  - Alcance estimado: M (5 archivos; navegación se integra en tarea separada si excede este límite).

### Checkpoint R2 — Acceso seguro

- [x] Reglas permiten Reportes operativos y niegan finanzas/inventario/personal a no Admin (45/45).
- [x] Filtros se comparten/restauran desde URL; Chrome confirmó estado vacío y filtro de producto en URL.
- [x] No se migran permisos existentes ni se despliegan reglas.
- [x] Configuración del emulador y helper usan el mismo namespace local; config 2/2 y helper 7/7.
- [x] Typecheck/build pasan; Chrome sin errores de consola, con warnings de accesibilidad documentados en el reporte.

## Fase 3 — Resumen ejecutivo y Tienda

Estado: implementación y recorrido funcional Chrome terminados el 2026-09-25 con fixture sintética, aislada y no persistente. Spec aprobada: `specs/SPEC-reporting-phase-3-executive-store.md`. Sin cambios de esquema, reglas, permisos, escrituras, migraciones ni despliegue.

- [x] RP7 — Construir resumen ejecutivo y filtros globales.
  - Descripción: presentar KPIs generales y tendencias con periodo, producto, atleta, estado y método de pago compartidos por todas las vistas.
  - Aceptación: definiciones/calidad visibles; comparación anterior/interanual consistente; cada KPI/gráfica abre su dominio preservando filtros.
  - Verificación: pruebas de componentes/DOM, typecheck, build y Chrome en flujo resumen→dominio.
  - Dependencias: Checkpoint R2; autorización recibida el 2026-09-25.
  - Archivos probables: `app/src/components/kronos/reports/ReportFilters.vue`, `app/src/components/kronos/reports/ReportKpiCard.vue`, `app/src/components/kronos/reports/ExecutiveOverview.vue`, `app/src/pages/reportes.vue`, `app/tests/reporting-ui.test.ts`.
  - Alcance estimado: M (5 archivos).

- [x] RP8 — Construir reporte Tienda con drill-down.
  - Descripción: visualizar artículos, ingresos reconocidos, costo, utilidad bruta, cobros, recuperaciones y cartera, con detalle de partidas/ventas/pagos.
  - Aceptación: multi-producto correcto; asignación proporcional señalada; navegación KPI/gráfica→tabla→registro preserva filtros y suma a $0.01.
  - Verificación: pruebas UI con crédito/reverso/cancelación, Chrome del flujo completo y Playwright en cuatro viewports.
  - Dependencias: RP7.
  - Archivos probables: `app/src/components/kronos/reports/StoreReport.vue`, `app/src/components/kronos/reports/ReportChart.vue`, `app/src/components/kronos/reports/ReportDetailTable.vue`, `app/src/pages/reportes.vue`, `app/e2e/responsive/reporting-responsive.spec.ts`.
  - Alcance estimado: M (5 archivos).

### Checkpoint R3 — Ejecutivo y Tienda

- [x] Chrome: fixture en memoria → KPI Cobrado → tabla → registro → filtro por método → volver y restaurar por URL; sin escrituras ni PII.
- [x] Chrome responsive: 320/768/1024/1440 px, sin overflow horizontal; consola sin nuevos error/warn.
- [ ] Playwright responsive: 0/4. La sesión llegó a Atletas, pero el guard redirigió al Dashboard al pedir Reportes. Auth-setup ahora valida Reportes + fixture Admin-only antes de guardar; login manual debe usar el perfil QA con ese acceso. IndexedDB permanece en ruta local ignorada; nunca inspeccionar ni abrir permisos/reglas para forzar el paso.

- [ ] KPIs, gráficas, tablas y registros concilian a $0.01 para todos/uno/varios productos.
- [x] Conciliación de proyecciones a centavos cubierta por pruebas de contratos (39/39 reporting y 4/4 finanzas).
- [x] Chrome DOM/funcionalidad y consola revisados. Lighthouse accesibilidad 84/100; cuatro hallazgos en shell compartido fuera del alcance Fase 3 (avatar ARIA, tooltip, botón encabezado y lista de navegación), documentados en reporte.

## Fase 4 — Atletas y mensualidades

Estado: autorizada por el usuario el 2026-09-25 para implementación local de RP9.1–RP9.4. Spec: `specs/SPEC-reporting-phase-4-athletes-memberships.md`. Playwright de R3 permanece anotado como limitación aceptada para continuar; no se cambian permisos.

- [x] RP9.1 — Añadir proyección allowlisted de pagos y filtros de estado por dominio.
  - Aceptación: membresías sólo para Admin; PII/campos libres excluidos; estado atleta y estado mensualidad serializan/restauran sin colisión.
  - Verificación: TDD de servicio, permisos, filtros y round-trip URL.
  - Archivos probables: `app/src/types/reporting.ts`, `app/src/utils/reporting-periods.ts`, `app/src/services/reporting.service.ts`, `app/src/services/reporting.firebase.ts`, `app/tests/reporting-service.test.ts` (dividir en rebanadas ≤5 archivos).
  - Alcance estimado: M.
  - Resultado: pagos proyectados por allowlist, fuente `memberships` sólo Admin y filtros `athleteStatus`/`membershipStatus` independientes con round-trip URL. RED confirmado y 21/21 pruebas focalizadas en verde.
- [x] RP9.2 — Implementar reporte de Atletas con evolución y drill-down.
  - Aceptación: activos/pausados/bajas al corte; altas/pausas/bajas/reactivaciones por fecha efectiva y día/mes/año; legado parcial/no disponible; sin PII.
  - Verificación: pruebas de contrato/UI, typecheck y Chrome resumen→evento→registro.
  - Archivos probables: `app/src/components/kronos/reports/AthletesReport.vue`, `app/src/pages/reportes.vue`, `app/src/components/kronos/reports/ReportDetailTable.vue`, `app/tests/reporting-operational.test.ts`, `app/tests/reporting-ui.test.ts`.
  - Alcance estimado: M.
- [x] RP9.3 — Implementar reporte de mensualidades.
  - Aceptación: esperado/cobrado/vencido/adelantado/pendiente respetan snapshot, fecha efectiva, corte y filtro de método; detalle concilia a $0.01; legado no se estima.
  - Verificación: casos de parcial, adelanto anterior al vencimiento, mora y campos desconocidos; Chrome KPI→pago→registro.
  - Archivos probables: `app/src/components/kronos/reports/MembershipsReport.vue`, `app/src/pages/reportes.vue`, `app/src/components/kronos/reports/ReportDetailTable.vue`, `app/tests/reporting-operational.test.ts`, `app/tests/reporting-ui.test.ts`.
  - Alcance estimado: M.
- [x] RP9.4 — Cerrar checkpoint R4.
  - Aceptación: acceso, filtros URL, estados vacíos/parciales, consola/red/DOM/accesibilidad y viewports comprobados; no escritura/migración/despliegue.
  - Verificación: reporting + finanzas, typecheck, build, lint focalizado, Chrome con login manual y Playwright responsive si el perfil QA autorizado está disponible; limitaciones se reportan, no se fuerza permiso.
  - Archivos probables: `app/e2e/responsive/reporting-responsive.spec.ts`, `tasks/todo.md`, `tasks/plan.md`, reporte de implementación Fase 4.
  - Alcance estimado: S.
  - Resultado: 38/38 pruebas reporting/finanzas, typecheck, lint focalizado y build correctos. Chrome autenticado completó ambos recorridos, URL restaurable, consola limpia y 320/768/1024/1440 sin overflow. Playwright 0/4: su estado aislado llegó a login; limitación documentada sin copiar sesión ni relajar permisos.

### Checkpoint R4 — Atletas y mensualidades

- [x] Cortes día/mes/año y eventos completos/legados muestran cifras y calidad correctas.
- [x] Chrome cubre resumen/evolución→tabla→registro sin exponer admisión, salud ni teléfono.
- [x] Atletas respeta permisos fuente; pagos siguen Admin-only; no hay cambios de reglas/esquema.
- [x] Suite, build, Chrome y matriz responsive (con limitación del perfil Playwright documentada) quedan reportados.

## Fase 5 — Inventario y personal

Estado: implementada y verificada localmente el 2026-09-25. Admin-only, sin esquema/reglas/escrituras reales/despliegue.

- [x] RP10.1 — Integrar fuentes allowlisted, acceso y filtros de Inventario/Personal.
  - Descripción: suscribir cierres/resoluciones y trabajo/liquidaciones sólo para Admin; añadir filtros de producto, empleado, estado y clase de resolución con URL restaurable.
  - Aceptación: no se lee `employees`; no Admin con `reports` no abre fuentes; proyecciones omiten contacto/texto libre/actores; parámetros no colisionan con fases previas.
  - Verificación: RED/GREEN en `reporting-contracts`, `reporting-service` y `reporting-operational`.
  - Dependencias: Checkpoint R4 y autorización de Fase 5.
  - Archivos probables: tipos, periodos, servicio Firebase/servicio, store y pruebas, en rebanadas de máximo cinco archivos.
  - Alcance estimado: M por rebanada.
- [x] RP10.2 — Construir reporte de Inventario con drill-down.
  - Descripción: presentar diferencia por cierre y resoluciones por su fecha efectiva hasta el registro auditable.
  - Aceptación: `covered` es recuperación/caja; `found` no es caja; `written-off` no es egreso; `corrected` no infla KPI; detalle concilia a $0.01.
  - Verificación: RED/GREEN operacional/UI y Chrome KPI→resolución.
  - Dependencias: RP10.1.
  - Archivos probables: `reporting-inventory.ts`, `InventoryReport.vue`, `ReportDetailTable.vue`, `reportes.vue`, pruebas.
  - Alcance estimado: M (máximo 5 archivos por incremento).
- [x] RP10.3 — Construir reporte de Personal con drill-down.
  - Descripción: presentar devengado, pagado y pendiente al corte desde snapshots de trabajo/liquidación.
  - Aceptación: una línea pagada suma una vez; inconsistencias muestran calidad parcial/no disponible; sólo nombre snapshot/ID, sin contacto ni texto libre.
  - Verificación: RED/GREEN operacional/UI y Chrome KPI→línea/liquidación.
  - Dependencias: RP10.1.
  - Archivos probables: `reporting-workforce.ts`, `WorkforceReport.vue`, `ReportDetailTable.vue`, `reportes.vue`, pruebas.
  - Alcance estimado: M (máximo 5 archivos por incremento).
- [x] RP10.4 — Ejecutar checkpoint integral de Fase 5.
  - Descripción: verificar filtros/URL, acceso, estados accesibles, regresión y responsive.
  - Aceptación: suite/typecheck/lint/build pasan; Chrome cubre ambos flujos con consola limpia; Playwright intenta 320/768/1024/1440 en contexto aislado.
  - Verificación: comandos de spec, Chrome autenticado y Playwright complementario; reporte de impacto.
  - Dependencias: RP10.2 y RP10.3.
  - Archivos probables: pruebas, `reporting-responsive.spec.ts`, reporte de implementación, spec/tareas.
  - Alcance estimado: M.

### Checkpoint R5 — Inventario y personal

- [x] Totales concilian con cierres, resoluciones, trabajo y liquidaciones a $0.01.
- [x] Pruebas de acceso niegan ambos dominios a no Admin.

## Fase 6 — Egresos, flujo y conciliación

Estado: implementada y verificada localmente el 2026-09-25; Admin-only; sin datos reales ni despliegue.

- [x] RP11.1 — Incorporar fuentes financieras allowlisted y filtros restaurables.
  - Descripción: proyectar pagos de visitas, egresos y cierres sin PII/texto libre, y suscribirlos sólo para Admin.
  - Aceptación: no Admin no abre fuentes; serialización excluye nombre/teléfono de visitante, descripción/recibo/notas/actores; método, cuenta, categoría y estado restauran desde URL.
  - Verificación: pruebas TDD de contratos, servicio y URL.
  - Dependencias: Checkpoint R5 y spec Fase 6 autorizada.
  - Archivos probables: `app/src/types/reporting.ts`, `app/src/services/reporting.service.ts`, `app/src/services/reporting.firebase.ts`, `app/src/stores/reporting.ts`, `app/tests/reporting-service.test.ts`.
  - Alcance estimado: M (5 archivos).
- [x] RP11.2 — Completar el cálculo financiero puro.
  - Descripción: separar conceptos reconocidos, movimientos efectivos, egresos pagados, flujo por cuenta y variaciones de cierre.
  - Aceptación: correcciones/reversos no duplican; crédito de tienda no es caja; nómina se resta una vez; variación no altera flujo; sumas concilian a $0.01.
  - Verificación: `npm run test:finance` y pruebas reporting-finance RED→GREEN.
  - Dependencias: RP11.1.
  - Archivos probables: `app/src/utils/financial-reports.ts`, `app/src/utils/reporting-finance.ts`, `app/tests/financial-reports.test.ts`, `app/tests/reporting-finance.test.ts`.
  - Alcance estimado: M (4 archivos).
- [x] RP11.3 — Construir Finanzas con drill-down auditable.
  - Descripción: mostrar conceptos separados, flujo por cuenta y movimientos/egresos con navegación al origen.
  - Aceptación: KPI→detalle→origen conserva filtros; filtros no aplicables se explican; carga/error/vacío/parcial son accesibles.
  - Verificación: pruebas UI, typecheck, lint focalizado y Chrome Finanzas→movimiento/egreso→origen→retorno.
  - Dependencias: RP11.2.
  - Archivos probables: `app/src/components/kronos/reports/FinanceReport.vue`, `app/src/components/kronos/reports/ReportFilters.vue`, `app/src/pages/reportes.vue`, `app/tests/reporting-ui.test.ts`.
  - Alcance estimado: M (4 archivos).
- [x] RP11.4 — Construir Conciliación y cerrar el checkpoint.
  - Descripción: presentar aperturas, movimientos, esperado, contado y variación por cierre sin alterar flujo.
  - Aceptación: baseline identificable; KPI concilia con filas; navegación a Cierres; responsive sin overflow y consola limpia.
  - Verificación: suites reporting/finance, typecheck, lint, build, Chrome y Playwright `320/768/1024/1440` cuando su perfil QA esté autenticado.
  - Dependencias: RP11.3.
  - Archivos probables: `app/src/components/kronos/reports/ReconciliationReport.vue`, `app/src/components/kronos/reports/ReportDetailTable.vue`, `app/src/pages/reportes.vue`, `app/e2e/responsive/reporting-responsive.spec.ts`, reporte de implementación.
  - Alcance estimado: M (5 archivos).

### Checkpoint R6 — Finanzas

- [x] Ingreso reconocido, flujo de caja, utilidad bruta y cuentas por cobrar son cifras distintas y conciliables.
- [x] Chrome cubre Finanzas→movimiento/egreso/cierre con acceso Admin-only.

## Fase 7 — Exportación y cierre

Estado: implementada y verificada localmente el 2026-09-25; CSV único confirmado; sin datos reales ni despliegue.

- [x] RP12.1 — Definir contrato allowlisted y serializador CSV seguro.
  - Descripción: crear filas tipadas, orden determinista, BOM/RFC 4180, decimales ISO y neutralización de fórmulas.
  - Aceptación: round-trip conserva UTF-8/comillas/saltos; `null` queda vacío; texto peligroso no se interpreta como fórmula.
  - Verificación: `reporting-export.test.ts` RED→GREEN.
  - Dependencias: Checkpoint R6, formato confirmado y autorización de Fase 7.
  - Archivos probables: `app/src/types/reporting.ts`, `app/src/utils/reporting-export.ts`, `app/tests/reporting-export.test.ts`.
  - Alcance estimado: M (3 archivos).
- [x] RP12.2 — Proyectar resultados filtrados al contrato común.
  - Descripción: convertir metadata, KPIs y detalles ya calculados de cada sección cargada sin releer fuentes.
  - Aceptación: cifras coinciden a $0.01; filtros/calidad/fuentes quedan explícitos; allowlist excluye PII y texto libre.
  - Verificación: pruebas de conciliación, filtros y privacidad en `reporting-export.test.ts`.
  - Dependencias: RP12.1.
  - Archivos probables: `app/src/utils/reporting-export.ts`, `app/tests/reporting-export.test.ts`, `app/src/pages/reportes.vue`.
  - Alcance estimado: M (3 archivos).
- [x] RP12.3 — Integrar descarga accesible Admin-only.
  - Descripción: añadir botón y estados de descarga usando Blob/URL temporal sin red ni persistencia.
  - Aceptación: sólo Admin listo puede exportar; nombre determinista; éxito/error accesibles; URL se revoca.
  - Verificación: prueba UI, typecheck, lint y Chrome.
  - Dependencias: RP12.2.
  - Archivos probables: `app/src/components/kronos/reports/ReportExportButton.vue`, `app/src/pages/reportes.vue`, `app/tests/reporting-ui.test.ts`.
  - Alcance estimado: M (3 archivos).

- [x] RP13 — Ejecutar regresión integral, Chrome, responsive y reporte.
  - Descripción: validar todos los recorridos desde KPIs hasta registros y documentar impacto, evidencia, riesgos y rollback.
  - Aceptación: criterios del spec completos; consola sin errores/warnings nuevos; flujo completo y 320/768/1024/1440 documentados.
  - Verificación: tests reporting, `npm run test:finance`, `npm run test:rules` si aplica, typecheck, build, lint focalizado, Chrome, Playwright y reporte.
  - Dependencias: RP12.3 y sesión manual ya autorizada; cualquier write QA, dato real o despliegue requiere permiso separado.
  - Archivos probables: `app/e2e/responsive/reporting-responsive.spec.ts`, `Docs/implementation-reports/2026-09-25-reporting-phase-7-export-closeout.md`, `tasks/plan.md`, `tasks/todo.md`.
  - Alcance estimado: M (4 archivos).

### Checkpoint final — Reportes

- [x] Todos los criterios de `SPEC-reporting-contracts.md` se cumplen con evidencia.
- [x] Árbol de archivos, flujos afectados/no afectados, diagrama, riesgos y rollback constan en el reporte.
- [x] Migraciones, modificaciones de datos reales y despliegue siguen sin ejecutarse salvo autorización explícita posterior.

## Fase 8 — Analítica visual

Estado: implementada y verificada localmente el 2026-09-25; sin despliegue ni datos reales.

- [x] RP14.1 — Modelo común, buckets y pruebas de conciliación/nulos.
- [x] RP14.2 — Componente visual accesible, estados y tabla alternativa.
- [x] RP14.3 — Finanzas y Conciliación.
- [x] RP14.4 — Mensualidades y Atletas.
- [x] RP14.5 — Inventario y Personal.
- [x] RP14.6 — Regresión integral, Chrome, responsive y reporte. Chrome cubrió 320/768/1024/1440; Playwright autenticado quedó condicionado a su perfil QA aislado.

---

# Mejoras operativas 2026-09-25

Estado general: autorizado por el usuario el 2026-09-25 para implementación local. Datos reales y despliegue no autorizados.

## Fase P — Paginación transversal

Spec: `specs/SPEC-application-table-pagination.md`.

- [x] P1 — Auditar tablas productivas y fijar matriz de cobertura.
  - Descripción: registrar página/componente, filtros, orden, cantidad esperada, paginación actual y exclusión justificada.
  - Aceptación: demos, recibos y tablas de apoyo quedan separadas; cada tabla operativa tiene decisión explícita; no se cambia UI.
  - Verificación: revisión contra `rg` de `<VTable`, `<VDataTable` y `<table`; matriz adjunta a spec/tarea.
  - Dependencias: autorización de Fase P.
  - Archivos probables: spec, `tasks/plan.md`, `tasks/todo.md`.
  - Alcance: S.
- [x] P2 — Crear contrato reutilizable de paginación con TDD.
  - Aceptación: 15/30/50, rango/total, reset por filtros y clamp tras reducción; API accesible.
  - Verificación: `npx tsx --test tests/table-pagination.test.ts`; typecheck.
  - Dependencias: P1.
  - Archivos probables: `app/src/composables/useTablePagination.ts`, componente de controles si aplica, `app/tests/table-pagination.test.ts`.
  - Alcance: M.
- [x] P3 — Adoptar paginación en catálogos y administración.
  - Aceptación: Atletas, Planes, Empleados y Usuarios cumplen la matriz sin cambiar acciones/filtros.
  - Verificación: pruebas focales, typecheck y Chrome de una acción por página.
  - Dependencias: P2.
  - Archivos probables: cuatro páginas y una prueba, máximo cinco archivos.
  - Alcance: M.
- [x] P4 — Adoptar paginación en operación y finanzas.
  - Aceptación: Pagos, Tienda, Visitas, Egresos, Cierres, Rendimiento y Dashboard cumplen la matriz; dividir en subrebanadas de máximo cinco archivos.
  - Verificación: suites funcionales/financieras, typecheck y Chrome por subrebanada.
  - Dependencias: P2.
  - Archivos probables: páginas afectadas y pruebas correspondientes, en dos o más incrementos.
  - Alcance: M por incremento.
- [ ] P5 — Adoptar paginación en reportes y cerrar CP1.
  - Aceptación: tablas de detalle extensas paginadas; gráficos/alternativas accesibles no se rompen; inventario completo justificado.
  - Verificación: suites reporting, build, Chrome y Playwright 320/768/1024/1440; reporte de impacto.
  - Dependencias: P3 y P4.
  - Archivos probables: componentes de reportes, prueba UI/e2e y reporte, en rebanadas ≤5.
  - Alcance: M por incremento.

## Fase R — Recibos de liquidación

Spec: `specs/SPEC-payroll-settlement-receipts.md`.

- [x] R1 — Definir constructor puro de recibo de liquidación.
  - Aceptación: folio estable, líneas/total a $0.01, allowlist sin PII y degradación explícita para legado.
  - Verificación: `npx tsx --test tests/payroll-settlement-receipts.test.ts`.
  - Dependencias: autorización de Fase R.
  - Archivos probables: `app/src/types/workforce.ts`, `app/src/utils/receipts.ts`, prueba focal.
  - Alcance: M.
- [x] R2 — Mostrar recibo inmediato e historial paginado.
  - Aceptación: liquidación exitosa abre recibo; historial permite reabrir/descargar/imprimir sin writes.
  - Verificación: prueba UI, typecheck y Chrome liquidación → recibo → historial.
  - Dependencias: R1 y P2 o paginador local equivalente aprobado.
  - Archivos probables: `empleados.vue`, `ReceiptDialog.vue`, store/service workforce y prueba UI.
  - Alcance: M.
- [ ] R3 — Cerrar CP2 con conciliación y reporte.
  - Aceptación: una liquidación = un egreso; recibo reproduce importe; sin consola/warnings nuevos.
  - Verificación: `npm run test:finance`, typecheck, build, Chrome, responsive y reporte.
  - Dependencias: R2.
  - Archivos probables: pruebas financieras/e2e, reporte y tareas.
  - Alcance: S.

## Fase D — Volver venta a adeudo

Spec: `specs/SPEC-store-sale-debt-reopening.md`.

- [x] D1 — Añadir acción contextual y vista previa de reverso desde Venta.
  - Aceptación: sólo venta con cobro efectivo; muestra cobros seleccionables, saldo resultante, motivo y diferencia con cancelar.
  - Verificación: prueba UI y Chrome hasta antes de confirmar.
  - Dependencias: autorización de Fase D y confirmación del dominio Tienda.
  - Archivos probables: `tienda.vue`, `StorePaymentCorrectionDialog.vue`, prueba UI.
  - Alcance: M.
- [ ] D2 — Delegar al reverso existente y cerrar CP3.
  - Aceptación: simple/parcial/agrupado concilian; saldo consumido falla cerrado; no se muta/cancela venta.
  - Verificación: correcciones, reglas, finanzas, typecheck, build, Chrome y reporte.
  - Dependencias: D1.
  - Archivos probables: utilidad/servicio existentes, dos pruebas y reporte, máximo cinco.
  - Alcance: M.

## Fase A — Acceso a abonos anticipados

Spec: `specs/SPEC-membership-advance-payment-discoverability.md`.

- [x] A1 — Abrir abono contextual desde Atletas y CTA de Pagos.
  - Aceptación: atleta preseleccionado, navegación restaurable y permisos vigentes.
  - Verificación: prueba UI y Chrome Atletas → diálogo.
  - Dependencias: autorización de Fase A.
  - Archivos probables: `atletas.vue`, `pagos.vue`, prueba UI/router.
  - Alcance: M.
- [ ] A2 — Presentar periodos comprensibles y cerrar CP4.
  - Aceptación: sin escritura manual `YYYY-MM`; corte/saldo/adelanto visibles; recibo inmediato e historial correctos.
  - Verificación: prueba de adelantos, finanzas, typecheck, build, Chrome y responsive.
  - Dependencias: A1.
  - Archivos probables: `MembershipPaymentDialog.vue`, utilidad de periodos, prueba existente, reporte.
  - Alcance: M.

## Fase B — Cumpleaños de empleados

Spec: `specs/SPEC-employee-birthdays-community.md`.

- [x] B1 — Añadir `birthDate` compatible con empleados legados.
  - Aceptación: alta nueva exige fecha válida; lectura legada acepta null; servicio rechaza futura/inválida.
  - Verificación: TDD de contrato/servicio; reglas sólo tras autorización específica.
  - Dependencias: autorización de Fase B y decisión de esquema/reglas.
  - Archivos probables: tipo workforce, página Empleados, servicio/store y prueba, máximo cinco.
  - Alcance: M.
- [x] B2 — Mostrar sección allowlisted de equipo en Comunidad.
  - Aceptación: activos, ventana 60 días y 29-Feb; sin datos laborales; no hay lecturas para roles no autorizados.
  - Verificación: prueba de cumpleaños, reglas negativas si aplican y Chrome Empleados → Comunidad.
  - Dependencias: B1 y confirmación Admin-only.
  - Archivos probables: utilidad de cumpleaños, `comunidad.vue`, store/service permitido y prueba.
  - Alcance: M.
- [ ] B3 — Cerrar CP5.
  - Aceptación: alta/edición/inactivación reflejan la cola; atletas no cambian; consola y responsive limpios.
  - Verificación: rules, typecheck, build, Chrome, Playwright y reporte.
  - Dependencias: B2.
  - Archivos probables: pruebas/e2e, reporte y tareas.
  - Alcance: S.

## Fase M — Promociones de planes

Spec: `specs/SPEC-plan-promotions.md`.

- [x] M1 — Aprobar y probar contrato persistido de promoción.
  - Aceptación: porcentaje/monto fijo, vigencia, planes, horarios, estado y validaciones definidos; reglas Admin-only propuestas.
  - Verificación: RED de contrato y reglas; no persistir hasta autorización de esquema/reglas.
  - Dependencias: autorización de Fase M y decisiones abiertas de la spec.
  - Archivos probables: `domain.ts`, servicio, reglas y dos pruebas, máximo cinco.
  - Alcance: M.
- [x] M2 — Implementar resolución pura de elegibilidad/precio.
  - Aceptación: fecha/plan/horario, mayor ahorro, desempate, límites y centavos deterministas.
  - Verificación: `npx tsx --test tests/plan-promotions.test.ts`.
  - Dependencias: M1.
  - Archivos probables: `plan-promotions.ts`, prueba focal y tipos.
  - Alcance: M.
- [x] M3 — Crear administración de promociones.
  - Aceptación: Admin crea/edita/activa/desactiva; validación accesible; listado paginado.
  - Verificación: reglas, prueba UI, typecheck y Chrome CRUD en QA autorizado.
  - Dependencias: M2 y P2.
  - Archivos probables: `planes.vue`, store/service, componente de diálogo y prueba UI.
  - Alcance: M.
- [x] M4 — Congelar promoción al abrir/cobrar el periodo.
  - Aceptación: snapshot preserva base/descuento/final; parciales/adelantos usan final; editar promoción no cambia histórico.
  - Verificación: promociones + adelantos + finanzas RED→GREEN.
  - Dependencias: M3.
  - Archivos probables: tipos/pagos, servicio, diálogo, utilidades y prueba, dividir si excede cinco.
  - Alcance: M por incremento.
- [x] M5 — Integrar recibos/reportes y cerrar CP6.
  - Aceptación: recibo muestra ahorro; deuda/dashboard/reportes concilian; descuento no se cuenta como efectivo.
  - Verificación: suites reporting/finanzas/reglas, typecheck, build, Chrome flujo completo, Playwright y reporte.
  - Dependencias: M4.
  - Archivos probables: recibos, reporting, pruebas y reporte, en rebanadas ≤5.
  - Alcance: M por incremento.

## Ampliación autorizada M — Mensualidad gratis por promoción

Spec: `specs/SPEC-plan-promotions.md`, ampliación autorizada el 2026-09-26.

- [x] M6 — Registrar periodo gratis sin movimiento monetario.
  - Aceptación: descuento igual o mayor al importe acordado produce total $0; sólo Admin confirma; no se crea abono, saldo a favor ni ingreso; el periodo queda liquidado con snapshot.
  - Verificación: prueba RED→GREEN de servicio, reglas y conciliación.
  - Archivos probables: pagos, tipos, reglas y pruebas; dividir en rebanadas pequeñas.
- [x] M7 — Permitir omitir promoción antes del primer abono.
  - Aceptación: Admin puede elegir importe acordado sin descuento antes de abrir el periodo; la elección no cambia tras abrirlo.
  - Verificación: prueba de diálogo/servicio y Chrome en QA.
  - Archivos probables: `MembershipPaymentDialog.vue`, lógica de promociones y pruebas.
- [x] M8 — Emitir constancia gratis y cerrar QA de promoción.
  - Aceptación: constancia indica «Mensualidad gratis · $0 cobrado» y no se presenta como recibo de pago; finanzas no registran efectivo; flujo completo verificado.
  - Verificación: pruebas focales, rules, typecheck, build, Chrome y reporte de impacto.
  - Archivos probables: `receipts.ts`, `ReceiptDialog.vue`, diálogo, pruebas y reporte.

## Fase C — PRs de coaches

Spec: `specs/SPEC-coach-performance-prs.md`, autorizada el 2026-09-26.

- [x] C1 — Definir contrato compatible y reglas seguras para PRs de coaches.
  - Aceptación: PRs existentes de atletas permanecen intactos; nuevas marcas de coaches se vinculan a empleados `kind: coach`; escrituras limitadas al permiso actual.
  - Verificación: pruebas RED→GREEN de servicio y reglas, incluidos negativos de autorización.
  - Archivos probables: tipos, servicio, reglas y pruebas.
- [x] C2 — Integrar coaches en selector, comparativo, tabla y métricas de Rendimiento.
  - Aceptación: empleados coach activos son elegibles; los inactivos conservan histórico; Admin y permisos existentes controlan acciones.
  - Verificación: pruebas focales, typecheck, build y Chrome de alta → PR → histórico/edición.
  - Archivos probables: `rendimiento.vue`, store workforce, utilidades y pruebas.
- [x] C2a — Exponer «Crear skill» con permiso existente.
  - Aceptación: un usuario con `performanceManage` crea un skill activo desde Rendimiento; aparece en los formularios de atletas y coaches sin permisos adicionales.
  - Verificación: reglas existentes, typecheck y Chrome desde estado sin skills hasta PR registrado.
  - Archivos probables: `rendimiento.vue`, pruebas y reporte.
- [x] C3 — Cerrar QA y reporte de impacto.
  - Aceptación: errores/warnings nuevos ausentes; reglas, responsive y regresiones de atletas validados.
  - Verificación: suites completas, Chrome y Playwright complementario.
  - Archivos probables: reporte y tareas.
- [x] C4 — Cargar coaches existentes al directorio de producción tras publicar reglas y antes de anunciar disponibilidad.
  - Aceptación: copia única de ID/nombre/estado de empleados Coach, idempotente, sin leer/mostrar datos laborales en logs; verifica conteos y conserva registro de IDs creados para reversión focalizada.
  - Verificación: ensayo en QA aislado, dry-run y verificación de conteos antes/después; autorización explícita recibida el 2026-09-26.
  - Archivos probables: script de migración probado, reporte de lanzamiento.
