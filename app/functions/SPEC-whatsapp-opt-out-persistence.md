# Spec E8-BAJA-2 — Baja persistida en el entorno local

Estado: **implementada y verificada localmente el 2026-09-09**.
Autorización recibida: «autorizo implementar», para E8-BAJA-2 y su alcance completo.
Fecha: 2026-09-09, America/Mexico_City.
Módulo: athletes-payments; QA transversal: experience-quality.
Spec madre: specs/SPEC-payment-notifications-whatsapp.md.
Precedente implementado: functions/SPEC-whatsapp-opt-out.md (E8-BAJA-1).
Directorio de trabajo: C:/Projects/Kronos/kronos-training-app/app.

## Objetivo y alcance

Conectar las cuatro órdenes ya aprobadas (BAJA, STOP, CANCELAR, NO RECIBIR)
a un webhook local con firma sintética y persistir la retirada de recibos y
recordatorios en Realtime Database Emulator. Demostrar que el worker existente
suprime los trabajos afectados antes del envío fake y que la UI refleja la baja.

Esta autorización propuesta incluye código HTTP, adaptador de persistencia,
un índice de consulta, reglas de protección y datos ficticios exclusivos de QA.
No incluye producción, Meta real, mensajes salientes reales, cambios de Auth,
dependencias nuevas, despliegues ni modificación del dinero o historial de pagos.

## Evidencia y límites de partida

- E8-BAJA-1 tiene 111/111 pruebas de Functions; es un contrato puro sin I/O.
- webhook.ts sólo procesa value.statuses; todavía no atiende bajas entrantes.
- http.ts ya verifica HMAC del cuerpo original antes del procesamiento.
- El consentimiento está en v1/notificationPreferences/{athleteId}; el teléfono
  consentido se almacena como 52 seguido de diez dígitos, sin signo +.
- El servicio de la UI guarda el registro completo con set. Las reglas actuales
  no impiden que una copia anterior del formulario restaure un consentimiento viejo.
- El worker consulta elegibilidad dos veces, pero no existe una operación atómica
  que abarque consentimiento y aceptación por un proveedor externo.
- No se pudo consultar la documentación oficial de los payloads de Meta en esta
  sesión. La forma del mensaje entrante será un contrato de fixtures locales,
  no una certificación de compatibilidad con eventos reales de Meta.

## Decisiones autorizadas

### 1. Activación y validación

- Deshabilitada por defecto. Habilitar bajas sólo con bandera explícita local,
  proyecto demo-kronos-training, proveedor fake y host de RTDB en loopback.
  El guard se ejecutará antes de cualquier acceso a datos de bajas.
- Mantener el contrato existente de verificación GET y estados de entrega POST.
  Deshabilitar bajas no deshabilita por extensión el procesador previo de estados.
- Para fixtures de bajas, exigir firma válida del cuerpo original y coincidencia
  con los IDs ficticios configurados de cuenta y número receptor. Una firma sola
  no permite atribuir un mensaje a un atleta.
- Contrato local: entry[].id, changes[].field=messages, value.metadata.phone_number_id
  y value.messages[] con id, from, timestamp, type=text y text.body.
- Validar tipos sin coerción, IDs acotados, timestamp entero en segundos, emisor
  canónico 52 + diez dígitos, cuerpo máximo 64 KiB y máximo 100 mensajes por POST.
  Validar todo el lote de bajas antes de escribir. No alterar los límites previos
  del procesador de estados sin documentar y probar expresamente la regresión.
- Reutilizar la normalización ASCII exacta de E8-BAJA-1; no interpretar ALTA,
  texto libre, negaciones, adjuntos ni coincidencias parciales.
- Política local de antigüedad: ignorar eventos de más de 30 días y rechazar
  tiempos futuros. Son decisiones de QA, no supuestos sobre garantías de Meta.
- No responder con una confirmación de baja por WhatsApp. Las respuestas HTTP
  serán genéricas, sin teléfono, texto, identidad o detalles de preferencias.

### 2. Números compartidos y escritura mínima

- Una baja afecta a todos los consentimientos cuyo consentedPhoneE164 coincida
  exactamente con el remitente validado, incluidos varios atletas de una familia.
  No buscar por nombre ni por teléfono del perfil sin consentimiento coincidente.
