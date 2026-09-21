# E8-BAJA-2 — Baja persistida local: reporte de implementación

Fecha: 2026-09-09, America/Mexico_City.
Spec: functions/SPEC-whatsapp-opt-out-persistence.md.
Autorización del usuario: «autorizo implementar».

## Resultado

E8-BAJA-2 implementada y verificada en emuladores. Una orden inequívoca firmada
retira recibos y recordatorios de todas las preferencias ligadas exactamente al
número validado, dentro del límite aprobado. Los trabajos posteriores se suprimen.
El cliente y los pagos no forman parte de la escritura de baja.

Esto NO habilita bajas reales de WhatsApp ni cierra E8/fase E en producción.
La integración nueva permanece deshabilitada por defecto y rechaza entornos
distintos de demo, fake y RTDB loopback, con bandera e IDs ficticios explícitos.

| Verificación | Última ejecución correspondiente |
| --- | --- |
| Spec/checklist | Completada localmente |
| Unitarias Functions | 122/122, cero fallos/omitidas |
| Reglas e integración aisladas | 64/64, cero fallos/omitidas |
| Transporte real Functions Emulator | 1/1, cero fallos/omitidas |
| Total de esas suites | 187 pruebas; no incluye ejecuciones históricas no repetidas |
| Typecheck | Functions y aplicación pasan |
| Build | Functions pasa; build de aplicación no repetido, no se cambió su código |
| Lint | Once archivos TS de esta fase pasan; no se afirma lint global |
| Revisión independiente | Dos Required corregidos y cerrados tras segunda revisión |
| Chrome | Recorrido protegido Atletas → baja → Pagos verificado |
| Consola Chrome | Cero errores/warnings en las consultas finales |
| Playwright | No repetido: no hay cambios de interfaz/layout; complemento histórico no contado |
| Producción/Meta/despliegue | No ejecutados |

## Árbol del cambio

~~~text
app/
├── database.rules.json
├── tests/notification-opt-out.rules.integration.ts
└── functions/
    ├── SPEC-whatsapp-opt-out-persistence.md
    ├── E8-BAJA-PERSISTENCE-QA.md
    ├── src/whatsapp/
    │   ├── http.ts                       integración local, firma previa
    │   ├── inbound-opt-out.ts            guard y parser del fixture entrante
    │   ├── opt-out-policy.ts             decisión pura sobre preferencia actual
    │   └── realtime-opt-out.ts           transacciones, marcador y limpieza
    └── tests/
        ├── inbound-opt-out.test.ts
        ├── opt-out-policy.test.ts
        ├── realtime-opt-out.test.ts
        ├── opt-out.integration.ts
        ├── opt-out-http.integration.ts
        └── opt-out-transport.integration.ts
~~~

Auxiliares locales ignorados: firebase.optout-manual.local y
test-results/opt-out-manual.local.ts. Se reutilizaron firebase.status-qa.local y
firebase.functions-qa.local; no se cambió firebase.json ni manifiestos/locks.
La compilación actualiza artefactos derivados de Functions, no una publicación.

## Flujo y límites de confianza

~~~text
POST local, bytes originales
  → firma HMAC válida
  → modo demo/fake/loopback + cuenta/receptor QA + parser acotado
  → consulta indexada por teléfono consentido (máximo 50 + detección de exceso)
  → marcador privado pending
  → transacción confirmada por servidor en cada preferencia
  → marcador completed sólo tras completar las coincidencias
  → worker reevalúa elegibilidad → suppressed, sin proveedor
  → proyección existente → Pagos: Omitido

RTDB preferencias → suscripción existente → Atletas: permisos retirados
Pagos/abonos/saldos ── no son destino de la operación de baja
~~~

El lote de bajas se valida antes de escribir. No se guardan texto, teléfono,
nombre o ID bruto de mensaje en la ruta de eventos. Las claves son hashes
con ámbito de cuenta/receptor/mensaje; eventos privados para clientes.
Conservación de 30 días con limpieza local explícita de hasta 50 vencidos por
invocación. Un campo expiresAt no es una política de borrado automática.

La consulta no abre lectura de colección a clientes. La escritura de cliente
conserva evidencia previa del webhook y exige alta explícita nueva para reactivar.
Las reglas bloquean tanto set completo obsoleto como cambios parciales.
No se cambiaron los roles ni el flujo de login.

## Evidencia de pruebas y revisión

- Parser y política: RED por módulos inexistentes; GREEN para tipo/tamaño,
  lista exacta, cuenta/número, expiración, teléfono cambiado, alta posterior,
  empate por segundo, ISO válido y fecha imposible.
- Persistencia: el primer recorrido evidenció la falta de índices; se añadieron
  los índices autorizados y pasó la consulta real en RTDB Emulator.
