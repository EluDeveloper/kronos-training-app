# E8-BAJA-1 — Contrato local de bajas por texto

Fecha: 2026-09-09, America/Mexico_City.
Estado: **implementado y verificado localmente**. Autorización explícita: «autorizo».
No conectado a WhatsApp ni Firebase. No desplegado. E8 general sigue abierta.

## Resultado

El módulo puro reconoce BAJA, STOP, CANCELAR y NO RECIBIR sin distinguir
mayúsculas ASCII y tolerando espacios U+0020 adicionales. Rechaza frases
negadas/parciales, puntuación, caracteres invisibles, Unicode parecido,
entradas de más de 128 caracteres y tipos que no sean string.

buildOptOutPatch valida también el instante de recepción: número entero seguro
no negativo. Para entradas válidas devuelve únicamente receiptStatus,
reminderStatus, optedOutAt y optOutSource. Ambos propósitos quedan opted-out
en ese objeto; no escribe preferencias, no identifica al remitente, no deduplica
webhooks y no confirma que se haya aplicado una baja real.

## Estado de verificación

| Control | Resultado |
| --- | --- |
| Spec y plan local | Autorización registrada antes del código; B0–B3 completos |
| RED | Módulo ausente: 1 archivo nuevo falló; 11 tests anteriores del worker pasaron |
| Contrato nuevo | 10/10 pruebas |
| Composición nueva en memoria | 3/3 pruebas |
| Focalizadas, contrato + worker | 24/24 |
| Suite Functions final | 111/111; cero fallos, omitidas o canceladas |
| Typecheck Functions | Aprobado |
| Build Functions | Aprobado |
| ESLint, tres archivos TS | Sin errores ni advertencias |
| Smoke del JavaScript compilado | Reconocimiento, rechazo y cuatro campos correctos |
| Archivos fuera del alcance | 11 hashes SHA-256 antes/después idénticos |
| git diff --check | Sin errores; avisos de finales de línea LF/CRLF |
| Chrome / Playwright | No aplica a este módulo sin consumidor web |
| Firebase / HTTP / Meta real | No ejecutados ni modificados |

Las 111 pruebas son la suite unitaria de Functions, no todas las suites del
repositorio. Son 98 anteriores más 13 nuevas. No se suman los 24 casos focalizados
otra vez. La evidencia previa de E8-UI conserva su fecha; no se repitieron la
matriz responsive, RTDB ni suites de aplicación que no cambiaron.

## Árbol de archivos

~~~text
app/functions/
├── SPEC-whatsapp-opt-out.md          autorización, contrato y checklist
├── src/whatsapp/opt-out.ts           nuevo módulo puro de 35 líneas
├── tests/whatsapp-opt-out.test.ts    10 pruebas nuevas
├── tests/worker.test.ts              3 pruebas de composición añadidas
└── E8-BAJA-QA.md                     este reporte

carpeta de la tarea/outputs/
└── E8-BAJA-QA.md                     copia de entrega
~~~

La compilación regenera functions/lib e incluye el módulo nuevo. No se añadió
ninguna exportación de Functions en index.ts ni un consumidor runtime.

## Flujo validado

~~~mermaid
flowchart LR
  T["Texto sintético"] --> R["Reconocimiento exacto"]
  R -->|válido + hora válida| P["Parche puro: ambos propósitos opted-out"]
  R -->|ambiguo o inválido| N["null: sin cambio"]
  P --> C["Fixture de consentimiento en memoria"]
  C --> W["Worker existente"]
  W --> S["Recibo y recordatorio suprimidos; 0 envíos fake"]
  N --> I["Consentimiento previo conservado"]
~~~

Las dos pruebas de supresión aplican el parche al fixture de preferencias y
ejecutan el worker real con job store en memoria y FakeWhatsAppProvider.
Recibo y recordatorio terminan suppressed / OPTED_OUT; cero peticiones al
proveedor y ninguna lectura del documento financiero. Los fixtures de pago
(total 500, abonado 200, saldo 300) e historial permanecen idénticos.

El control con NO QUIERO DARME DE BAJA devuelve null, conserva el consentimiento
y permite una única petición al proveedor fake: prueba que no se suprime todo
incondicionalmente. No sale ningún mensaje real. La comparación del pago es
sobre un objeto en memoria, no una prueba de persistencia financiera en RTDB.

