# Spec E8-UI — Estado compacto de notificaciones en Pagos

Estado: **autorizada por el usuario el 2026-09-08; E8-UI/UI4 completada localmente, con recorrido protegido y red/rendimiento verificados en Chrome; no desplegada**.
Autorización recibida: «si autorizo», para E8-UI con la ruta, reglas y QA local descritos.
Fecha: 2026-09-08. Módulo: `athletes-payments`; QA: `experience-quality`.
Complementa `specs/SPEC-payment-notifications-whatsapp.md` y el capability map
aprobado. Se guarda dentro de `app/` por el alcance de directorio vigente.

## Objetivo y supuestos para revisión

Que el personal autorizado consulte las últimas notificaciones de un atleta
desde Pagos, sin acceder a jobs internos ni confundir un fallo de WhatsApp con
un fallo financiero. Es un panel de consulta por atleta, no un historial general
de campañas ni un indicador que atribuya una entrega a un pago sin correlación.

- Mantener Vue, TypeScript, Vuetify y Firebase; no añadir dependencias.
- Reutilizar `admin` y el permiso `payments`, sin nuevos roles o permisos.
- Probar sólo con proveedor fake, proyecto demo y datos sintéticos locales.
- No implementar bajas por mensajes, reintentos manuales ni transporte Meta aquí.

## Cambio de datos y permisos que requiere autorización

Nueva proyección: `v1/notificationStatus/{athleteId}/{jobId}`.
Campos permitidos: `type`, `status`, `updatedAt`, `folio` opcional y `period`
opcional cuando el job permita derivarlo de forma inequívoca.

```ts
interface NotificationStatusView {
  type: 'payment-receipt' | 'payment-reminder'
  status: 'pending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'omitted' | 'error' | 'unknown'
  updatedAt: number
  folio?: string
  period?: string // YYYY-MM; no texto libre ni referencia de otro atleta
}
```

Sólo backend escribe la proyección a partir del job vigente; no se permite
copiar el job completo. Permanecen privados `notificationJobs` y
`notificationWebhookEvents`, sin modificar sus prohibiciones de lectura/escritura.

Lectura de la nueva proyección: sesión habilitada en `v1/users/{uid}` y
(`role=admin` o `permissions/payments=true`). Coach sin permiso explícito,
usuarios deshabilitados y sesiones anónimas quedan denegados. Ni siquiera Admin
cliente podrá escribir, borrar o falsificar estados. Esta autorización permite
consultar también estados de avisos y recibos de tienda del atleta desde Pagos;
no concede acceso a ventas, importes ni otros módulos financieros.

Lectura acotada a un atleta y las últimas 20 entradas con
`orderByChild('updatedAt').limitToLast(20)`, validada por reglas; sin listado de
todos los atletas ni lecturas ilimitadas. Añadir índice `updatedAt` en el nivel
del atleta. No se publican nombre, teléfono, hashes, PDF, payloads, códigos
internos de error, identificadores Meta, datos médicos o credenciales.

## Comportamiento y criterios de aceptación

1. Desde Pagos se abre el panel para un atleta registrado. Muestra tipo,
   fecha/hora local, estado, folio y periodo sólo si están disponibles.
   `accepted` se etiqueta «Aceptado», no «Entregado»; `unknown` se presenta como
   «Por confirmar», sin prometer éxito o programar un reenvío.
2. Carga, vacío, error y permiso revocado tienen estados visibles y accesibles.
   Cambiar de atleta o cerrar el panel cancela la suscripción y elimina el
   contenido previo. La falta de proyección nunca se presenta como fallo de pago.
3. Worker fake → job → proyección → panel funciona localmente. Webhooks repetidos
   o fuera de orden no hacen retroceder Entregado/Leído. La proyección se obtiene
   del job vigente, no de un payload viejo. Fallar su escritura no altera el pago
   ni provoca un segundo envío. Proyecciones malformadas fallan cerrado.
4. Las pruebas de reglas niegan lecturas excesivas y todas las escrituras cliente;
   cubren Admin, payments, Coach sin permisos, usuario deshabilitado y anónimo.
   No se conceden permisos implícitos a quien sólo administra consentimiento.
5. Chrome valida el recorrido completo y Playwright complementa la matriz
   320/768/1024/1440 en QA local aislado, con foco, etiquetas, sin desbordes y
   sin llamadas a Meta desde el navegador. Login manual: pedirlo al usuario
   cuando corresponda; nunca automatizar credenciales ni inspeccionar tokens.

## Orden de implementación propuesto

- UI1: contrato puro, mapper cerrado y regresiones de privacidad/estados.
- UI2: reglas/índice de la nueva ruta y sincronización backend local; pruebas RTDB
  de permisos, concurrencia y fallos. El consumidor mantiene el guard demo/fake.
