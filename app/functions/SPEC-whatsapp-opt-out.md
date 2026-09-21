# Spec E8-BAJA-1 — Contrato local de bajas por texto

Estado: **E8-BAJA-1 implementada y verificada localmente el 2026-09-09**.
Autorización recibida: «autorizo», para E8-BAJA-1 y las cuatro expresiones propuestas.
Fecha: 2026-09-09, America/Mexico_City.
Módulo: athletes-payments; QA transversal: experience-quality.
Spec madre: specs/SPEC-payment-notifications-whatsapp.md, sección Opt-out por mensaje.
Directorio de trabajo: C:/Projects/Kronos/kronos-training-app/app.

## Objetivo

Preparar el contrato de reconocimiento de bajas antes de conectar mensajes
entrantes al consentimiento persistido. Un texto inequívoco puede solicitar
retirar recibos y recordatorios; texto ambiguo nunca modifica consentimiento.

Esta primera rebanada sólo añade funciones puras y pruebas con objetos
sintéticos en memoria. No habilita todavía la baja operativa desde WhatsApp,
no cambia preferencias en Firebase y no recibe mensajes reales.

## Evidencia de partida

- E8-UI/UI4 está cerrada localmente según functions/E8-UI-QA.md:
  panel de Pagos, consola, red, rendimiento y responsive documentados.
- functions/src/whatsapp/webhook.ts procesa value.statuses; actualmente no
  reconoce value.messages como órdenes de baja.
- functions/src/whatsapp/http.ts verifica la firma antes del procesamiento;
  ese endpoint no se modificará en esta rebanada.
- El worker y RealtimeNotificationDataSource consultan las preferencias
  vigentes y rechazan opted-out. Las pruebas existentes ya cubren esa supresión.
- El consentimiento real vive en v1/notificationPreferences/{athleteId};
  no en la ubicación histórica propuesta con un nivel whatsapp adicional.
- La spec madre exige aprobar la lista definitiva de palabras antes de
  implementarla. El usuario aprobó esta lista y la rebanada local el 2026-09-09.

## Decisiones autorizadas

1. Lista exacta v1: BAJA, STOP, CANCELAR y NO RECIBIR.
2. Normalización limitada: recortar espacios ASCII U+0020 al inicio/final, colapsar
   espacios ASCII consecutivos entre palabras y convertir letras ASCII a
   mayúsculas. No quitar puntuación, acentos, emojis ni caracteres invisibles.
3. Se aceptan sólo strings de hasta 128 caracteres antes de normalizar;
   rechazar objetos, arrays, null y entradas más largas sin coerción.
4. No aplicar coincidencias parciales: NO QUIERO DARME DE BAJA, BAJA AHORA,
   STOP!, ALTA, audio, imágenes y texto libre no activan el contrato.
5. La baja explícita afecta recibos y recordatorios. No hay alta automática,
   respuesta de confirmación ni borrado del historial.
6. Todo ejemplo de consentimiento, remitente o pago será sintético; no se
   leerá el perfil autenticado, el respaldo Auth ni datos de clientes.

## Contrato y estilo

TypeScript ESM, Node 22 y dependencias existentes. Mantener comillas simples,
sin punto y coma, tipos explícitos y funciones pequeñas. No importar el
backend desde Vue ni arrastrar Firebase al módulo puro.

Interfaz implementada (contrato detallado antes de escribir el código):

~~~ts
type OptOutKeyword = 'BAJA' | 'STOP' | 'CANCELAR' | 'NO RECIBIR'

interface OptOutPatch {
  receiptStatus: 'opted-out'
  reminderStatus: 'opted-out'
  optedOutAt: number
  optOutSource: 'webhook'
}

// No persiste ni envía; el adaptador futuro deberá verificar firma y remitente.
function recognizeOptOutKeyword(input: unknown): OptOutKeyword | null
function buildOptOutPatch(input: unknown, receivedAt: unknown): OptOutPatch | null
~~~

El constructor valida el texto con el reconocedor y un instante de recepción
inyectado por el llamador. Devuelve null si cualquier entrada no es válida,
sin lanzar errores ni convertir tipos. No toma la hora de texto arbitrario del usuario.
El parche no inventará actor Admin, nombre, teléfono, ID de atleta, idempotencia
ni confirmará que se escribió una baja en la base.

El módulo no hará fetch, I/O, lecturas de variables de credenciales, logs del
texto ni mutaciones del objeto de entrada. Los IDs, pagos y estado de entrega
no forman parte del parche.

## Criterios de aceptación

- Las cuatro palabras exactas y sus variantes de mayúsculas/espacios admitidas
  se reconocen de forma determinista.
- Los casos ambiguos, formatos inválidos, caracteres no permitidos y entradas
  que excedan el límite producen rechazo sin excepción ni efectos secundarios.
- El parche simulado contiene sólo los cuatro campos previstos y solicita
  opted-out para ambos propósitos, conservando el historial fuera del parche.
- Tiempos inválidos (NaN, infinito, negativos o no enteros seguros) se rechazan.
- Repetir el constructor con la misma entrada produce el mismo resultado;
  esto no se presenta como deduplicación duradera ni protección contra replay.
- Una prueba de composición en memoria aplica el parche a un fixture y
  verifica con el worker existente que ya no invoca al proveedor fake.
  El pago sintético permanece idéntico.