No afectados: Pagos y Atletas visibles, consentimiento guardado, sesión Admin,
webhook HTTP y parser actual de estados, reglas, base de QA, scheduler,
transporte real y generación de documentos existente. El nuevo módulo sólo
es importado por sus pruebas; una búsqueda de usos no encontró integración
en las fuentes runtime. No hubo login ni inspección del respaldo Auth.

## Revisión de calidad y seguridad

Revisión propia de cinco ejes, no revisión independiente de otro agente:

- Corrección: palabras y tiempos validados sin coerción; límites 128/129,
  cero y MAX_SAFE_INTEGER cubiertos; parche determinista pero sin estado compartido.
- Legibilidad: dos funciones pequeñas, tipos explícitos, sin abstracciones
  adicionales. El comentario aclara que el parche no verifica al remitente.
- Arquitectura: módulo backend sin imports ni acceso a Firebase, HTTP, entorno,
  logs o recursos externos. No se introduce otro modelo de consentimiento persistido.
- Seguridad: allowlist ASCII antes de trim/case; proxies hostiles, símbolos,
  arrays y objetos no se inspeccionan ni convierten. No hay datos privados,
  claves reales ni payloads de usuarios en fixtures.
- Rendimiento: longitud acotada antes de normalizar, sin bucles sobre colecciones
  ni I/O. No se atribuyen a este módulo las métricas web de la fase anterior.

ESLint conserva una excepción local, comentada, a regexp/use-ignore-case para
mantener explícita la allowlist A-Za-z. No se deshabilitaron pruebas ni reglas
de seguridad. La política de entrada conserva los rechazos de caracteres Unicode.

Incidencias resueltas durante verificación:
- El lint inicial detectó formato de arrays/espacios; se corrigió sólo en los
  archivos de prueba. Windows bloqueó el formateador con EPERM; funcionó con
  permiso para esos archivos.
- Typecheck detectó el spread de un valor que assert.equal había reducido a
  null en el control negativo. Se usó el objeto vacío al no existir parche;
  tests y typecheck posteriores pasan.
- Windows bloqueó la escritura del build en functions/lib (EPERM). La misma
  compilación terminó con permiso, sin despliegue ni cambios de configuración.

TDD dirigió la evidencia RED/GREEN y la revisión de seguridad añadió casos
adversariales. La guía de documentación mantuvo separados contrato simulado y
baja operativa. Las referencias auxiliares globales ausentes se sustituyen por
el Definition of Done explícito de AGENTS.md; no se omitió ningún gate aplicable.
No se hizo auditoría de dependencias de release: no hubo paquetes nuevos ni release.

## Comandos reproducibles

Desde C:/Projects/Kronos/kronos-training-app/app:

~~~powershell
node --require ./scripts/node-userinfo-preload.cjs --import tsx --test functions/tests/whatsapp-opt-out.test.ts functions/tests/worker.test.ts
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
.\node_modules\.bin\eslint.cmd functions/src/whatsapp/opt-out.ts functions/tests/whatsapp-opt-out.test.ts functions/tests/worker.test.ts -c .eslintrc.cjs
git diff --check
~~~

Se comprobaron sin cambios por hash: reglas, firebase.json, ambos manifests y
lockfiles npm, endpoint HTTP, parser de estados, index.ts, worker productivo y
pagos.vue. El diff de Git no enumera individualmente los archivos bajo functions/
aún sin seguimiento, por lo que se revisaron y se hizo lint explícito de los nuevos TS.
No se hizo commit, push, reset, instalación de dependencias o escritura Firebase.

## Pendiente fuera de esta autorización

La siguiente fase será integrar mensajes entrantes con consentimiento duradero.
Necesita una nueva spec y autorización para resolver identidad de cuenta/remitente,
números compartidos, consulta/índices, deduplicación, replay tras un nuevo opt-in,
carreras con el envío, auditoría y retención. No se puede afirmar que una BAJA
real ya detenga mensajes ni que un envío aceptado pueda cancelarse.

La baja persistida, Meta real, publicación y cierre de E8 general siguen pendientes.