- UI3: servicio de consulta, panel accesible e integración mínima en Pagos.
- UI4: QA de extremo a extremo, responsive y reporte. No cerrar E8 completa por
  terminar este panel: persisten otros pendientes de la spec principal.

## Plan y checklist autorizado

Este suplemento es el destino del plan y tareas de esta fase, dentro de `app/`.
Se conserva el alcance aprobado; no hay despliegue ni envíos reales.

- [x] UI1 (sin dependencias): mapper de job vigente a contrato mínimo. RED/GREEN
  de todos los estados, validación, folio/periodo y exclusión de datos privados.
  Archivos: mapper y pruebas Functions. Verificación: test focalizado.
- [x] UI2a (depende UI1): sincronizador local separado del envío, guard demo/fake
  antes de I/O; impedir regresiones concurrentes. Archivos: adaptador, export y
  pruebas RTDB. Verificación: duplicados, job vigente, fallo sin reenvío.
- [x] UI2b (depende contrato UI1): reglas de lectura con query de 20 e índice;
  escrituras cliente prohibidas. Archivos: reglas y su suite. Verificación:
  Admin/payments permitidos; demás perfiles, lecturas amplias y writes denegados.
- [x] Checkpoint backend: tests unitarios/integración y build/typecheck Functions.
- [x] UI3a (depende UI1): parser cerrado y controlador de suscripción acotada con
  limpieza al cerrar/cambiar atleta/revocar permisos. Archivos: utilidad,
  servicio, pruebas. Verificación: estados, callbacks tardíos y payload inválido.
- [x] UI3b (depende UI3a): diálogo accesible y botón en Pagos para atleta
  registrado. Archivos: componente y página. Verificación: typecheck/build/lint.
- [x] UI4 (depende anteriores): Chrome con login manual si corresponde, QA local
  y matriz Playwright 320/768/1024/1440; registrar evidencia y límites en reporte.
  Parcial: fixture sintético del componente real revisado en Chrome y 4/4
  pruebas responsive aprobadas (cinco estados por viewport). No sustituye Pagos.
  Continuación: login manual y recorrido protegido confirmados en Chrome:
  Pendiente → Aceptado → Entregado → Leído, sin regresiones por duplicados o
  eventos atrasados; cambio a atleta sin historial; cierre y foco por teclado.
  Matriz Chrome 320/768/1024/1440 sin desbordes; 0 errores/warnings observados.
  El QA detectó contraste insuficiente del botón Cerrar y del folio en modo
  oscuro. Corregidos con tokens existentes y regresiones RED/GREEN de contraste
  mínimo 4.5:1; no se cambió el tema global ni el alcance aprobado.
  Cierre: nuevo login manual confirmado tras recuperar QA; Chrome DevTools
  registró LCP 638 ms, INP 50 ms y CLS 0.00, sin errores de consola/HTTP.
  Captura de 414 entradas de red: emuladores locales y cuatro peticiones de
  fuentes Google; sin destinos Meta observados. A pendiente, B vacío, cierre
  y devolución de foco confirmados; resumen sanitizado en el reporte.
  Son mediciones locales sin throttling, no garantías de producción.
  Disparo automático de Functions comprobado mediante
  eventos de RTDB 9010 + Functions 5002, aislados de Auth/RTDB manual: mensualidad →
  worker fake → proyección. Control negativo sin Functions falló por timeout;
  positivo 1/1 mediante escritura del pago y webhooks sintéticos firmados por
  HTTP local. Duplicados y eventos atrasados no retroceden Leído ni duplican
  intentos. Sin invocar handlers desde la prueba, instalar dependencias,
  cambiar credenciales de usuario, activar Meta ni modificar despliegue.
  Scheduler y trigger de tienda no ejecutados en esta prueba. Emuladores aislados
  apagados al terminar; bootstrap y fixture de la sesión manual preservados.
- [x] Checkpoint de cierre: revisión de cambios, regresiones y reporte E8-UI.
  Evidencia histórica de 212 tests y cierre de navegador documentados. Respaldo
  after-admin Auth+RTDB recuperado y verificado sin inspeccionar Auth; importación
  no ensayada. E8 general sigue abierta; no se autoriza despliegue ni Meta real.

## Archivos probables (todos dentro de app)

```text
database.rules.json
functions/src/notifications/status-projection.ts
functions/src/notifications/local-worker.ts o adaptador local de proyección
functions/src/index.ts
functions/tests/status-projection.test.ts
functions/tests/status-projection.integration.ts
functions/tests/automatic-pipeline.integration.ts
src/services/notification-status.service.ts
src/components/kronos/PaymentNotificationStatusDialog.vue
src/pages/pagos.vue
tests/database.rules.test.mjs
tests/notification-status.test.ts
e2e/responsive/payment-notifications-responsive.spec.ts
```

