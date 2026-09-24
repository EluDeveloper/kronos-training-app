# Spec: E8-PROD-7 — Preparación de despliegue y canario real de WhatsApp

Estado: **P7-1–P7-6 implementados; fase pausada por cambio de prioridad el 2026-09-23. P7-7A creado y visualmente confirmado, con inventario remoto pendiente; alta Meta detenida por número ya registrado y decisión de remitente pendiente**.
Fecha de propuesta: 2026-09-22, America/Mexico_City.
Módulos: `athletes-payments`, `experience-quality`.

## Objetivo

Cerrar los huecos entre el backend local ya verificado y un despliegue controlado de
Cloud Functions que permita enviar una notificación real únicamente a un destinatario
QA autorizado. La fase debe impedir que un despliegue oscuro cree jobs o que la
habilitación de Meta alcance accidentalmente a atletas fuera del canario.

La fase termina con evidencia reproducible de un comprobante real, estados de webhook
y opt-out sobre datos sintéticos o aislados. El modo general de producción permanece
apagado y requiere una autorización posterior independiente.

## Hallazgos de preparación al 2026-09-22

### Verificado localmente

- `npm test` en `app/functions`: 218/218 pruebas aprobadas.
- `npm run typecheck` y `npm run build` aprobados; el build necesitó ejecución fuera
  del sandbox únicamente para escribir `functions/lib`.
- El transporte usa `graph.facebook.com`, bloquea redirects, limita tiempo y cuerpo,
  valida PDF/hash y trata incertidumbre como `unknown` sin reintento ciego.
- Worker, recovery y maintenance fallan cerrado; webhook autentica el raw body y
  limita payloads; jobs, estados y opt-out son idempotentes.
- El árbol estaba limpio al iniciar la auditoría; esta propuesta añade únicamente
  documentación y tareas, sin cambios de comportamiento.

### Bloqueos confirmados

1. `cloudfunctions.googleapis.com` está deshabilitada en
   `kronos-training-fd5e5`; `firebase functions:list` devuelve 403
   `SERVICE_DISABLED`. No se puede inventariar ni desplegar Functions todavía.
2. No existe un gate canario global. Los triggers de pagos y el scheduler de
   recordatorios pueden crear jobs en cuanto se despliegan; al configurar el worker
   como `meta`, cualquier atleta elegible podría convertirse en destinatario.
3. `app/firebase.json` no tiene hook `predeploy`; un deploy podría empacar un
   `functions/lib` obsoleto si el operador olvida compilar.
4. `whatsappProviderHealth` es público y estático: siempre declara proveedor fake y
   Meta deshabilitado, por lo que no sirve como preflight y podría inducir una lectura
   operativa incorrecta.
5. No se pudieron comprobar ni deben inspeccionarse desde esta auditoría los valores
   de `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` o
   `WHATSAPP_APP_SECRET`. Su existencia, rotación y binding quedan en un gate operado
   por el usuario sin mostrar valores.
6. `npm audit --omit=dev` reporta seis vulnerabilidades moderadas transitivas de
   `uuid` a través de `firebase-admin@14.3.0`; la corrección propuesta requiere probar
   `firebase-admin@14.4.0` y modificar lockfile, sujeto al gate de dependencias.

## Supuestos

1. La primera prueba real usará un único teléfono QA controlado por el usuario, con
   consentimiento explícito y nunca un número de cliente.
2. Se prefiere un proyecto Firebase QA aislado. Si se usa la instancia publicada,
   se requerirá autorización específica para cada write sintético, mensaje y limpieza.
3. WABA, número remitente, app Meta, plantillas y token pertenecen a la misma empresa
   y entorno; los IDs se verifican sin incluir secretos en Git o en el chat.
4. Las plantillas se llamarán exactamente `payment_receipt_pdf_v1` y
   `payment_reminder_pdf_v1`, serán `UTILITY`, locale `es_MX`, header documento PDF y
   tres parámetros body en el orden ya probado.
5. La versión Graph no se fijará por memoria: se elegirá una versión soportada en el
   día del canario y se registrará como configuración no secreta.

Si un supuesto cambia, esta spec vuelve a propuesta antes de desplegar o enviar.

## Decisiones confirmadas el 2026-09-23

- El entorno remoto será un proyecto Firebase QA aislado con `projectId` exacto
  `kronos-training-qa`.
- No existen todavía app Meta, WABA, número remitente ni las plantillas
  `payment_receipt_pdf_v1` y `payment_reminder_pdf_v1`.
