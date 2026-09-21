# Spec: E8-CORR — Estados tempranos de WhatsApp, sólo local

Estado: implementada y verificada localmente el 2026-09-09; C0–C6 completados.
Autorización del usuario: «autorizo la siguiente fase» (E8-CORR).
Evidencia de cierre: E8-STATUS-INBOX-QA.md. No habilita producción ni Meta real.
Fecha: 2026-09-09, America/Mexico_City.
Módulo: athletes-payments; QA transversal: experience-quality.
Mapa aprobado: ../../specs/CAPABILITY-MAP.md.
Spec matriz: ../../specs/SPEC-payment-notifications-whatsapp.md.
Precedentes locales: E8-UI-QA.md y E8-BAJA-PERSISTENCE-QA.md.

## Objetivo y evidencia

Evitar que un estado de entrega válido se pierda cuando llega antes de que
el backend guarde el providerMessageId (wamid) del job. El personal consultará
el resultado en el diálogo existente de Pagos, sin reenviar el mensaje.

Inspección inicial de la propuesta del 2026-09-09, anterior a la implementación:
- src/whatsapp/webhook.ts, processParsedEvent: si no encuentra el job devuelve
  ignored/unknown-message; no persiste el evento pendiente.
- tests/whatsapp-webhook.test.ts, "an early webhook can be replayed after its
  message is correlated": la prueba vuelve a entregar explícitamente el payload.
- src/notifications/local-worker.ts guarda la respuesta fake; la proyección
  existente ya puede mostrar el estado posterior en Pagos.
- Los reportes anteriores señalan correlación temprana como pendiente separado.

Esto es una capacidad de fiabilidad de notificaciones dentro del mapa aprobado,
no una nueva pantalla ni un cambio de cálculo financiero.

## Supuestos y límites de autorización

1. Continuar exclusivamente en app/, con el stack y dependencias instalados:
   TypeScript, Node 22 declarado en Functions, firebase-admin 14.3.0 y
   firebase-functions 7.3.2; Vue/Vuetify/Pinia sin cambios.
2. Mantener Meta real, producción y despliegue apagados.
3. La autorización explícita posterior a la propuesta cubre almacenamiento
   privado, índices, consumidor local y pruebas con datos ficticios descritos.
   No extiende el alcance a producción ni al transporte real de Meta.
4. No modificar autenticación, preferencias/BAJA, pagos, ventas, PDFs, cadencia
   ni políticas de reintentos del proveedor. Recuperar un estado NO es reenviar.
5. No instalar paquetes, cambiar firebase.json/CI ni tocar tareas históricas
   fuera de app/. Los checkpoints locales siguen la convención functions/SPEC-*.
6. Conservar la sesión manual y fixtures anteriores de 9000/9099/4173.
   No exportar ni leer Auth, tokens, cookies o credenciales.

## Alcance propuesto

### Entrada validada, independiente de BAJA

- Guard antes de inicializar DB: modo fake, proyecto demo-kronos-training,
  RTDB localhost/127.0.0.1 y puerto entero 1..65535, más bandera nueva
  KRONOS_WHATSAPP_STATUS_INBOX_MODE=local.
- Identidad explícita mediante las variables QA existentes
  KRONOS_WHATSAPP_QA_ACCOUNT_ID y KRONOS_WHATSAPP_QA_NUMBER_ID, ambas qa-*.
  No depender de activar BAJA para activar el inbox, ni viceversa.
- Sólo datos derivados del rawBody cuya firma HMAC ya fue comprobada.
  Verificar object, field, entry.id y metadata.phone_number_id antes de escribir.
- Tope local propuesto: 64 KiB por cuerpo, 100 entradas/cambios/estados por lote;
  IDs y estructuras acotados. Validar todo el lote antes de efectos laterales,
  incluidos lotes mixtos BAJA + estados cuando ambos modos estén habilitados.
