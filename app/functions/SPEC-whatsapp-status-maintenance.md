# Spec: E8-MANT — Mantenimiento periódico del inbox, sólo local

Estado: implementada y verificada localmente el 2026-09-09; M0–M4 completos.
Autorización específica del usuario: «si, autorizo» tras revisar E8-MANT.
Evidencia y límites de verificación: E8-STATUS-MAINTENANCE-QA.md.
Fecha: 2026-09-09, America/Mexico_City.
Solicitud que origina la propuesta: «listo, puedes continuar con la siguiente fase».
Módulo: athletes-payments; verificación transversal: experience-quality.
Mapa aprobado: ../../specs/CAPABILITY-MAP.md.
Spec matriz: ../../specs/SPEC-payment-notifications-whatsapp.md.
Precedente implementado: SPEC-whatsapp-status-inbox.md / E8-STATUS-INBOX-QA.md.

## Objetivo y alcance de la continuación

Completar la operación local del inbox de estados tempranos: un proceso iniciado
explícitamente podrá recuperar estados pendientes y limpiar eventos vencidos en
ciclos pequeños, sin pedir otro webhook ni volver a enviar el mensaje.

La aprobación específica cubre el ejecutor y la limpieza periódica local descritos,
su QA sintético y su cierre al entregar. No cubre infraestructura, tráfico real o
despliegue. Se mantiene el gate de AGENTS.md para cualquier ampliación de alcance.

Supuestos aprobados y conservados:

1. Seguimos en emuladores y con datos ficticios; Meta real permanece apagado.
2. Sólo operamos el inbox de estados del scope QA configurado, no todos los scopes.
3. La periodicidad es de 60 segundos después de terminar cada ciclo;
   el proceso sólo funciona mientras está abierto. No es un servicio instalado.
4. Conservamos el TTL de 30 días y los límites ya aprobados: 25 eventos por página
   de recuperación y hasta 50 vencidos por llamada de limpieza.
5. No se cambian cálculos, pagos, consentimiento, BAJA, políticas de reintento,
   número de intentos, PDF, pantallas, autenticación, permisos ni reglas.

## Evidencia inicial y dependencia

Inspección de código durante la propuesta del 2026-09-09, anterior a implementar:

- src/whatsapp/local-status-inbox.ts ofrece runLocalStatusInboxBatch con cursor;
  su comentario declara que es un runner explícito, no un scheduler.
- src/whatsapp/realtime-status-inbox.ts ofrece cleanup(now), acotado al scope;
  no había invocador periódico que lo llamara antes de esta fase.
- La correlación después de cambios del job ya tiene un trigger local. Esta fase
  complementa ese mecanismo ante interrupciones; no lo sustituye.
- E8-STATUS-INBOX-QA.md documenta como límite que expiresAt no ejecuta borrado
  automático y que el runner requiere un invocador.

La fase F del roadmap, notificaciones push, no se inicia. E8/fase E sigue abierta:
operación real, proveedor/plantillas, acabado del PDF y gates publicados mantienen
su alcance y autorizaciones independientes.

## Contrato implementado

### Inicio y seguridad

- Nuevo ejecutable de Node local, sin endpoint HTTP, export de Cloud Function,
  instalación de servicio, tarea del sistema ni automatización de Codex.
- Exigir exactamente --once o --watch y --apply. Sin opt-in válido: mostrar ayuda
  sanitizada y terminar sin inicializar Firebase ni efectuar I/O de datos.
- Reutilizar el guard del inbox y añadir bandera del ejecutor:
  KRONOS_WHATSAPP_STATUS_MAINTENANCE_MODE=local.
- Exigir fake, demo-kronos-training, cuenta/receptor qa-* y RTDB loopback en
  puerto 9000 o 9010. Ninguna URL, ruta de borrado o secreto por argumentos.
- Revalidar guard e identidad antes de cada ciclo. Si cambian, detener el proceso
  sin reutilizar un cursor perteneciente a otro scope.
- La autorización de esta fase cubre sólo ejecución de QA y cierre al terminar;
  no dejar el proceso funcionando indefinidamente en segundo plano.