- El usuario puede operar Blaze/APIs, IAM y la captura manual de secretos, pero aún no
  ha autorizado crear recursos remotos.
- El alta de Meta es un prerrequisito manual completo, no un simple preflight de
  recursos existentes.

### Ejecución P7-7A

- El usuario autorizó crear `kronos-training-qa` sin organización/carpeta el
  2026-09-23.
- `firebase projects:create kronos-training-qa --display-name "Kronos Training QA"`
  confirmó la creación del proyecto Google Cloud y la adición de Firebase.
- La consulta directa `firebase apps:list --project kronos-training-qa` respondió con
  inventario vacío de apps.
- `firebase projects:list` todavía no presenta el proyecto nuevo y la consulta RTDB
  devuelve 403 durante la propagación de IAM. No se modificó IAM ni se creó una
  segunda instancia/proyecto para compensarlo.
- P7-7A permanece abierto hasta obtener project number, estado `ACTIVE` e inventario
  base consistente. P7-7B no puede comenzar antes de ese checkpoint.
- El 2026-09-23 el usuario adjuntó evidencia visual de Firebase Console abierta en
  `project/kronos-training-qa/database`, con el nombre visible “Kronos Training QA”.
  Esto confirma visualmente la identidad del proyecto, pero no demuestra que RTDB esté
  creado/activo ni sustituye el inventario CLI pendiente. P7-7A sigue abierto.

### Pausa de onboarding Meta — 2026-09-23

- Al intentar agregar un número desde el flujo estándar, Meta indicó que el número ya
  está registrado con una cuenta de WhatsApp y ofrece migrarlo o desconectarlo.
- El usuario confirmó que todos los números disponibles ya tienen WhatsApp y que no
  puede eliminar esas cuentas. Se preservan; no solicitar desconexión, baja ni borrado.
- No se ha registrado un número remitente ni se ha completado el alta de WABA/número.
  El onboarding queda pausado antes de verificación SMS/llamada.
- Antes de modificar la estrategia aprobada se debe decidir entre usar el número de
  prueba de Meta como remitente QA y un número existente como destinatario de prueba,
  buscar una línea dedicada o evaluar coexistencia mediante Embedded Signup. La ruta
  del número de prueba permitiría validar transporte y recepción, pero no equivale al
  canario con número remitente empresarial ni valida las plantillas PDF de Kronos.
- No se autorizó todavía esa modificación de estrategia; Firebase deploy, secretos,
  webhook Meta y mensajes de canario siguen pendientes de sus gates.

### Punto de pausa por cambio de prioridad — 2026-09-23

El usuario pidió sincronizar los cambios y dejar documentado el punto de reanudación
porque cambió la prioridad. La fase E8-PROD-7 queda pausada aquí: el trabajo local
P7-1–P7-6 está terminado; P7-7A está parcialmente verificado; P7-7B/P7-7C y el resto
del onboarding Meta/canario no avanzan. La nueva prioridad no fue especificada en este
checkpoint. Al retomarla, comenzar por el inventario coherente de Firebase QA y por
resolver la estrategia del número sin desconectar las cuentas existentes.

## Alcance propuesto

## Stack y convenciones

- Firebase Cloud Functions v2, Node.js 22, TypeScript ESM, Realtime Database y
  Secret Manager; npm y `app/functions/package-lock.json` son autoritativos.
- Los resolvers de rollout serán funciones puras, fail-closed y sin leer secretos.
- Sólo adaptadores de frontera acceden a Firebase o Meta; ningún error, log o tipo
  público incluirá token, teléfono completo, PDF binario o payload de webhook.
- No se añade dependencia nueva. La posible actualización de `firebase-admin` se
  trata como una tarea separada y reversible.

### A. Endurecimiento local previo al despliegue

- Añadir un contrato de rollout `disabled | qa | production`, con `disabled` como
  default y rechazo de cualquier valor o configuración incompletos.
- En `disabled`, triggers y recordatorios no crean jobs y el worker no envía.
- En `qa`, productores y worker aceptan sólo el `athleteId` canario configurado; una
  segunda defensa valida de nuevo el destinatario antes de llamar a Meta.
- `production` seguirá bloqueado por una constante/configuración de lanzamiento que
  no se habilitará en esta fase.
- Añadir pruebas de abuso: pago, reminder, recovery o job manual de otro atleta no
  produce red ni mutación enviable, incluso con configuración Meta válida.
- Añadir `predeploy` de Functions para typecheck/build y evitar artefactos stale.
- Definir región y límites de costo/concurrencia de las Functions expuestas o que
  envían, conservando `maxInstances: 1` donde la exclusión sea parte del contrato.