- providerMessageId respeta el formato limitado ya usado por el worker;
  estado en sent/delivered/read/failed; timestamp en segundos enteros válidos,
  no futuro y convertido sin desbordamiento. Eventos con 30 días o más se ignoran.
- Conservar sólo clasificación retryable existente para failed, nunca errores
  libres, texto, contactos, recipient_id ni cuerpo completo.
- Firma inválida: 401; payload inválido: 400; fallo de persistencia: 500 genérico.
  Un estado temprano válido sólo obtiene 200 después de confirmación duradera.
  200 significa recibido para procesamiento, no entregado ni leído.
- Con bandera apagada se conserva el comportamiento previo de estados y BAJA.
  El endurecimiento de producción del endpoint completo queda fuera de esta fase.

### Inbox privado y temporal

Ruta propuesta:
v1/notificationStatusInbox/{scopeHash}/{eventHash}

scopeHash = SHA-256 de la tupla de cuenta y número receptor QA.
eventHash = SHA-256 de la tupla scope, providerMessageId, estado y timestamp.
messageKey = SHA-256 de scope y providerMessageId, para consulta exacta acotada.

Registro mínimo:
- providerMessageId, messageKey, providerStatus, retryable, eventAt;
- receivedAt inicial, expiresAt, processingStatus: pending | completed.

No guardar athleteId, teléfono, nombre, PDF, dinero ni identificadores de cuenta
sin hash en el inbox. El wamid es un identificador seudónimo, no dato anónimo;
se conserva sólo porque permite la correlación exacta con el job existente.

Retención propuesta: hasta 30 días, con expiresAt = mínimo de
receivedAt + 30 días y eventAt + 30 días. Duplicados no renuevan fechas ni TTL.
Misma clave con contenido canónico contradictorio falla cerrado, sin sobrescribir.

Reglas: lectura y escritura cliente denegadas para toda la ruta, también Admin.
Índices por messageKey y expiresAt bajo cada scope. No abrir permisos de jobs,
proyección ni preferencias. Admin SDK valida explícitamente su entrada.

Limpieza local explícita: hasta 50 registros vencidos por llamada, confirmando
expiresAt otra vez dentro de cada transacción. Borrar únicamente registros
del inbox de este scope; nunca pagos, consentimientos, jobs o marcas de BAJA.
No instalar un scheduler ni afirmar que la retención se ejecuta sola.

### Correlación y recuperación sin reenvío

1. Persistir primero el evento inmutable, mediante transacción confirmada.
2. Consultar la asociación exacta providerMessageId -> job.
   Cero coincidencias: mantener pending. Dos coincidencias: no elegir una;
   mantener pendiente y devolver un resultado operativo sanitizado.
3. Aplicar sólo las transiciones ya permitidas por el contrato de jobs.
   Revalidar dentro de la escritura el providerMessageId actual del job.
   queued/processing, cuando aún no pueden admitir el estado, permanecen
   pendientes; no consumirlos como "obsoletos" antes de finalizar el envío.
4. Marcar completed sólo después de confirmar el estado correspondiente,
   o una decisión definitiva de duplicado/estado ya superado. Una lectura
   optimista de caché no basta. Fallo entre ambas escrituras permite repetir.
5. Intentar correlación después de persistir el evento y desde un consumidor
   local de cambios relevantes del job (providerMessageId o status).
   Escuchar sólo la creación del wamid no basta si precede al estado accepted.
6. Releer siempre el job actual; no aplicar snapshots viejos del trigger.
   Cambios causados por el propio consumidor convergen sin bucles de escritura.
7. Añadir runner local explícito con páginas de 25 eventos y cursor estable.
   Los primeros pendientes sin asociación no deben impedir visitar posteriores.
   Consultas por mensaje también acotadas y paginadas; nunca truncar en silencio.
8. La proyección existente refleja finalmente Entregado/Leído en Pagos.
   Inbox/replay no invocan provider, worker de envío ni generador PDF.