### Un ciclo y continuidad

1. Recuperar una página, como máximo 25 eventos, con el runner existente.
2. Guardar en memoria el siguiente cursor sólo después de completar esa página.
3. Ejecutar una llamada a cleanup con un máximo de 50 registros vencidos,
   conservando su revalidación transaccional de expiresAt.
4. Emitir un resultado agregado: estado del ciclo, visitados, pendientes,
   eliminados, duración y si quedan páginas; sin IDs, wamid, hashes de scope,
   teléfonos, nombres, cuerpos de webhook, errores crudos ni stack traces.

--once ejecuta un ciclo y termina. Es una pasada acotada, no una promesa de vaciar
todo el inbox. --watch conserva el cursor entre ciclos; al terminar el recorrido,
el siguiente comienza desde el inicio para revisar eventos que sigan pendientes.
Los eventos sin job no impiden visitar páginas posteriores.

No se persiste un checkpoint nuevo: al reiniciar el proceso se empieza desde el
principio, con replay idempotente. Reinicios demasiado frecuentes pueden retrasar
las últimas páginas; no se promete progreso durable ante reinicios continuos.

No solapar ciclos dentro del proceso ni utilizar setInterval que lance trabajo
sin esperar. Varias instancias accidentales conservan la seguridad transaccional
existente, aunque duplican lecturas; no se añade un lock distribuido.

Ante fallo de página, persistencia o limpieza: código genérico, salida no cero y
cese del bucle, sin declarar éxito ni saltar silenciosamente registros corruptos.
Un reintento posterior puede repetir trabajo parcial de forma idempotente.

SIGINT/SIGTERM cancela la próxima espera y evita iniciar otro ciclo. El trabajo
ya iniciado se espera antes de cerrar la conexión. No se simula cancelación de
una transacción pendiente con Promise.race ni se promete un tiempo máximo si la
base deja de responder. Los límites son de operaciones, no de latencia de red.

### Datos excluidos y proyección

Único destino de borrado: eventos vencidos bajo el scope QA del inbox. Nunca
notificationJobs, intentos, preferencias, marcas de BAJA, atletas o pagos.
El registro desaparecido no se recupera desde el inbox; los fixtures de QA sí son
reproducibles desde las pruebas. No se modifica ni amplía la retención de negocio.

La correlación puede actualizar el estado del job conforme al contrato existente,
sin llamar a proveedor, worker de envío ni generador PDF. El trigger de proyección
existente refleja el resultado en Pagos; el proceso de mantenimiento no inventa
una segunda proyección ni afirma que Entregado equivalga a pago liquidado.

## Estructura y tecnología

Node 22 declarado en Functions, TypeScript, firebase-admin 14.3.0 y
firebase-functions 7.3.2 instalados. Sin dependencias ni scripts de paquete nuevos.
Las rutas añadidas siguientes son relativas a app/functions/:

~~~text
src/whatsapp/local-status-maintenance.ts          ciclo, guard y cursor inyectables
src/whatsapp/status-maintenance-cli.ts            argumentos, señales y salida
tests/status-maintenance.test.ts                 guard, cursor, reloj y errores fake
tests/status-maintenance-cli.test.ts             argumentos, bucle, espera y lifecycle
tests/status-maintenance.integration.ts          RTDB aislado y CLI real
E8-STATUS-MAINTENANCE-QA.md                       evidencia final
~~~

Reutilizar local-status-inbox.ts y RealtimeStatusInbox sin cambiar sus contratos.
No exportar el CLI desde index.ts: se inicia sólo con Node explícitamente.
Si se descubre que hacen falta esquema, índices, reglas, dependencias o cambios
de comportamiento fuera de esos límites, volver a propuesta antes de aplicarlos.

Estilo existente: código/tipos en inglés, comunicación en español, comillas simples,
sin punto y coma y reloj/espera inyectables. Patrón real que se debe conservar:

~~~ts
if (!getLocalStatusInboxConfig())
  return { status: 'disabled' as const, processed: 0 }
~~~

## Incrementos autorizados y checklist local

