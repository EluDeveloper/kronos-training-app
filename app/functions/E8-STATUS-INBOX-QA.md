# E8-CORR — Estados tempranos: implementación y QA local

Fecha: 2026-09-09, America/Mexico_City.
Spec: functions/SPEC-whatsapp-status-inbox.md.
Autorización del usuario: «autorizo la siguiente fase».

## Resultado

Un estado firmado que llega antes del wamid queda guardado en un inbox privado.
Al quedar asociado el mensaje, el consumidor o el runner recupera el estado sin
otro POST ni otro envío. El diálogo existente de Pagos mostró la secuencia
Pendiente → Aceptado → Entregado → Leído con un solo envío fake.

La fase C0–C6 queda completa sólo en local. No activa Meta, producción ni
despliegue; E8/fase E completa sigue abierta. El inbox nuevo está apagado por
defecto y requiere demo, fake, RTDB loopback, bandera local e identidad QA.

| Gate | Resultado final de esta fase |
| --- | --- |
| Unitarias Functions | 132/132, cero fallos/omitidas |
| Integración RTDB, HTTP y reglas aisladas | 79/79, cero fallos/omitidas |
| Transporte con triggers reales del emulador | 1/1, cero fallos/omitidas |
| Playwright responsive existente | 4/4: 320, 768, 1024 y 1440 px; fixtures de UI |
| Total de esas suites | 216; no suma repeticiones RED/GREEN ni revisión externa |
| Typecheck y build | Functions y aplicación pasan |
| ESLint | Quince archivos TS de la fase pasan; no se afirma lint global |
| git diff --check | Pasa; avisos LF/CRLF no son errores de diff |
| Revisión independiente | Required corregido; segunda revisión sin Critical/Required nuevos |
| Chrome autenticado | Flujo, actualización en vivo, teclado, foco y captura verificados |
| Producción, Meta, release audit, deploy, commit/push | No ejecutados |

## Árbol del cambio de esta fase

~~~text
app/
├── database.rules.json                     ruta privada e índices del inbox
├── tests/notification-status-inbox.rules.integration.ts
└── functions/
    ├── SPEC-whatsapp-status-inbox.md
    ├── E8-STATUS-INBOX-QA.md
    ├── src/index.ts                        export del consumidor local
    ├── src/notifications/
    │   ├── jobs.ts                         decisión pura de estado existente
    │   └── realtime-job-store.ts            confirmación condicionada por wamid
    ├── src/whatsapp/
    │   ├── status-inbox.ts                  parser, minimización, hashes y TTL
    │   ├── local-status-inbox-config.ts     guard antes de I/O
    │   ├── realtime-status-inbox.ts         persistencia, correlación y limpieza
    │   ├── local-status-inbox.ts            trigger y runner paginado
    │   ├── http.ts                         bytes firmados y validación del lote
    │   └── webhook.ts                      export del clasificador ya existente
    └── tests/
        ├── status-inbox.test.ts
        ├── local-status-inbox.test.ts
        ├── status-inbox.integration.ts
        ├── status-inbox-http.integration.ts
        └── status-inbox-transport.integration.ts
~~~

Auxiliar ignorado nuevo: test-results/status-inbox-manual.local.ts. Se reutilizaron
las configuraciones locales existentes; ningún cambio de firebase.json, paquetes,
locks, CI, autenticación, páginas, worker de envío ni generador PDF.
El árbol ya contenía cambios previos y functions/ sin seguimiento: no se atribuye
todo git status a esta fase. Las compilaciones sólo generaron artefactos locales.

## Flujo y decisión de persistencia

~~~text
POST local con bytes originales
  → firma válida + guard local + identidad y lote completos válidos
  → inbox privado pending, transacción confirmada
  → asociación única por wamid
      sin job / ambiguo / queued / processing → permanece pending
      job apto → transición existente confirmada → inbox completed
  → proyección existente → Pagos Entregado/Leído

Cambio de wamid o status del job → consumidor relee el job → correlación
Interrupción                    → runner con cursor → misma correlación

Correlación ── no invoca proveedor, envío ni PDF; no escribe pagos o preferencias
~~~

Ruta: v1/notificationStatusInbox/{scopeHash}/{eventHash}. El scope separa cuenta
y receptor QA; messageKey permite consultas exactas. Ocho campos, sin teléfono,
texto, contactos, errores libres, atleta ni importes. El wamid es seudónimo, no
anónimo. Clientes, incluido Admin, no pueden leer ni escribir este almacenamiento.

Límites: 64 KiB de cuerpo, 100 entradas/cambios/estados y mensajes por lote,
consultas de dos jobs para detectar ambigüedad y páginas de 25 eventos. Validación
completa anterior a efectos; equivalentes se deduplican, clasificaciones
contradictorias de la misma clave se rechazan. HTTP 200 confirma recepción
duradera, no entrega al destinatario. Fallos de persistencia devuelven 500 genérico.