No se promete una transacción global entre inbox/job/proyección. La convergencia
depende de triggers locales o del runner explícito tras una interrupción.
Si nunca se obtuvo el wamid, no adivinar asociación por teléfono, hora o atleta:
unknown permanece sin reenvío automático. Tras expirar el inbox no hay
recuperación histórica garantizada.

## Criterios de aceptación

- [x] Un único POST firmado de Entregado anterior al wamid permanece guardado;
  al terminar el envío fake se aplica sin repetir el POST y aparece en Pagos.
- [x] Leído antes de Entregado/Enviado no retrocede; duplicados, concurrencia,
  caché fría y fallos antes/después del cambio de job convergen correctamente.
- [x] Hay pruebas de ambas carreras: job anterior/posterior al inbox y wamid
  anterior a accepted; sin asociación o con asociación ambigua no se inventa éxito.
- [x] Ninguna recuperación llama al proveedor ni cambia datos financieros,
  preferencias o número de intentos. unknown sin wamid no se reenvía.
- [x] Firma/cuenta/timestamp/límites inválidos no crean registros; acceso cliente
  denegado; modo apagado y BAJA/mensajes mixtos conservan sus regresiones.
- [x] Limpieza elimina sólo inbox vencido, no renueva TTL por duplicados y
  el runner no deja eventos posteriores sin visitar por pendientes antiguos.
- [x] Pruebas, tipos, builds y lint enfocado pasan; Chrome recorre el flujo
  afectado; reporte distingue evidencia real, simulada y gates no ejecutados.

## Plan autorizado y checklist local

Orden secuencial; cada incremento debe quedar comprobado antes del siguiente.
La autorización cubre C0–C6. La checklist local es el destino de tareas de esta
fase, conservando la convención aprobada y sin alterar las tareas raíz históricas.

- [x] C0 — Registrar autorización, revisar estado y guardar hashes protegidos.
- [x] C1 — Contrato puro validado con RED/GREEN.
- [x] C2 — Persistencia/guard/reglas/limpieza comprobados con RTDB.
- [x] C3 — Correlación transaccional y concurrencia comprobadas.
- [x] C4 — HTTP y regresiones de lotes mixtos comprobados.
- [x] C5 — Consumidor, runner y transporte real del emulador comprobados.
- [x] C6 — Chrome, gates, revisión independiente y reporte.

| Paso | Resultado y comprobación | Archivos probables, máximo cinco por paso |
| --- | --- | --- |
| C0 | Registrar autorización y plan/checklist local | Esta spec |
| C1 | Parser/identidad/TTL puros con RED/GREEN | status-inbox.ts, status-inbox.test.ts |
| C2 | Guard independiente y persistencia privada; deduplicación/reglas/limpieza en RTDB | local-status-inbox-config.ts, realtime-status-inbox.ts, status-inbox.integration.ts, database.rules.json, tests/notification-status-inbox.rules.integration.ts |
| C3 | Transición condicionada por wamid y recuperación sin llamadas de envío | jobs.ts, realtime-job-store.ts, status-inbox.ts, status-inbox.test.ts, status-inbox.integration.ts |
| C4 | HTTP firmado y validación completa de lotes mixtos; pruebas de regresión | http.ts, status-inbox.ts, status-inbox-http.integration.ts, opt-out-http.integration.ts |
| C5 | Consumidor de cambios del job y runner; prueba del disparo en emulador real | local-status-inbox.ts, index.ts, local-status-inbox.test.ts, status-inbox-transport.integration.ts |
| C6 | Recorrido Chrome, gates y reporte | Esta spec, E8-STATUS-INBOX-QA.md, helper QA ignorado |

Rutas abreviadas: código en functions/src/whatsapp/, salvo jobs.ts y
realtime-job-store.ts en functions/src/notifications/ e index.ts en functions/src/.
Pruebas *.test.ts y *.integration.ts en functions/tests/, salvo tests/ indicado.
C2 y C5 son checkpoints de revisión de persistencia y runtime respectivamente.
No cambiar src/pages/pagos.vue ni el diálogo para mostrar el resultado.