- Añadir .indexOn para consentedPhoneE164 sin ampliar permisos de lectura cliente.
  Consulta acotada a 50 coincidencias más una de detección de exceso: si hay más
  de 50, no modificar ninguna y registrar sólo un diagnóstico agregado de límite.
- Resolver la lista antes de escribir; revalidar teléfono y consentimiento en una
  transacción por preferencia. No ejecutar una transacción global sobre v1.
- Retirar ambos propósitos, registrar optOutSource=webhook y optedOutAt con la
  primera recepción local del evento; actualizar updatedAt/updatedBy con actor
  de servicio whatsapp-webhook, sin inventar una identidad Admin.
- Conservar consentedAt, consentSource, recordedBy, createdAt, teléfono e historial
  previo. Si ambos propósitos ya están retirados, no reescribir sus metadatos.
- No leer ni escribir pagos, abonos, documentos o saldos para resolver una baja.

### 3. Duplicados, reintentos y consentimientos nuevos

- Crear registro privado v1/notificationOptOutEvents/{hash SHA-256 de cuenta,
  número receptor e ID de mensaje}, con estado pending/completed, receivedAt y
  expiresAt. No guardar texto, teléfono, nombre ni ID de mensaje sin hash.
- Inicializar el registro de forma idempotente para conservar la primera recepción;
  marcar completed únicamente después de procesar todas las coincidencias.
  Un fallo parcial seguirá pendiente y podrá reintentarse sin duplicar bajas.
- La baja no es una transacción global entre atletas: documentar la posibilidad
  de progreso parcial y no afirmar que una respuesta HTTP equivale a atomicidad.
- Dentro de cada transacción, comparar el tiempo del evento con el último
  consentimiento: un alta de un segundo posterior queda protegida; en el mismo
  segundo gana la baja, por la resolución limitada del timestamp del fixture.
  Admitir fechas numéricas e ISO válidas del esquema previo. Ante una fecha
  relevante imposible de ordenar, no modificar ese registro ni declarar éxito total.
- Añadir reglas para impedir que un set cliente desactualizado revierta una baja
  del webhook. Reactivar exigirá un consentimiento explícito con fecha numérica
  posterior a optedOutAt, no futura respecto al servidor; no se podrá borrar o
  retroceder silenciosamente la evidencia previa del webhook.
- Probar este requisito contra el servicio cliente actual. Si exige cambiar su
  contrato o introducir campos adicionales, detenerse y proponer ese ajuste antes
  de ampliar el alcance; no debilitar reglas para hacer pasar la prueba.
- No se garantiza cancelar un envío ya iniciado/aceptado. Esta fase prueba la
  supresión cuando la baja se confirma antes de la última lectura de elegibilidad.
  La carrera entre esa lectura y el envío sigue siendo un gate de producción.

### 4. Privacidad, retención y entorno

- Ruta de eventos con .read=false y .write=false para clientes, e índice expiresAt.
  Acceso del adaptador mediante Admin SDK sólo tras el guard local.
- Retención propuesta: 30 días desde primera recepción. Incluir limpieza local
  explícita, acotada e idempotente, sólo de eventos vencidos en esta ruta.
  expiresAt por sí solo no borra datos: probar la limpieza y registrar su ejecución.
  No crear un scheduler ni prometer borrado automático en producción.
- Pruebas automatizadas en emuladores separados; no vaciar v1 ni reiniciar/resetear
  los emuladores de la sesión manual. Fixtures con prefijo qa-optout- y datos ficticios.
- Para Chrome, usar la sesión QA autorizada e iniciada manualmente por el usuario,
  sin leer credenciales, cookies, tokens o respaldos Auth. Si la sesión terminó,
  detener el recorrido protegido y pedir login manual.
- No sobrescribir fixtures qa-e8-ui- ni cuentas existentes. La limpieza autorizada
  sólo comprende los registros nuevos identificados de esta fase y eventos vencidos
  de su ruta local; preservar la evidencia necesaria y detallar qué se eliminó.

## Contrato, estilo y estructura probable

TypeScript ESM, Node 22, dependencias existentes, comillas simples, sin punto y
coma. Mantener parser puro, política de orden y adaptador separados. Inyectar
reloj/almacenamiento para pruebas; no registrar payloads de usuarios.