La autorización cubre M0–M4; las tareas
y checkpoints de esta rebanada siguen el destino local de functions/SPEC-* de
las fases anteriores, sin reescribir tasks/todo.md histórico de la raíz.

- [x] M0 — Aprobación registrada y trece hashes protegidos guardados.
- [x] M1 — Ciclo acotado con evidencia RED/GREEN.
- [x] M2 — CLI, serialización, cursor y parada con pruebas.
- [x] M3 — Proceso real e integración aislada.
- [x] M4 — Regresiones, revisión, Chrome y reporte.

| Paso | Aceptación y verificación | Archivos probables |
| --- | --- | --- |
| M0 | Registrar aprobación y hashes protegidos antes de código | Esta spec |
| M1 | Ciclo de una página, limpieza acotada y resultado sin PII; RED/GREEN unitario | local-status-maintenance.ts, status-maintenance.test.ts |
| M2 | CLI sólo opt-in, ciclos seriales, cursor y parada comprobados con reloj/espera inyectados | Los dos anteriores, status-maintenance-cli.ts, status-maintenance-cli.test.ts |
| M3 | Proceso real contra RTDB 9010: recuperación, paginación y limpieza; pagos/consentimientos/intentos iguales | status-maintenance.integration.ts y, si la prueba lo exige, los dos módulos nuevos |
| M4 | Regresiones, revisión independiente, Chrome del flujo completo y reporte | Esta spec, E8-STATUS-MAINTENANCE-QA.md, auxiliar QA ignorado |

Checkpoint tras M2: guard y parada sin I/O fuera de scope. Tras M3: prueba de
persistencia y borrado acotado. Tras M4: sólo entonces cierre local de la fase.
Orden secuencial M0 → M1 → M2 → M3 → M4; revisión de código puede ser independiente.

## Criterios de aceptación y QA

- [x] Un evento temprano almacenado se recupera después de la asociación aunque
  se haya omitido el intento inmediato; no hay segundo POST ni envío.
- [x] Más de 25 eventos se visitan en varios ciclos; los pendientes desconocidos
  no bloquean la cola y read no retrocede.
- [x] Se borran sólo eventos vencidos del scope configurado, como máximo 50 por
  ciclo; se conservan vigentes, otro scope y documentos de negocio completos.
- [x] No hay ciclos solapados, acceso con guard apagado, éxito falso ante fallo
  ni continuación tras parada; reloj fake evita esperar minutos en pruebas.
- [x] Inicio/parada del CLI real y códigos de salida se prueban sin instalar un
  servicio; la salida no contiene identificadores o errores privados.
- [x] Pasan unitarias, integración, regresiones de estados/BAJA/reglas, tipos,
  builds, lint focalizado y revisión independiente. No ocultar fallos basales.
- [x] Chrome muestra el resultado recuperado en Pagos desde un fixture conocido,
  con pago/consentimiento intactos, consola limpia y foco correcto. Se distingue
  la proyección explícita manual del trigger real del emulador.

Cierre: 234 pruebas aprobadas, builds/tipos/lint aprobados y revisión independiente
sin Critical/Required abiertos. Las señales se probaron con manejadores reales,
temporizador y SDK, emitiéndolas dentro del proceso hijo. La PTY de Windows no
propagó Ctrl+C al watcher manual; se cerró sólo ese PID QA de forma forzada. No se
afirma haber acreditado entrega externa de señales ni parada elegante desde esa PTY.
Ver detalle, preservación de servicios y fixtures en E8-STATUS-MAINTENANCE-QA.md.

Pruebas automatizadas y resets sólo en RTDB 9010. Preservar 9000/9099/4173, sesión
manual y fixtures anteriores. Para Chrome, crear un scope y atleta QA nuevos tras
comprobar ausencia; no activar mantenimiento en el scope QA de la fase anterior.
Se puede usar Functions-only 5003 con llamadas explícitas de proyección, documentando
esa limitación, y acreditar triggers en otra suite 5002/9010. Si falta login, pedir
al usuario iniciarlo manualmente; nunca inspeccionar material de autenticación.