TTL de 30 días desde eventAt, que no es posterior a receivedAt; coincide con el
mínimo aprobado. Duplicados no renuevan recepción inicial ni vencimiento. Limpieza
local explícita de hasta 50 vencidos, revalidando cada registro en su transacción.
No hay scheduler de borrado automático ni transacción global inbox/job/proyección.
Un fallo parcial conserva progreso recuperable. No se adivina asociación sin wamid.

## Pruebas y revisión

- TDD: RED inicial por contratos ausentes, seguido de implementación por pasos.
  Se rechazaron identidad inválida, firma vía HTTP, fechas futuras/imposibles,
  exceso y estados no textuales; los campos privados se excluyeron del registro.
  Una regresión detectó aceptación por
  coerción de un array; ahora status debe ser string antes de clasificarlo.
- Persistencia: duplicados concurrentes y caché fría; primera recepción estable;
  rechazo antes de I/O con guard apagado; limpieza de 53 vencidos en 50 + 3,
  conservando el registro vigente. Un cursor visita 29 filas en 25 + 4.
- Carreras: evento anterior al job, wamid anterior a accepted y job anterior al
  evento. La asociación ambigua o cambiada no aplica un estado a otro trabajo.
  Un fallo inyectado después de guardar el job deja pending; el reintento confirma
  completed sin hacer retroceder read. Se recorren 55 eventos del mismo wamid y
  un runner de 87 filas sin atascarse detrás de mensajes desconocidos.
- HTTP: firmado sobre rawBody, no sobre request.body discordante; lotes mixtos
  inválidos sin efectos; error genérico ante fallo de persistencia; BAJA y modo
  deshabilitado conservan sus regresiones. Reglas prueban cinco contextos de
  acceso, incluyendo Admin y anónimo, sin abrir la ruta ni consultas de clientes.
- Revisión independiente: detectó un lote con la misma clave failed y dos
  clasificaciones retryable diferentes. Se añadió regresión HTTP que exige 400
  y compara inbox, job y preferencias intactos. Su observación opcional motivó
  probar además dos registros individualmente válidos contra almacenamiento.
- Ese conflicto reprodujo una excepción del callback RTDB durante un reintento
  asíncrono que no rechazaba la promesa y dejaba la prueba abierta. Los callbacks
  nuevos abortan con undefined; después se verifica committed y se rechaza fuera
  del callback. La regresión ahora termina correctamente y conserva el original.
  Segunda revisión cerró el Required; sus diez pruebas puras también pasaron,
  sin que el revisor accediera a DB/navegador o modificara archivos.
- La prueba de transporte hizo POST real a 5002 antes de crear el pago. Los
  triggers registrados de pago, worker, inbox y proyección convergieron a delivered;
  read seguido de sent no retrocedió. attemptNumber permaneció en 1 y pago y
  consentimiento se compararon íntegros. Proveedor fake, no tráfico de Meta.

Las suites de dominio usaron database-only 9010; transporte usó su propia suite
Functions+RTDB después de detener la anterior. Una ejecución exploratoria HTTP se
solapó con la regresión RED bloqueada y contaminó sus fixtures: se detuvo ese
proceso y se repitió secuencialmente. El resultado final 79/79 no tuvo solapamiento.
No se eliminaron pruebas ni aserciones para obtener verde.

## Chrome: evidencia observable, no mocks de backend

Se conservó la sesión manual del usuario y se trabajó en /pagos. No se leyó Auth,
contraseñas, cookies, tokens ni respaldos. Nuevo atleta ficticio «QA estado temprano»
con pago de 200 de 500, saldo 300, consentimiento activo y un recibo pendiente.

1. HTTP firmado delivered a 5003: 200; job queued e inbox pending. El diálogo
   abierto mantuvo «Pendiente», sin confundir recepción con envío o entrega.
2. Una ejecución del worker con FakeWhatsAppProvider: una solicitud, job accepted.
   Tras proyectar, Chrome mostró «Aceptado». Aún no se invocaba recuperación.
3. Runner explícito, sin otro POST ni proveedor: un evento procesado, delivered,
   un intento. Chrome actualizó «Entregado» en vivo; captura inline inspeccionada.
4. POST read posterior: 200, job read, dos eventos completed. Chrome mostró «Leído».
   Cada etapa comprobó igualdad completa del pago y las preferencias del fixture.
5. Modal con nombre accesible, aria-modal=true y región aria-live=polite. A 767 ×
   674 CSS px no hubo desbordes del diálogo ni documento. Tab llevó a «Cerrar»;
   Escape cerró y devolvió foco a «Notificaciones de QA estado temprano».