La lista orienta el impacto; no autoriza tocar archivos ajenos a esta capacidad.
El frontend no importará módulos de Admin SDK ni el generador PDF del backend.

## Verificación y comandos

Ejecutar desde `C:\Projects\Kronos\kronos-training-app\app`:

```powershell
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
npm run typecheck
npm run build
node --require ./scripts/node-userinfo-preload.cjs --import tsx --test tests/notification-status.test.ts
.\node_modules\.bin\eslint.cmd functions/src/notifications/status-projection.ts functions/tests/status-projection.test.ts src/services/notification-status.service.ts src/components/kronos/PaymentNotificationStatusDialog.vue src/pages/pagos.vue tests/notification-status.test.ts -c .eslintrc.cjs
$env:XDG_CONFIG_HOME = 'C:\Projects\Kronos\kronos-training-app\app\test-results\firebase-cli-e8'
$env:CI = 'true'
Remove-Item Env:FIREBASE_TOKEN, Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
.\node_modules\.bin\firebase.cmd emulators:exec --config firebase.status-qa.local --only database --project demo-kronos-training "node --require ./scripts/node-userinfo-preload.cjs --import tsx --test --test-concurrency=1 tests/database.rules.test.mjs functions/tests/status-projection.integration.ts"
.\node_modules\.bin\playwright.cmd test --config e2e/payment-notifications.config.ts --project=responsive
```

La matriz aislada ejecutada utiliza `playwright test --config
e2e/payment-notifications.config.ts --project=responsive`: destino fijo loopback,
Vite modo emulator y ningún estado autenticado. Los resultados y comandos
finales están en `functions/E8-UI-QA.md`. Para no resetear la sesión de QA manual,
la última suite RTDB utilizó el puerto separado 9010 (`firebase.status-qa.local`,
archivo local ignorado). Los gates de navegador no ejecutados se informan aparte.

## Límites, riesgos y gate

- Siempre: pruebas RED/GREEN, estado mínimo, validación de entradas, dinero
  independiente de notificaciones y suscripciones acotadas.
- Solicitar autorización: esta ruta/índice/reglas; cualquier ampliación posterior
  de datos, permisos, infraestructura, retención o dependencias.
- Nunca: desplegar, hacer backfill real, cambiar datos de clientes, enviar
  mensajes, habilitar Meta, dar permisos públicos o inspeccionar credenciales.

Riesgos: la proyección es eventualmente consistente; debe tolerar duplicados y
errores sin mentir sobre entregas. Es una copia operativa, no nueva fuente de
verdad. Antes de producción debe quedar incluida en la política aprobada de
retención/borrado. La publicación, recursos remotos y QA publicado conservan
sus gates separados. La aprobación recibida autoriza únicamente el
código local, las reglas/índice descritos y fixtures sintéticos en emuladores.

Autorización de E8-UI recibida. Login y recorrido Pagos → panel → cierre validados
con datos sintéticos. UI4 cerrada con red y Performance de Chrome DevTools;
los resultados y sus límites están en functions/E8-UI-QA.md.
No se autoriza despliegue ni acceso a la sesión de producción.

## Recuperación del entorno local autorizada

El usuario autorizó explícitamente recrear el entorno de QA y sus dos atletas
sintéticos después de que Vite/Auth/RTDB dejaron de responder y no se encontró
una exportación local. Se conserva el alcance E8-UI: proyecto demo-kronos-training,
loopback, planes/atletas/pagos sintéticos de 500 total, 200 abonado y 300 pendiente.
Crear sólo rutas QA ausentes; abortar si aparecen registros previos inesperados.
No borrar colecciones ni escribir usuarios/contraseñas desde scripts: primer Admin
e inicio de sesión se realizan manualmente en el perfil de Chrome de pruebas.
Se puede habilitar el dispositivo de bootstrap local identificado en esa página.
Guardar checkpoints con la CLI de emuladores dentro de test-results, ignorado
por Git; nunca imprimir archivos de exportación Auth ni copiar sesiones reales.
Exportar después de crear los fixtures y de completar el alta manual. Preparar
export-on-exit para cierres limpios e importar el checkpoint en próximas sesiones.
Un cierre forzado no garantiza exportación. El usuario completó el nuevo Admin
manualmente; Pagos autenticado, las trazas y el checkpoint after-admin están
verificados. El respaldo se conserva ignorado por Git; no se ensayó su importación.