Ejemplo orientativo de límite de dominio, no API pública ya implementada:

~~~ts
interface VerifiedLocalOptOut {
  eventKey: string
  senderPhone: string
  eventAt: number
  receivedAt: number
}

type OptOutOutcome = 'applied' | 'ignored' | 'duplicate' | 'retry-required'
~~~

~~~text
app/
├── database.rules.json                         índice y protección cliente
└── functions/
    ├── SPEC-whatsapp-opt-out-persistence.md    aprobación y checklist
    ├── src/whatsapp/http.ts                    integración local y guard
    ├── src/whatsapp/inbound-opt-out.ts         parser y política puros nuevos
    ├── src/whatsapp/realtime-opt-out.ts        transacciones/eventos/limpieza
    ├── tests/*opt-out*.test.ts                 contrato, HTTP y concurrencia
    ├── tests/*rules*.test.ts                   permisos y escrituras obsoletas
    └── E8-BAJA-PERSISTENCE-QA.md                evidencia final
~~~

Los nombres nuevos podrán ajustarse a la organización existente sin ampliar
comportamiento. Añadir fixtures/harness local ignorado o pruebas de emulador en
las ubicaciones existentes según sus convenciones. No modificar firebase.json,
index.ts, autenticación, UI, manifiestos o locks sin una justificación aprobada.

## Criterios de aceptación y verificación

1. RED/GREEN para parser, firma/cuenta incorrectas, payload inválido, límites,
   textos ambiguos y modo deshabilitado; cero escrituras en los rechazos.
2. Una baja válida persiste ambos propósitos; un número compartido afecta todas
   las coincidencias dentro del límite, y ningún consentimiento ajeno.
3. Duplicados concurrentes, reintento después de fallo parcial, cambio de teléfono,
   alta posterior, empate temporal y evento vencido tienen pruebas deterministas.
4. Reglas niegan clientes no autorizados, acceso a eventos privados y restauración
   con formulario viejo; permiten el alta nueva explícita del flujo vigente.
5. Limpieza elimina únicamente eventos vencidos; conserva vigentes y preferencias.
6. Composición HTTP + RTDB + worker fake: recibo y recordatorio suprimidos tras
   la baja, sin envío fake; control ambiguo conserva el consentimiento y su envío
   fake esperado. Comparar fixtures de pagos antes/después: idénticos.
7. Estados de entrega actuales conservan sus pruebas; cubrir sobres mixtos de
   estados/bajas y respuestas de fallo sin confirmar bajas no finalizadas.
8. Pasan suite Functions, typecheck, build, lint focalizado, pruebas de reglas e
   integración aislada. No sumar pruebas históricas como si se hubieran repetido.
9. Chrome demuestra consentimiento inicial ficticio, baja vía HTTP local, estado
   visible retirado, supresión y dinero intacto; revisar consola, red, DOM y captura
   pertinente. No omitir este gate por tratarse de un cambio de backend.
10. Entregar reporte con árbol, recorrido, resultados, diagrama y riesgos pendientes;
    no declarar terminada E8 ni habilitada la baja real de WhatsApp.

Comandos base desde app/; registrar los comandos concretos del harness antes de
ejecutarlo, reutilizando emuladores y dependencias instalados:

~~~powershell
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
git diff --check
~~~

## Plan autorizado y checklist local

- [x] P0 — Registrar aprobación de esta spec. Usar fixtures qa-optout- y harness
  aislado; concretar comandos antes de iniciar emuladores. El plan/checklist se
  conserva aquí, como en E8-BAJA-1, sin alterar tareas históricas fuera de app/.
- [x] P1 — RED/GREEN del parser y políticas de identidad, tiempo y límites.
- [x] P2 — Adaptador transaccional, eventos privados, reglas y limpieza; comprobar
  duplicados, fallo parcial y protección de alta antes de conectar HTTP.
- [x] P3 — HTTP conectado detrás del guard; 64/64 reglas/integración, 122/122
  Functions y 1/1 transporte real en Functions Emulator. Dos hallazgos de
  concurrencia de revisión independiente corregidos con RED/GREEN y revisados.
- [x] P4 — Chrome: Atletas con ambos permisos activos → POST local → permisos
  retirados en A/B → worker fake suprime cuatro trabajos → Pagos muestra Omitido.
  Consola sin errores/warnings. Reporte: functions/E8-BAJA-PERSISTENCE-QA.md.

Comandos del harness aislado (puerto 9010, nunca 9000 para estas suites):

~~~powershell
# Variables limitadas al proceso de pruebas; no leer credenciales existentes.
$env:FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9010'
$env:GCLOUD_PROJECT='demo-kronos-training'
node --require ./scripts/node-userinfo-preload.cjs --import tsx --test --test-concurrency=1 tests/database.rules.test.mjs tests/notification-opt-out.rules.integration.ts functions/tests/status-projection.integration.ts functions/tests/worker.integration.ts functions/tests/whatsapp-webhook.integration.ts functions/tests/opt-out.integration.ts functions/tests/opt-out-http.integration.ts
~~~

El emulador aislado usa firebase.status-qa.local existente. Para transporte HTTP,
usar firebase.functions-qa.local existente, sólo functions,database, puertos
5002/9010/4410/4510. Arrancar después de detener exclusivamente la instancia
aislada iniciada por esta fase, sin detener la sesión manual de 9000/9099/4173.
Configurar sólo claves ficticias, modo local/fake y IDs qa-business/qa-number.

Para el recorrido manual se creó firebase.optout-manual.local (ignorado):
Functions 5003, hub 4413 y logging 4513, sólo Functions, con RTDB existente
9000 en la variable de proceso. No reinició RTDB/Auth. Triggers de base no
se registraron en esa instancia: el helper de QA invocó explícitamente worker
y proyección existentes después de confirmar la baja HTTP. Instancia detenida
al terminar. Helper reproducible: test-results/opt-out-manual.local.ts (ignorado).

Concreciones dentro del contrato aprobado:

- Guard local exige IDs de receptor ficticios qa-* y puerto de loopback válido.
- opt-out-policy.ts separa la decisión transaccional del parser.
- Toda decisión de preferencia, incluso no-op, espera confirmación del servidor;
  no basta observar un valor optimista local para cerrar el marcador.
- Reactivar un propósito retirado exige además avanzar consentedAt respecto del
  valor numérico almacenado. Esto bloquea copias obsoletas de altas del mismo segundo.
- Pruebas de contrato cliente/reglas viven en tests/notification-opt-out.rules.integration.ts
  para respetar la frontera rootDir de Functions. El cliente no se modificó.
- La limpieza local explícita pasó con eventos vencidos; no se instaló scheduler.
- Capturas Chrome inspeccionadas inline: el conector rechazó exportar a archivo.
  Se conserva evidencia textual detallada en el reporte; no se inventan PNG locales.

Flujo propuesto: POST firmado local → guard/cuenta/parser → consulta exacta →
transacciones por consentimiento → marcador completado → worker reevaluará
elegibilidad; UI observará preferencias. No hay llamada a Meta en este flujo.

## Siempre / preguntar / nunca

- Siempre: aprobación antes de comportamiento, cambios pequeños, datos ficticios,
  validación antes de escritura, fallos explícitos y evidencia de regresión.
- Preguntar: decisiones distintas a las anteriores, cambio cliente/esquema adicional,
  infraestructura nueva, uso de cuentas/datos reales o ampliación de la verificación.
- Nunca: reglas públicas, secretos en logs/Git, ALTA automática, borrar pagos,
  enviar mensajes reales, publicar o activar esta fase fuera de emuladores.

## Referencias de implementación

La separación entre set, actualización parcial y transacciones se fundamenta en
[Firebase Admin: guardar datos](https://firebase.google.com/docs/database/admin/save-data).
El índice propuesto respalda la consulta por campo sin abrir lectura al cliente:
[Firebase: índices de Realtime Database](https://firebase.google.com/docs/database/security/indexing-data).
La coincidencia exacta usará las consultas soportadas por Admin SDK:
[Firebase Admin: recuperar datos](https://firebase.google.com/docs/database/admin/retrieve-data?authuser=2).
Estas referencias no sustituyen las pruebas de concurrencia o reglas del proyecto.

## Gate de autorización

El usuario autorizó explícitamente implementar E8-BAJA-2 después de recibir esta
propuesta, incluyendo números compartidos, protección de altas, cambios de
reglas/índice y retención local de eventos de 30 días. No autoriza producción.