- Una transacción de cierre que abortaba con caché vacía se corrigió antes del
  cierre inicial de integración. Pruebas con caché fría y duplicados concurrentes.
- Reglas: RED real porque un formulario obsoleto restauraba opted-in; GREEN tras
  proteger evidencia y exigir fecha de alta posterior al retiro.
- Revisión independiente: detectó que una decisión ignored podía basarse en un
  cambio optimista no confirmado y cerrar el evento antes de la persistencia.
  Se reprodujo con un adaptador simulado determinista. Ahora incluso los no-op
  esperan confirmación del servidor y se verifica committed.
- Segunda observación de revisión: un reintento de baja del mismo segundo podía
  dejar una copia de alta reutilizable. RED real en reglas del puerto 9010;
  GREEN al exigir avance de consentedAt al reactivar. Se preservan alta explícita
  nueva y guardados sin reactivar. Ambos Required quedaron resueltos.
- HTTP/RTDB/worker: ambas finalidades suprimidas, cero solicitudes fake tras
  baja; texto ambiguo conserva consentimiento y produce exactamente una solicitud
  fake en el control positivo. Pagos comparados antes/después, iguales.
- Sobres mixtos de estados y bajas, duplicado del sobre y fallo de fecha inválida:
  avance de entrega conservado; errores genéricos, sin falsa confirmación.
- Transporte: POST real al emulador 5002 verifica firma inválida=401,
  cuenta incorrecta=400, baja=200, replay=200, y GET sin desafío válido=403.
- No se eliminaron ni deshabilitaron pruebas. La revisión externa no se cuenta
  como una ejecución de emulador: fue lectura y reproducción en memoria.

## Recorrido Chrome observado

Sesión iniciada manualmente por el usuario, perfil de pruebas existente. No se
leyeron contraseñas, tokens, cookies, contenido Auth ni respaldos.

1. Dashboard estaba autenticado. Un intento de navegación automatizada a Atletas
   regresó a Dashboard y el menú inspeccionado mostraba href ausente. Se pidió
   abrir Atletas al usuario; confirmó «listo» y se observó la lista correcta.
   No se corrigió navegación fuera de alcance ni se cambió autorización.
2. Se crearon siete registros nuevos de QA: dos atletas, sus preferencias y pagos,
   y un plan. Prefijo qa-optout-; no se reemplazaron qa-e8-ui-* ni cuentas.
3. En «QA opt-out compartido A», ambos checkboxes aparecían marcados; teléfono
   enmascarado +52 •••• 0008. Captura accesible previa registrada en esta conversación.
4. Un POST firmado ficticio pasó por Functions Emulator 5003 usando RTDB local
   existente 9000. El diálogo abierto se actualizó sin recargar: ambos checkboxes
   sin marcar, «Recibos retirados» y «Recordatorios retirados».
5. Se abrió el diálogo de B: ambas finalidades también retiradas. Captura de
   pantalla inspeccionada inline, textos legibles y teléfono enmascarado.
6. Helper invocó explícitamente worker real con proveedor fake y la proyección
   existente. Cuatro trabajos (dos por atleta): suppressed, cero solicitudes fake.
   No se atribuye esta ejecución manual a triggers automáticos de base: estaban
   desactivados en la instancia Functions-only, para no reiniciar RTDB/Auth.
7. Pagos mostró recibo y aviso «Omitido» para A y B en sus diálogos accesibles.
   La sesión permaneció abierta; al finalizar se cerró el diálogo, no la sesión.
8. Los nuevos fixtures inicialmente omitían amount/appliedAt/method del resumen
   utilizado por la UI (los abonos ya sumaban 200). Se corrigieron exclusivamente
   esos resúmenes de QA, fuera de la operación de baja, sin modificar installments,
   totalAmount ni balance. La tabla final mostró 200 de 500, restante 300 para A/B.
   Los dos atletas históricos de QA conservaron 200 de 500 y restante 300.

Viewport observado: 767 × 674 CSS px, sin overflow del documento en el diálogo
de consentimiento. Modal con nombre accesible, checkboxes etiquetados, foco en
el diálogo y devolución de foco al botón de apertura. Pagos conserva región
live polite en las notificaciones. No se midieron nuevos Core Web Vitals ni se
afirma una matriz responsive completa en esta fase sin cambios visuales.

Consola: consultas finales en Atletas y Pagos sin errores ni advertencias.
Red: inspección acotada de solicitudes del navegador, sin inspeccionar cuerpos
de autenticación. La baja se envió desde el helper local, por lo que no se
pretende demostrar ese POST con la red del navegador. El transporte se verificó
por HTTP real y persistencia. No se contactó a Meta.