- Pasan tests de Functions, typecheck, build y lint focalizado. Se registra
  el fallo RED antes de implementar y el GREEN posterior.
- No cambia el endpoint, la UI, reglas, esquema, dependencias, servicios
  activos ni la sesión Admin. No se declara finalizada E8 ni la baja operativa.

## Amenazas y límites de confianza

| Riesgo | Control en esta rebanada |
| --- | --- |
| Una frase negada activa una baja por substring | Lista exacta; pruebas negativas |
| Objeto malicioso fuerza coerción o texto enorme | unknown, tipo estricto, límite antes de normalizar |
| Prueba filtra un teléfono o mensaje real | Fixtures ficticios y salida sin payload privado |
| Confundir un parche con un webhook autorizado | Módulo puro no conectado; integración expresamente excluida |
| Pruebas alteran pagos o envían mensajes | Objetos en memoria; proveedor fake observado |

Antes de conectar HTTP/Firebase habrá una fase separada que resuelva:
validación de cuenta/remitente, números compartidos, búsqueda/índices acotados,
deduplicación duradera, replays tras un nuevo consentimiento, concurrencia con
el envío, auditoría mínima y retención. No suponer que una firma válida por sí
sola identifica al atleta ni que se puede cancelar un envío ya aceptado.

## Archivos probables

~~~text
app/functions/
├── SPEC-whatsapp-opt-out.md          autorización, contrato y checklist
├── src/whatsapp/opt-out.ts           contrato puro nuevo
├── tests/whatsapp-opt-out.test.ts    reconocimiento y parche
├── tests/worker.test.ts              composición sintética con supresión
└── E8-BAJA-QA.md                     evidencia y límites después de implementar
~~~

No modificar src/whatsapp/http.ts, database.rules.json, firebase.json,
package.json/locks, autenticación ni la base de QA en esta rebanada.

## Estrategia de pruebas y comandos

Usar node:test y node:assert/strict, como las suites actuales. Ejecutar desde
C:/Projects/Kronos/kronos-training-app/app, sin instalar dependencias:

~~~powershell
node --require ./scripts/node-userinfo-preload.cjs --import tsx --test functions/tests/whatsapp-opt-out.test.ts functions/tests/worker.test.ts
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
.\node_modules\.bin\eslint.cmd functions/src/whatsapp/opt-out.ts functions/tests/whatsapp-opt-out.test.ts functions/tests/worker.test.ts -c .eslintrc.cjs
git diff --check
~~~

El primer comando confirmó RED por módulo todavía inexistente, seguido de GREEN.
La suite final de Functions pasó 111/111. Chrome y Playwright no son evidencia de este contrato
sin integración web; el QA protegido ya aprobado no se repetirá sin un cambio
que lo requiera. La fase de integración futura tendrá su propio recorrido
autorizado y no podrá reutilizar esta omisión para saltarse el gate web.

## Límites

- Siempre: especificación antes de código, RED/GREEN, inputs no confiables,
  datos ficticios, consentimiento separado del dinero y evidencia honesta.
- Preguntar antes: conectar HTTP, leer/escribir Firebase, crear índices/rutas,
  modificar reglas/permisos, definir retención o usar infraestructura nueva.
- Nunca: inspeccionar credenciales, tocar producción, enviar mensajes reales,
  publicar, borrar historial, automatizar ALTA o confirmar una baja no aplicada.

## Plan y checklist local autorizado

Se conserva el plan y destino de tareas en este suplemento dentro de app/,
como en E8-UI; no se amplía el permiso a las tareas históricas de la raíz.
Orden: B0 → B1 → B2 → B3. No hay tareas paralelas que requieran otro agente.

- [x] B0 — Registrar autorización y contrato. Archivos: esta spec. Verificar
  alcance, palabras, entradas unknown y ausencia de conexión HTTP/Firebase.
- [x] B1 — Escribir pruebas del reconocedor y del parche, confirmar RED,
  implementar módulo puro y confirmar GREEN. Archivos: opt-out.ts y su test.
  Aceptación: lista exacta, límites, rechazo sin coerción, cuatro campos.
- [x] B2 — Componer parche y worker existente sólo en memoria. Archivo:
  worker.test.ts. Aceptación: recibo y recordatorio suprimidos, cero envíos
  fake tras la baja, texto ambiguo no suprime, historial/pago sin cambios.
  Verificar tests focalizados incluyendo el nuevo contrato.
- [x] B3 — Ejecutar suite Functions, typecheck, build y lint; revisar cambios
  y registrar evidencia en E8-BAJA-QA.md. No repetir QA web ajeno al contrato.
  Checkpoint: criterios completos y límites operativos explícitos.

Resultado: 10 pruebas nuevas de contrato y 3 de composición con worker;
24/24 focalizadas y 111/111 en la suite Functions final. Typecheck, build,
lint focalizado y smoke del JavaScript compilado pasan. Once hashes de archivos
fuera del alcance permanecen idénticos. Evidencia y límites en E8-BAJA-QA.md.

## Autorización y límites preservados

El usuario aprobó E8-BAJA-1, la lista exacta y normalización anteriores, el
contrato puro y sus pruebas en memoria. El plan/checklist se registró antes
de implementar. Esta autorización no incluye por extensión la persistencia del
opt-out, cambios de esquema, infraestructura, secretos, Meta ni despliegue.
