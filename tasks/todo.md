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