- Retirar `whatsappProviderHealth` o convertirlo en una respuesta no engañosa y sin
  configuración, IDs, secretos ni capacidad de activar el proveedor.
- Evaluar `firebase-admin@14.4.0` en una tarea aislada; no usar `npm audit fix --force`.

### B. Preflight de Firebase, sujeto a autorización independiente

- Confirmar plan Blaze, cuenta de facturación y alertas/presupuesto antes de habilitar
  APIs facturables.
- Habilitar las APIs mínimas que exija el despliegue de segunda generación:
  Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Eventarc, Pub/Sub,
  Cloud Scheduler y Secret Manager; registrar cuáles habilitó realmente el CLI.
- Confirmar que el desplegador tenga sólo los roles necesarios. Firebase documenta
  `roles/cloudfunctions.admin` y `roles/iam.serviceAccountUser` como base para deploy;
  cualquier rol adicional debe justificarse.
- Identificar la service account de runtime de segunda generación y comprobar acceso
  mínimo a RTDB y sólo a los secretos enlazados por Function.
- Crear o rotar los tres secretos mediante entrada manual del usuario; nunca imprimir,
  copiar al repositorio o leer sus valores desde el agente.
- Desplegar primero reglas/índices necesarios y después Functions específicas en
  grupos pequeños, con rollout `disabled`.
- Verificar inventario, región, runtime Node 22, bindings, Scheduler, logs y ausencia
  de jobs/mensajes antes de avanzar.

#### Gates Firebase QA propuestos

1. **P7-7A — baseline Firebase:** crear `kronos-training-qa` con nombre visible
   `Kronos Training QA`, sin Analytics, datos de la app, billing, secretos ni deploy.
   La operación crea el proyecto Google Cloud y agrega la configuración base de
   Firebase, incluidas APIs, cuentas de servicio y API key administradas que Firebase
   aprovisiona automáticamente. Verificar project ID/número, propietario, ubicación
   en organización/carpeta y ausencia de RTDB/Auth/Functions o recursos de Kronos.
2. **P7-7B — base operativa:** el usuario enlaza billing/Blaze y presupuesto; después
   se habilitan únicamente APIs requeridas, RTDB/Auth de QA, IAM mínimo y secretos
   capturados manualmente. No se despliega Functions ni se copian datos reales.
3. **P7-7C — deploy inerte:** desplegar reglas y Functions seleccionadas con rollout,
   worker, recovery y maintenance en `disabled`; inventariar endpoints, triggers,
   Scheduler, bindings, service account y logs antes de crear datos QA.

Cada gate requiere autorización explícita independiente. Crear o agregar Firebase no
es un ensayo reversible: el project ID no se puede cambiar ni reutilizar después de
provisionar el proyecto.

### C. Preflight de Meta, sujeto a autorización independiente

- Confirmar Business Portfolio, app Meta, WABA y número remitente; registrar sólo los
  IDs no secretos en configuración ignorada por Git.
- Usar System User Access Token con `whatsapp_business_messaging` y, cuando se opere
  WABA/webhook, `whatsapp_business_management`; no usar token temporal en producción.
- Confirmar que ambas plantillas estén aprobadas, activas y con contrato exacto.
- Confirmar versión Graph soportada, calidad/estado del número, límites y método de
  pago aplicable antes del primer envío.
- Publicar el endpoint HTTPS `whatsappWebhook`, completar challenge con verify token,
  suscribir una sola vez la WABA al campo `messages` y comprobar firma/status sin
  registrar payloads completos.

Como ninguno de estos recursos existe, P7-8 comienza con alta manual en Meta Business
Manager: Business Portfolio/empresa, app, producto WhatsApp, WABA, número remitente,
medio de pago aplicable, System User/token y ambas plantillas. El agente puede guiar y
verificar pantallas después de login manual, pero no automatizar credenciales ni
aceptar términos en nombre del usuario.

El 2026-09-23 el usuario reportó que todos los números disponibles ya tienen una
cuenta de WhatsApp y no puede eliminar ninguna. Por tanto, el alta estándar de número
queda detenida y no se debe ejecutar “desconectar” o “migrar” hasta que el usuario elija
esa consecuencia. Una eventual prueba con el remitente de prueba de Meta es un cambio
de estrategia que requiere actualizar esta spec y obtener autorización antes de
implementar/configurarla.

### D. Canario real, sujeto a autorización final específica