6. Consulta final de consola: cero errores y warnings. Muestra acotada de recursos
   locales de la red: 200/304; sin revisar material de autenticación. Los POST
   provinieron del helper, no se atribuyen a la red del navegador.

Functions-only 5003 no registró triggers de RTDB porque 9000 pertenece a la suite
manual existente. Aquí worker/runner/proyección se invocaron explícitamente para
demostrar recuperación tras interrupción. El disparo automático se acredita
separadamente por la prueba real 5002/9010, no por el recorrido manual.

Playwright 4/4 usa una página fixture del componente, contexto nuevo, sin sesión
del usuario ni backend. Cubre 20 estados, carga/vacío/error/sin permiso, foco,
desbordes y contraste de Cerrar/Folio. Sus PNG están en
test-results/payment-notifications/. La captura del flujo real se inspeccionó
inline; no se afirma que exista un PNG de Chrome guardado en disco.

## Comandos reproducibles

Desde C:/Projects/Kronos/kronos-training-app/app, sin instalar dependencias:

~~~powershell
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
npm run typecheck
npm run build
git diff --check
.\node_modules\.bin\playwright.cmd test --config e2e/payment-notifications.config.ts

# RTDB 9010 database-only; nunca sustituir por el entorno manual 9000:
$env:FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9010'
$env:GCLOUD_PROJECT='demo-kronos-training'
node --require ./scripts/node-userinfo-preload.cjs --import tsx --test --test-reporter=spec --test-concurrency=1 tests/database.rules.test.mjs tests/notification-opt-out.rules.integration.ts tests/notification-status-inbox.rules.integration.ts functions/tests/status-projection.integration.ts functions/tests/worker.integration.ts functions/tests/whatsapp-webhook.integration.ts functions/tests/opt-out.integration.ts functions/tests/opt-out-http.integration.ts functions/tests/status-inbox.integration.ts functions/tests/status-inbox-http.integration.ts
~~~

ESLint sin escrituras: los quince TS enumerados en el árbol, con -c .eslintrc.cjs.
Se aplicó --fix sólo a esos archivos antes de la pasada final. Transporte: comando
emulators:exec de la spec limitado a status-inbox-transport.integration.ts, con
fake/local, qa-business/qa-number y la clave de fixture pública indicada allí.
La bandera BAJA no es requisito del inbox; sus guards se probaron por separado.

EPERM al compilar/formatear se resolvió mediante ejecución autorizada focalizada.
No se ampliaron dependencias. La CLI intentó una sonda automática de metadatos
GCP bloqueada por EACCES: no se evitó esa restricción ni se usaron credenciales
reales. Warnings de permission_denied en reglas son expectativas negativas;
NO_COLOR/FORCE_COLOR de Playwright no fue un error de la aplicación. El scheduler
no se probó porque Pub/Sub no estaba activo; fuera de este alcance.

## Preservación y entrega

Once hashes protegidos iguales al inicio: firebase.json, manifiestos/locks de app
y Functions, worker.ts, inbound-opt-out.ts, realtime-opt-out.ts, servicio cliente
de preferencias y páginas Pagos/Atletas. Cambios previos preservados; sin reset,
commit, push ni cambios fuera de app/.

Las suites retiraron sólo sus fixtures sintéticos en 9010; los 53 registros
vencidos borrados por retención son reproducibles desde pruebas, no datos reales.
Los resets históricos se ejecutaron exclusivamente en ese emulador aislado.
Se detuvieron las instancias temporales 9010/5002 y Functions-only 5003. El entorno
manual 9000/9099/4173 y su sesión se conservaron sin reinicio.

Retenidos para inspección manual: qa-inbox-ui, qa-inbox-plan, una preferencia,
un pago 2026-09, job-68c5d79c407b7a408f723156a1d1856c y su proyección read, y dos
eventos completed del scope QA. No se retiraron fixtures previos de otras fases.
No repetir seed sobre ellos: el helper exige ausencia para evitar sobrescrituras.

## Límites y siguiente decisión

No hay recuperación garantizada si nunca existe wamid, si su asociación es ambigua
o si el evento expiró. El runner necesita cursor y ejecución explícita; la limpieza
no sucede por declarar expiresAt. Antes de activar tráfico real se requieren otra
autorización, controles operativos/abuso y cuotas, retención programada, proveedor
Meta/secretos/plantillas reales y estrategia de despliegue. Nada de ello se habilitó.

Las guías de implementación incremental y TDD organizaron los pasos RED/GREEN;
seguridad motivó minimización, guards e índices privados; revisión independiente
cerró el conflicto de lote y condujo a la regresión del callback asíncrono. La guía
de pruebas de navegador exigió distinguir Chrome real del fixture responsive, y
documentación preserva aquí decisiones, evidencia y límites para la próxima fase.