## Estilo

Seguir el patrón real de guard temprano antes de I/O que utiliza la proyección:

~~~ts
if (!isLocalNotificationWorkerEnabled())
  return 'disabled' as const
~~~

Añadir el guard específico de esta fase antes de abrir la base. Código y tipos
en inglés, reporte y textos existentes en español; sin punto y coma, comillas
simples, funciones pequeñas y reloj/DB inyectables. Errores por códigos fijos.
Reusar la política de transiciones en lugar de crear otra máquina de estados.

## Plan de verificación aprobado y ejecución

Desde C:\Projects\Kronos\kronos-training-app\app.
No instalar dependencias ni descargar herramientas. Las rutas nuevas de pruebas
se crearon después de la autorización. Resultados finales en E8-STATUS-INBOX-QA.md.
Se separó la integración database-only de la prueba de triggers/HTTP para evitar
que los consumidores automáticos alteraran los fixtures de las suites de dominio.

~~~powershell
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
npm run typecheck
npm run build
.\node_modules\.bin\eslint.cmd functions/src/whatsapp/status-inbox.ts functions/src/whatsapp/local-status-inbox-config.ts functions/src/whatsapp/realtime-status-inbox.ts functions/src/whatsapp/local-status-inbox.ts functions/src/whatsapp/http.ts functions/src/notifications/jobs.ts functions/src/notifications/realtime-job-store.ts functions/src/index.ts functions/tests/status-inbox.test.ts functions/tests/local-status-inbox.test.ts functions/tests/status-inbox.integration.ts functions/tests/status-inbox-http.integration.ts functions/tests/status-inbox-transport.integration.ts functions/tests/opt-out-http.integration.ts tests/notification-status-inbox.rules.integration.ts -c .eslintrc.cjs
git diff --check
~~~

Node test/tsx existentes; no framework nuevo. Integración aislada en 9010 y HTTP
5002 usando firebase.functions-qa.local existente (hub 4410/logging 4510).
Antes de arrancar: comprobar puertos; no terminar procesos ajenos por conflictos.
Sólo variables de proceso fake/demo, bandera local y IDs QA. Usar una clave HMAC
ficticia pública; no leer ni exportar secretos reales. CLI con directorio aislado
y sin credenciales de proceso. Comando conjunto previsto:

~~~powershell
$env:GCLOUD_PROJECT='demo-kronos-training'
$env:FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9010'
$env:KRONOS_NOTIFICATION_WORKER_MODE='fake'
$env:KRONOS_WHATSAPP_STATUS_INBOX_MODE='local'
$env:KRONOS_WHATSAPP_QA_ACCOUNT_ID='qa-business'
$env:KRONOS_WHATSAPP_QA_NUMBER_ID='qa-number'
$env:WHATSAPP_APP_SECRET='qa-only-synthetic-not-for-production'
$env:XDG_CONFIG_HOME='C:\Projects\Kronos\kronos-training-app\app\test-results\firebase-cli-e8'
$env:CI='true'
Remove-Item Env:FIREBASE_TOKEN, Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
.\node_modules\.bin\firebase.cmd emulators:exec --config firebase.functions-qa.local --only functions,database --project demo-kronos-training "node --require ./scripts/node-userinfo-preload.cjs --import tsx --test --test-concurrency=1 tests/database.rules.test.mjs tests/notification-opt-out.rules.integration.ts tests/notification-status-inbox.rules.integration.ts functions/tests/status-projection.integration.ts functions/tests/worker.integration.ts functions/tests/whatsapp-webhook.integration.ts functions/tests/opt-out.integration.ts functions/tests/opt-out-http.integration.ts functions/tests/status-inbox.integration.ts functions/tests/status-inbox-http.integration.ts functions/tests/status-inbox-transport.integration.ts"
~~~

Las suites con resets sólo pueden operar en 9010, nunca 9000.
Verificar que triggers activos no contaminan las suites de dominio; de ocurrir,
separar ejecución database-only con firebase.status-qa.local y la suite de
transporte functions+database, sin deshabilitar aserciones para ocultar fallos.