1. Declarar por escrito proyecto/entorno, `athleteId` QA, teléfono QA enmascarado,
   plantillas, ventana temporal, operador y rollback.
2. Activar `qa`; `production` permanece imposible.
3. Crear o reutilizar sólo el atleta/pago sintético autorizado y consentimiento ligado
   al teléfono QA. No usar pagos, ventas o adeudos de clientes.
4. Enviar un comprobante real y comprobar exactamente un `wamid`, PDF correcto,
   estado `accepted/sent`, webhook `delivered` y, si el operador abre el mensaje,
   `read`, sin duplicados.
5. Ejecutar un recordatorio QA controlado mediante el scheduler autorizado y confirmar
   que ningún otro atleta crea job ni recibe mensaje.
6. Responder `BAJA` desde el teléfono QA, comprobar retiro transaccional y verificar
   que un intento posterior queda suprimido sin envío.
7. Volver inmediatamente a `disabled`, conservar sólo la auditoría mínima aprobada y
   limpiar datos sintéticos conforme al plan registrado.
8. Revisar logs, métricas, costos, jobs `unknown`/fallidos y evidencia de que no hubo
   destinatarios fuera del canario.

## Orden de implementación propuesto

1. Contrato puro RED/GREEN del rollout y allowlist QA.
2. Gate de productores y recordatorios; checkpoint local sin jobs fuera de alcance.
3. Segunda defensa en worker/recovery; checkpoint sin llamadas Meta fuera de alcance.
4. Predeploy, límites de Functions y retiro/corrección del health endpoint.
5. Actualización aislada de `firebase-admin`, sólo si se autoriza, con auditoría y
   regresión completa.
6. Gates locales, revisión de cinco ejes y autorización de infraestructura.
7. Firebase en `disabled`, luego Meta/webhook en `disabled`.
8. Canario `qa`, rollback inmediato y reporte.

## Fuera de alcance

- Habilitar `production` para la cartera completa de atletas.
- Enviar a clientes, automatizar credenciales o compartir tokens/secretos.
- Crear WABA, número, app, plantillas, billing o recursos cloud sin gate explícito.
- Migrar datos reales, modificar pagos reales o probar ventas reales.
- Cambiar autenticación, permisos de la app o reglas públicas para facilitar QA.
- Instalar dependencias o actualizar `firebase-admin` sin autorización separada.

## Threat model resumido

| Límite | Abuso principal | Control exigido |
|---|---|---|
| Firebase → Meta | Envío masivo por config errónea | kill switch + allowlist QA en productor y worker |
| Meta → webhook público | Spoofing/replay/DoS | challenge, HMAC raw, límites, deduplicación, max instances |
| Secret Manager → Function | Exposición o acceso lateral | binding por Function, SA mínima, no logs/cliente |
| Scheduler/RTDB → worker | duplicado o carrera | idempotencia, lease, maxInstances y recovery acotado |
| QA → datos financieros | contaminación de reportes | proyecto aislado preferido o dataset sintético autorizado |
| Operador → rollout | habilitación accidental global | estados explícitos, checklist y rollback a `disabled` |

## Criterios de aceptación

1. Un deploy con defaults es inerte: no crea jobs nuevos, no lee secretos y no usa red.
2. El modo `qa` sólo procesa el atleta autorizado y vuelve a validar antes del fetch.
3. No existe una ruta accidental para habilitar `production` en esta fase.
4. El deploy compila automáticamente y falla antes de publicar si typecheck/build falla.
5. Región, escalado, concurrencia, timeouts, service account y secret bindings quedan
   inventariados y revisados antes del canario.
6. Rules, Functions, Scheduler y endpoint desplegados coinciden con Git y permanecen
   en `disabled` hasta el gate real.
7. WABA, número, versión Graph y dos plantillas exactas están verificados; el webhook
   está suscrito y autentica callbacks.
8. El canario produce un solo mensaje por evento al único teléfono QA, conserva
   `wamid` y estados monotónicos, y no genera envíos fuera de la allowlist.
9. `BAJA` bloquea el intento posterior y no borra la auditoría necesaria.
10. Rollback a `disabled` queda probado y no depende de borrar Functions o secretos.
11. Pruebas, reglas, typecheck, build, auditoría y revisión de cinco ejes pasan; las
    vulnerabilidades moderadas quedan corregidas o justificadas con alcance y fecha.
12. El reporte final lista recursos, archivos, datos QA, mensajes enviados, costos,
    evidencia, limpieza, flujos no ejecutados y riesgos residuales.