Playwright responsive existente a 320/768/1024/1440 como complemento, sin sustituir
Chrome ni atribuir la verificación del backend a su fixture de UI.

## Comandos de referencia aprobados

La ejecución efectiva y sus resultados constan en E8-STATUS-MAINTENANCE-QA.md;
esta sección conserva el procedimiento aprobado, no atribuye ejecución a cada ejemplo.

Desde C:/Projects/Kronos/kronos-training-app/app, con dependencias ya instaladas:

~~~powershell
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
npm run typecheck
npm run build
.\node_modules\.bin\eslint.cmd functions/src/whatsapp/local-status-maintenance.ts functions/src/whatsapp/status-maintenance-cli.ts functions/tests/status-maintenance.test.ts functions/tests/status-maintenance-cli.test.ts functions/tests/status-maintenance.integration.ts -c .eslintrc.cjs
git diff --check
.\node_modules\.bin\playwright.cmd test --config e2e/payment-notifications.config.ts

# Arranque aislado, tras comprobar que los puertos estén libres:
.\node_modules\.bin\firebase.cmd emulators:start --config firebase.status-qa.local --only database --project demo-kronos-training

# En otra terminal: sólo sobre el emulador y fixtures QA autorizados.
$env:GCLOUD_PROJECT='demo-kronos-training'
$env:FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9010'
$env:KRONOS_NOTIFICATION_WORKER_MODE='fake'
$env:KRONOS_WHATSAPP_STATUS_INBOX_MODE='local'
$env:KRONOS_WHATSAPP_STATUS_MAINTENANCE_MODE='local'
$env:KRONOS_WHATSAPP_QA_ACCOUNT_ID='qa-maintenance'
$env:KRONOS_WHATSAPP_QA_NUMBER_ID='qa-number'
node --require ./scripts/node-userinfo-preload.cjs --import tsx --test --test-concurrency=1 functions/tests/status-maintenance.integration.ts

# Ejecutable local, después de compilar y preparar sólo fixtures propios:
node functions/lib/src/whatsapp/status-maintenance-cli.js --once --apply
node functions/lib/src/whatsapp/status-maintenance-cli.js --watch --apply
~~~

El entorno de la CLI Firebase se aisló como en E8-CORR, sin leer credenciales ni
evitar restricciones de red. El reporte final enumera comandos de regresión
efectivamente ejecutados, sin copiar resultados de fases anteriores como nuevos.

## Riesgos, alternativas y límites

| Riesgo / alternativa | Decisión implementada o límite conservado |
| --- | --- |
| Borrar registros equivocados | Guard doble, scope fijo, TTL y máximo 50; prueba de preservación de otro scope y negocio |
| Activación accidental | Ejecutable no exportado, flag local y --apply; no autoinicio |
| Filtración por logs | Sólo contadores y códigos fijos, sin exception.message/stack |
| Error parcial / registro inválido | Detener y reportar error; no saltarlo ni inventar éxito |
| Reinicio continuo o ingreso superior al consumo | Cursor sólo en memoria; límite documentado, no promesa de cola productiva |
| Nuevo checkpoint persistido | Diferido: supondría esquema/retención adicionales innecesarios para este corte local |
| Scheduler cloud | Diferido: infraestructura y operación real requieren otra autorización |

Siempre: TDD, preservación del árbol sucio, pruebas por incremento, alcance local.
Preguntar antes: esquema/reglas, nuevos datos, dependencias, infraestructura,
retención distinta, envíos, producción y cambios de destino de QA.
Nunca: secretos en código/logs, lectura de Auth, borrar datos reales, instalar un
servicio persistente, modificar pagos, hacer commit/push o desplegar sin petición.

Las guías de especificaciones y seguridad exigieron la aprobación recibida antes
de implementar. Las referencias comunes definition-of-done.md y security-checklist.md
no están disponibles en la instalación global; se aplican las instrucciones leídas
de las skills y los gates explícitos de AGENTS.md. No hubo cambio de comportamiento,
arranque de servicios ni escrituras de base durante la preparación de la propuesta;
la implementación y el QA local se ejecutaron después de la autorización específica.