Chrome obligatorio: sesión manual ya autorizada, sin inspeccionar autenticación.
Crear fixtures nuevos QA identificables tras comprobar ausencia; conservar los
previos. Recorrido: pago sintético elegible -> job/consentimiento -> estado HTTP
temprano -> aceptación fake con wamid -> consumidor -> Pagos Entregado/Leído.
Probar además recuperación por runner después de interrupción, sin nuevo envío.
En 9000 se permiten sólo estas escrituras sintéticas acotadas después de aprobar;
nunca resets o cambios de datos reales. Preferir Functions-only 5003 ya disponible
sin reiniciar Auth/RTDB. Si sus triggers no se registran, documentar integración
manual en Chrome y acreditar disparo automático por separado en 5002/9010.

Consola, red sin material de Auth, DOM/etiquetas, foco y captura visual del flujo.
Playwright responsive existente es complemento, no sustituye Chrome:
.\node_modules\.bin\playwright.cmd test --config e2e/payment-notifications.config.ts
No cambios de layout previstos. Indicar si esa matriz usa mocks y no atribuirle
la prueba del backend. Parar sólo procesos y retirar sólo fixtures propios de las
suites aisladas; reportar los fixtures manuales retenidos.

## Riesgos, alternativas y exclusiones

| Riesgo o alternativa | Tratamiento propuesto |
| --- | --- |
| Firma válida para otra cuenta/receptor | Identidad QA exacta y namespace antes de escribir |
| Falsificación desde cliente | Ruta privada incluso para Admin; validación de backend |
| Pérdida entre persistencia y correlación | Guardado primero, dos puntos de recuperación, runner y prueba de caída |
| Doble aplicación o caché optimista | Transiciones condicionadas y confirmadas; completed al final |
| Retención indefinida o crecimiento | TTL y limpieza explícita comprobada; límites de entrada y paginación; cuotas globales/operación continua pendientes antes de producción |
| Correlación equivocada | Asociación exacta única y revalidación transaccional; no heurísticas |
| Sólo pedir otro webhook | Descartado como solución: depende de una nueva entrega externa |
| Mantener eventos sólo en memoria | Descartado: no sobrevive reinicios |
| Cola/scheduler administrados nuevos | Fuera de alcance; requieren infraestructura y autorización distinta |

No cubre proveedor Meta real, plantillas, secretos, reconciliación sin wamid,
reintento de mensajes, scheduler productivo, retención global de jobs/proyecciones,
marca/logo PDF, cambios de UI, despliegue, commit o push.

## Gate de autorización

Aprobado explícitamente: objetivo, criterios, nueva ruta privada e índices,
retención local de 30 días, consumidor de cambios del job, runner y QA sintético.
Las guías de especificaciones y seguridad motivan este gate y la minimización
del registro. Cambiar alcance, datos, permisos o verificación requiere revisión
de la propuesta. La fase E completa sigue abierta.

## Ajustes comprobados durante la implementación

- Se exportó únicamente el clasificador existente isRetryableProviderError desde
  webhook.ts, reutilizando su política sin cambiar los reintentos del worker.
- La revisión independiente detectó dos clasificaciones failed contradictorias
  para una misma clave dentro del lote. Ahora el parser deduplica equivalentes
  y rechaza contradicciones antes de cualquier escritura, también en lotes BAJA.
- La regresión de conflicto reprodujo una excepción asíncrona del callback RTDB
  que dejaba la promesa sin finalizar. Los callbacks nuevos abortan con undefined
  y rechazan después de esperar el resultado confirmado. Regresión RED/GREEN.
- La sesión manual usó HTTP 5003/RTDB 9000 y recuperación/proyección explícitas,
  sin reiniciar servicios del usuario. La cadena automática se probó por separado
  con Functions 5002/RTDB 9010 y sus triggers realmente registrados.