El conector rechazó exportar capturas a ambas rutas locales solicitadas por su
lista de raíces; no se intentó alterar esa restricción. Se usó su captura inline
permitida. No existen los PNG solicitados, ni se enlazan archivos inexistentes.

## Comandos y entorno

Desde C:/Projects/Kronos/kronos-training-app/app:

~~~powershell
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
npm run typecheck
git diff --check

# Lint sin modificar archivos; once TS de la fase, listados en el árbol.
.\node_modules\.bin\eslint.cmd <archivos-TS-de-la-fase> -c .eslintrc.cjs

# Con RTDB aislado en 9010 y GCLOUD_PROJECT=demo-kronos-training:
node --require ./scripts/node-userinfo-preload.cjs --import tsx --test --test-concurrency=1 tests/database.rules.test.mjs tests/notification-opt-out.rules.integration.ts functions/tests/status-projection.integration.ts functions/tests/worker.integration.ts functions/tests/whatsapp-webhook.integration.ts functions/tests/opt-out.integration.ts functions/tests/opt-out-http.integration.ts

# Banderas de proceso: local/fake, qa-business/qa-number y clave ficticia;
# XDG_CONFIG_HOME aislado, credenciales de proceso eliminadas sin leerlas.
.\node_modules\.bin\firebase.cmd emulators:exec --config firebase.functions-qa.local --only functions,database --project demo-kronos-training "node --require ./scripts/node-userinfo-preload.cjs --import tsx --test functions/tests/opt-out-transport.integration.ts"
~~~

Variables locales: KRONOS_WHATSAPP_OPT_OUT_MODE=local,
KRONOS_NOTIFICATION_WORKER_MODE=fake, KRONOS_WHATSAPP_QA_ACCOUNT_ID=qa-business,
KRONOS_WHATSAPP_QA_NUMBER_ID=qa-number. Clave de fixture deliberadamente pública:
qa-only-synthetic-not-for-production. Nunca usarla como secreto real de Meta.

Incidencias de tooling: EPERM al formatear/compilar bajo sandbox, resuelto con
ejecución autorizada y focalizada; no se instalaron dependencias. La CLI hizo una
sonda automática de metadatos GCP, bloqueada EACCES; se documenta, no fue tráfico
de Meta ni una operación de datos reales. Warnings permission_denied de pruebas
negativas de reglas son esperados, no advertencias nuevas del navegador.
git diff --check pasó; avisos CRLF/LF del árbol existentes no son errores de diff.

## Preservación, limpieza y estado al entregar

Diez hashes protegidos permanecen iguales: firebase.json, manifiestos/locks de
app y Functions, index.ts, worker.ts, servicio cliente de preferencias y páginas
Atletas/Pagos. Cambios previos del árbol se conservaron; sin commit/push/reset.

Las suites aisladas retiraron sus propios fixtures; la prueba de retención borró
dos marcadores ficticios vencidos. Son datos sintéticos reproducibles, sin valor
de negocio ni afectación a la sesión manual. Las suites históricas con reinicio
de datos corrieron exclusivamente en 9010, nunca en el RTDB manual de 9000.

Se conservan para inspección manual: qa-optout-ui-a/b, qa-optout-plan, dos pagos
ficticios, dos preferencias retiradas, cuatro jobs suprimidos, cuatro proyecciones
y un marcador de baja. La limpieza futura del marcador es explícita, no automática.
Los emuladores temporales de 9010/5002 y Functions-only 5003 se detuvieron;
el entorno manual 9000/9099/4173 y su sesión permanecieron sin reinicio.

## Riesgos y pendientes fuera de esta fase

- API real de Meta, IDs/cuenta reales, aprobación de plantillas y secretos no
  configurados ni certificados con estos fixtures. Producción necesita otra fase.
- Hasta 50 consentimientos por número; exceso produce error reintentable sin
  escritura de preferencias. No hay paginación masiva silenciosa.
- No hay transacción global entre atletas; una falla parcial puede dejar progreso
  pendiente, recuperable por replay idempotente. No se promete atomicidad del lote.
- La baja no cancela mensajes ya iniciados/aceptados ni elimina la carrera entre
  la última lectura de elegibilidad y la aceptación externa del envío.
- Empate en el mismo segundo favorece baja; un consentimiento de segundo posterior
  queda protegido. Fechas relevantes imposibles de ordenar requieren intervención.
- Retención operativa en producción requiere programar y verificar su ciclo de
  borrado, y revisar controles de operación/abuso antes de activar tráfico real.
- Las guías de implementación incremental, TDD y seguridad influyeron en las
  pruebas RED/GREEN, en la confirmación de servidor y en las reglas contra copias
  obsoletas. La revisión independiente encontró y cerró dos riesgos de concurrencia.