## Verificación propuesta

```text
cd app/functions && npm test
cd app/functions && npm run typecheck
cd app/functions && npm run build
cd app/functions && npm audit --omit=dev --audit-level=high
cd app && npm run test:rules
cd app && npx firebase functions:list --project <qa-or-prod-project>
```

Los comandos que habiliten APIs, creen secretos, desplieguen, registren webhook,
escriban QA o envíen mensajes se documentarán sólo después de su gate. Nunca se
guardarán valores secretos en una orden, captura, log o reporte.

## Archivos probables

```text
app/firebase.json
app/functions/package.json
app/functions/package-lock.json
app/functions/src/index.ts
app/functions/src/notifications/rollout.ts
app/functions/src/notifications/triggers.ts
app/functions/src/notifications/reminders.ts
app/functions/src/notifications/local-worker.ts
app/functions/src/notifications/production-recovery.ts
app/functions/src/whatsapp/http.ts
app/functions/tests/notification-rollout.test.ts
app/functions/tests/notification-runtime-worker.test.ts
app/functions/tests/reminders.test.ts
app/database.rules.json
app/tests/database.rules.test.mjs
tasks/plan.md
tasks/todo.md
Docs/implementation-reports/YYYY-MM-DD-whatsapp-production-rollout.md
```

## Riesgos abiertos que requieren respuesta humana

1. ¿Se autoriza crear el proyecto remoto `kronos-training-qa` con display name
   `Kronos Training QA`, sin organización/carpeta, Analytics, billing, datos ni
   deploy? Si debe pertenecer a una organización o carpeta Google Cloud, debe
   indicarse antes de crearlo.
2. ¿Cuál será el único teléfono QA y quién confirma su consentimiento? No responder
   con el número en el chat; se capturará manualmente en la herramienta autorizada.
3. ¿Quién realizará el alta/validación de empresa y número en Meta y aceptará sus
   términos? El usuario confirmó que hoy no existe ningún recurso Meta.
4. ¿Qué cuenta de facturación y umbral de presupuesto se usarán? No compartir datos
   financieros en el chat; se seleccionarán manualmente en Google Cloud.
5. `firebase-admin@14.4.0` fue autorizado e implementado el 2026-09-23.

## Authorization gate

El usuario revisó la spec y autorizó comenzar P7-1–P7-4 y P7-6 el 2026-09-22,
y autorizó P7-5 el 2026-09-23.
Esta autorización cubre código, pruebas y configuración local de despliegue seguro,
incluida la prueba aislada de `firebase-admin@14.4.0`, pero no cubre
crear/configurar recursos B/C o ejecutar el canario D. Billing, APIs, IAM, secretos,
rules publicadas, Functions/Scheduler, WABA, plantillas, webhook remoto, writes QA y
mensajes reales conservan gates separados.

El usuario eligió un proyecto Firebase QA aislado y confirmó que puede operar los
gates de Blaze/APIs, IAM y captura manual de secretos. Aún debe confirmar qué recursos
Meta ya existen; no se solicitarán ni registrarán IDs, teléfonos o valores secretos en
el chat.

## Resultado del endurecimiento local

P7-1–P7-4 y P7-6 quedaron implementados y verificados el 2026-09-22:

- `disabled` es el default; `qa` exige un `athleteId` canónico exacto y `production`
  continúa rechazado por el resolver.
- Triggers, recordatorios, worker y recovery fallan cerrado. Un job de otro atleta se
  detiene antes de leer el secreto, preparar el documento o ejecutar `fetch`.
- El predeploy ejecuta typecheck y build; las nueve Functions del flujo fijan
  `us-central1`, `maxInstances: 1` y `concurrency: 1`.
- Se eliminó la exportación pública `whatsappProviderHealth` porque su respuesta
  estática no demostraba salud real.
- Evidencia: 228/228 pruebas Functions, 20/20 integraciones RTDB, 38/38 reglas,
  typecheck, build, lint focalizado, `git diff --check` y revisión de cinco ejes.
- `firebase-admin` se actualizó aisladamente de 14.3.0 a 14.4.0. El audit bajó de
  seis a dos vulnerabilidades moderadas transitivas de `uuid` vía
  `@google-cloud/storage → gaxios`; no quedan vulnerabilidades altas o críticas.
  Corregir las dos restantes requiere otro cambio transitivo y no se forzó.

No se habilitaron APIs, billing, IAM, secretos, Rules/Functions/Scheduler remotos,
Meta, webhook publicado, datos QA ni mensajes reales.
