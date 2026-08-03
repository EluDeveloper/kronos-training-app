# Kronos Training — Handoff para implementar el MVP en Firebase

Última actualización: 2026-08-03

## Cómo utilizar este documento

Este archivo está diseñado para continuar el trabajo en un chat nuevo sin volver a analizar la aplicación original.

Antes de realizar cambios, el siguiente agente debe leer completamente:

1. `AppKronos/Docs/01-contexto-aplicacion-actual.md`
2. Este documento.

También debe respetar los datos reales del respaldo y no incluir información personal en mensajes, pruebas, fixtures ni commits.

## Objetivo confirmado

Construir dentro de `app/` un MVP web de Kronos que:

- Conserve la estructura visual responsiva de la plantilla Vue/Vuetify.
- Use la identidad de `AppKronos/kronos.html`.
- Guarde los datos en Firebase Realtime Database.
- Sincronice cambios entre dispositivos.
- Deje de depender de `localStorage` como fuente de verdad.
- Migre de forma controlada el respaldo existente.
- Se despliegue finalmente mediante Firebase Hosting.
- No muestre una pantalla de login durante la primera etapa.

## Proyecto Firebase confirmado

- Nombre: `kronos-training`
- Project ID: `kronos-training-fd5e5`
- Realtime Database: `https://kronos-training-fd5e5-default-rtdb.firebaseio.com/`

## Configuración Firebase aplicada

La aplicación web `Kronos Training Web` quedó registrada en Firebase y su configuración oficial se cargó localmente mediante:

- `apiKey`
- `authDomain`
- `appId`
- `storageBucket`
- `messagingSenderId`
- `databaseURL`
- `projectId`

App Check quedó registrado con reCAPTCHA Enterprise y los dominios oficiales de Firebase Hosting.

Estas propiedades se representan como variables `VITE_FIREBASE_*`. Existe un `.env.example` sin credenciales y un `.env.local` ignorado por Git con la configuración del proyecto.

La configuración web no es el mecanismo de seguridad. La seguridad dependerá de Authentication, App Check y las reglas de Realtime Database.

## Decisión de seguridad sin pantalla de login

No se deben utilizar reglas públicas como:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

La estrategia acordada para el MVP es:

1. Activar Firebase Anonymous Authentication.
2. Ejecutar `signInAnonymously()` automáticamente.
3. Cada dispositivo obtiene un UID persistente mientras no borre los datos del navegador.
4. Autorizar dispositivos mediante `/v1/authorizedDevices/{uid}`.
5. Un UID no autorizado sólo puede leer su propio estado de autorización.
6. Mostrar “Dispositivo pendiente” con el UID y los pasos para autorizarlo desde Firebase Console.
7. Sólo los dispositivos autorizados pueden administrar el negocio.
8. Activar App Check antes de abrir el sitio a Internet.

Advertencias:

- Anonymous Auth sin lista de dispositivos no protege los datos.
- App Check reduce abuso, pero no sustituye autorización.
- Borrar los datos del navegador cambia el UID y obliga a autorizar nuevamente.
- No activar limpieza automática de cuentas anónimas sin estudiar su impacto.

## Stack que debe conservarse

- Vue 3 con Composition API.
- TypeScript estricto.
- Vite.
- Vuetify.
- Pinia.
- Vue Router.
- ApexCharts.
- Iconify/Remix Icons.

La carpeta contiene `package-lock.json` y `pnpm-lock.yaml`. La documentación actual usa npm, por lo que npm es la elección conservadora; no actualizar ambos lockfiles.

Dependencia principal por agregar: `firebase`.

No sustituir la plantilla por otro framework.

## Paleta y sistema visual

| Token | Valor |
| --- | --- |
| `primary` | `#44797F` |
| `accent` / `info` | `#97D5DE` |
| `action` / `error` | `#FF401B` |
| `background` | `#1B1D1A` |
| `surface` | `#232622` |
| `surface-variant` | `#262925` |
| `on-background` | `#EBEBEB` |
| `on-surface` | `#EBEBEB` |

Fuentes: Syncopate para marca, Montserrat para encabezados y Mulish para contenido.

La primera vista debe sentirse como Kronos, no como el dashboard genérico de Materio.

## Rutas previstas

| Ruta | Módulo |
| --- | --- |
| `/dashboard` | Resumen mensual y anual |
| `/atletas` | Directorio, altas, edición y bajas |
| `/pagos` | Mensualidades e historial |
| `/rendimiento` | PRs y gráficas |
| `/tienda` | POS, inventario, ventas y deudas |
| `/egresos` | Gastos y estados |
| `/programacion` | WODs por fecha |
| `/comunidad` | Cumpleaños y marcas recientes |
| `/planes` | Catálogo de membresías |

Las rutas demo deben dejar de estar accesibles. `/login` y `/register` no deben mostrarse en esta etapa.

## Estructura de código sugerida

```text
app/
├── firebase.json
├── .firebaserc
├── database.rules.json
├── .env.example
├── scripts/migrate-kronos-backup.mjs
└── src/
    ├── firebase/{config,auth,database}.ts
    ├── types/domain.ts
    ├── services/*.service.ts
    ├── stores/*.ts
    ├── composables/*.ts
    ├── components/kronos/*.vue
    └── pages/*.vue
```

La lógica Firebase debe permanecer separada de los componentes Vue.

## Modelo previsto en Realtime Database

```text
/v1
  /meta
  /authorizedDevices/{uid}
  /athletes/{athleteId}
  /payments/{athleteId}/{yyyy-mm}
  /performance/{athleteId}/{skillId}/{recordId}
  /plans/{planId}
  /skills/{skillId}
  /products/{productId}
  /sales/{saleId}
  /expenses/{expenseId}
  /workouts/{yyyy-mm-dd}
  /settings
```

### Reglas del modelo

- No utilizar nombres de atleta o skill como IDs.
- Evitar `.`, `#`, `$`, `[`, `]` y `/` en claves.
- Generar IDs con `push()`.
- Usar timestamps del servidor.
- Calcular edad desde fecha de nacimiento.
- Guardar pagos con llave `yyyy-mm`; nunca usar fallback fijo a 2026.
- Guardar precio y costo efectivos en cada venta.
- Conservar artículos de venta en `items`.
- No guardar totales derivados como única fuente de verdad.

## Stores y suscripciones

Cada store Pinia debe:

- Exponer `loading`, `error` y datos normalizados.
- Tener `subscribe()` y desuscripción explícita.
- Evitar listeners en la raíz `/v1`.
- Escuchar únicamente el nodo necesario.
- Gestionar estados vacíos.
- No usar `localStorage` como fuente de verdad.

El almacenamiento del navegador sólo puede usarse para preferencias no críticas.

## Operaciones financieras

### Mensualidades

- Guardar `/payments/{athleteId}/{yyyy-mm}`.
- Usar fecha real de aplicación.
- Mantener método y monto efectivo.
- Consultar cualquier año sin fallback.

### Ventas e inventario

- El ingreso efectivo no es el efectivo bruto antes del cambio.
- `montoRecibido - cambioEntregado - saldoAFavor` es el efectivo aplicado inicialmente.
- Los abonos posteriores se atribuyen al mes de su propia fecha.
- Un abono a una venta antigua aparece como ingreso del mes actual.
- Las cancelaciones restauran inventario sólo una vez.
- Operaciones idempotentes y transacciones para evitar stock negativo.
- Si la atomicidad multiartículo no es suficiente, valorar Cloud Functions después del MVP.

### Egresos

- Monto mayor que cero.
- No aceptar como pagado un gasto futuro.
- Separar fecha del gasto y timestamp de creación.
- Comprobantes se posponen hasta decidir Firebase Storage.

## Reglas de seguridad previstas

- Raíz cerrada.
- Usuario autenticado anónimamente.
- Acceso al negocio sólo si `/authorizedDevices/{auth.uid}/enabled` es `true`.
- Cada dispositivo sólo puede leer su autorización.
- El cliente no puede autorizarse a sí mismo.
- Cada entidad debe tener reglas `.validate`.
- Agregar `.indexOn` para consultas.
- Probar todo con Firebase Emulator Suite.

Índices iniciales probables:

- Atletas: `status`, `profile/name`, `membership/paymentDay`, `membership/planId`.
- Ventas: `createdAt`, `status`, `customerId`.
- Egresos: `date`, `status`, `category`.

## Fases de implementación

### Fase 1 — Fundación visual y técnica — LIBERADA 2026-08-03

- [x] Agregar Firebase al `package.json`.
- [x] Usar npm como administrador único.
- [x] Crear `.env.example`.
- [x] Crear inicialización tolerante a configuración faltante.
- [x] Aplicar paleta y tipografías Kronos.
- [x] Sustituir navegación demo.
- [x] Simplificar encabezado, pie y perfil demo.
- [x] Crear pantallas de configuración faltante y dispositivo pendiente.

Verificación de liberación:

- Dependencias instaladas con npm y `package-lock.json` actualizado.
- Typecheck completado sin errores.
- Firebase queda desacoplado de las credenciales reales: si faltan variables, la interfaz muestra la configuración pendiente en lugar de fallar.
- Anonymous Auth, autorización por UID y App Check quedan preparados para activarse al proporcionar la configuración web.

### Fase 2 — Tipos, servicios y stores — LIBERADA 2026-08-03

- [x] Crear interfaces TypeScript.
- [x] Crear servicios Firebase por dominio.
- [x] Crear stores Pinia.
- [x] Añadir estado de conexión.
- [x] Crear sistema de errores y notificaciones.
- [x] Evitar listeners globales y fugas.

Verificación de liberación:

- Servicios independientes para atletas, planes, pagos, rendimiento, skills, productos, ventas, egresos y programación.
- Stores Pinia con estados de carga/error y cierre explícito de suscripciones.
- Listener de conectividad limitado a `.info/connected`; los datos de negocio se escuchan por nodo de dominio, nunca desde `/v1` completo.
- Snackbar global y composable de notificaciones disponibles para todas las pantallas.
- Typecheck completado sin errores después de integrar la capa de datos.

### Fase 3 — Núcleo operativo — LIBERADA 2026-08-03

- [x] Dashboard.
- [x] Atletas.
- [x] Planes.
- [x] Pagos.
- [x] Rendimiento.
- [x] Tienda e inventario.
- [x] Deudas y abonos.
- [x] Egresos.

Verificación de liberación:

- Dashboard con KPIs en tiempo real de atletas, membresías, tienda, caja, deuda y stock bajo.
- CRUD operativo de atletas y planes; pagos guardados por periodo real `yyyy-mm`.
- Registro y eliminación de marcas deportivas con conversión lb/kg y filtros.
- Punto de venta con decremento atómico de inventario, ventas de contado/crédito, abonos transaccionales y cancelación idempotente con restitución de existencias.
- Egresos pagados, pendientes o programados incluidos en el resumen mensual.
- Typecheck completado sin errores después de integrar todas las pantallas de la fase.

### Fase 4 — Módulos secundarios — LIBERADA 2026-08-03

- [x] Programación editable.
- [x] Comunidad y cumpleaños.
- [x] PRs recientes.
- [x] Estados vacíos y filtros responsivos.

Verificación de liberación:

- Programación permite crear, editar, cambiar de fecha y eliminar WODs con bloques dinámicos.
- Comunidad calcula los cumpleaños de los próximos 60 días a partir de la fecha de nacimiento, sin guardar edades derivadas.
- PRs recientes se obtienen de las mejores marcas vigentes por atleta y skill.
- Las pantallas principales incluyen estados vacíos, búsquedas/filtros y distribuciones adaptables para móvil, tablet y escritorio.
- Typecheck completado sin errores después de integrar la fase.

### Fase 5 — Migración — LIBERADA 2026-08-03

- [x] Leer el respaldo sin modificarlo.
- [x] Validar esquema y tipos.
- [x] Transformar a `/v1`.
- [x] Corregir lógica financiera sin inventar fechas.
- [x] Marcar bajas sin fecha como `migrationNeedsReview`.
- [x] Comparar conteos.
- [x] Probar en Emulator Suite.
- [x] Ejecutar migración real una sola vez.
- [x] Registrar `schemaVersion` y `migratedAt`.

Verificación completada:

- `npm run migrate:check` valida el respaldo sin generar archivos adicionales ni escribir en Firebase.
- Resultado: 55 atletas (44 activos y 11 inactivos), 4 bajas por revisar, 5 planes, 11 skills, 5 productos, 96 ventas, 74 egresos, 97 marcas y 660 pagos.
- No se encontraron referencias huérfanas ni advertencias de transformación.
- Los abonos conservan su propia fecha y se limitan al saldo de la venta; las ventas canceladas se marcan como inventario ya restituido porque el stock del respaldo es el stock final.
- `npm run test:rules` pasó 7 de 7 pruebas en Realtime Database Emulator: acceso anónimo, dispositivo pendiente, autoautorización, acceso permitido, stock negativo, venta atómica y nodos administrativos.
- El emulador requiere Java 21 o compatible en `PATH`; la verificación de esta sesión se realizó con un JRE portátil temporal.
- La base destino se verificó vacía antes de escribir y las reglas se desplegaron antes de la carga.
- La migración real a `/v1` se ejecutó una sola vez y la lectura posterior confirmó exactamente 55 atletas, 5 planes, 11 skills, 5 productos, 96 ventas, 74 egresos, 97 marcas y 660 pagos.
- El archivo temporal `kronos-v1-migration.json`, que contenía datos reales, se eliminó después de comprobar los conteos remotos.

Conteos esperados:

- 55 atletas.
- 5 planes.
- 11 skills.
- 5 productos.
- 96 ventas.
- 74 egresos.
- 97 marcas.
- 660 estados mensuales de pago, salvo transformación documentada.

### Fase 6 — Hosting — LIBERADA 2026-08-03

- [x] Crear `.firebaserc` para `kronos-training-fd5e5`.
- [x] Crear `firebase.json` con `dist`.
- [x] Configurar rewrite SPA.
- [x] Incluir `database.rules.json`.
- [x] Ejecutar typecheck y build.
- [x] Probar reglas en emulador.
- [x] Desplegar a preview; sustituido por una validación directa sobre la versión oficial solicitada por el usuario.
- [x] Validar móvil, tablet y escritorio.
- [x] Activar App Check.
- [x] Desplegar Hosting y reglas.
- [x] Revisar alertas de presupuesto; no aplican mientras el proyecto continúe en el Plan Spark sin cuenta de facturación.

Verificación completada:

- `npm run typecheck` finaliza sin errores.
- `npm run build` genera correctamente `app/dist`.
- Hosting usa caché inmutable sólo para assets versionados y desactiva caché para `index.html`.
- Anonymous Authentication está habilitado y el primer dispositivo quedó autorizado mediante su UID.
- App Check con reCAPTCHA Enterprise está registrado y el enforcement de Realtime Database figura como aplicado.
- La versión oficial está publicada en `https://kronos-training-fd5e5.web.app`.
- La versión publicada se recargó después de activar enforcement: mostró el dashboard sincronizado y no produjo errores ni advertencias de consola.
- La prueba responsiva se ejecutó en 390×844, 1024×768 y 1440×900 sin desbordamiento horizontal.

### Fase 7 — Dashboard accionable y recibos — LIBERADA 2026-08-03

#### Fase 7A — Reporte anual y acciones del mes — LIBERADA 2026-08-03

- [x] Separar el dashboard en Mes actual y Reporte anual.
- [x] Calcular mensualidades por fecha real de aplicación.
- [x] Calcular ventas y abonos por fecha real de aplicación sin duplicarlos.
- [x] Comparar ingresos, egresos y flujo neto para los 12 meses del año seleccionado.
- [x] Mostrar mensualidades vencidas y próximas a vencer.
- [x] Mostrar deudas de tienda, inventario bajo y egresos pendientes.
- [x] Abrir cobranza con atleta y periodo precargados desde el dashboard.
- [x] Abrir directamente las pestañas de deudas e inventario desde las acciones mensuales.
- [x] Ejecutar typecheck, build, despliegue y prueba en producción.

Verificación de liberación:

- La versión oficial muestra ambas pestañas, los cuatro indicadores anuales, la gráfica comparativa y el detalle mensual.
- Se verificó en producción una mensualidad vencida: la acción Cobrar navegó a `/pagos` y abrió el formulario con el periodo preparado.
- La consola de producción no registró errores ni advertencias durante la prueba.

#### Fase 7B — Recibos operativos — LIBERADA 2026-08-03

- [x] Generar recibos de mensualidades.
- [x] Generar recibos de ventas.
- [x] Generar recibos de abonos.
- [x] Regenerar recibos desde los historiales.
- [x] Conservar folio, fecha, concepto, método, monto y saldo en la representación del recibo.

Verificación de liberación:

- Al aplicar una mensualidad, completar una venta o registrar un abono se prepara el recibo correspondiente sin duplicar movimientos financieros.
- Los historiales de mensualidades y ventas permiten regenerar recibos; cada pago de una venta tiene su propio recibo de abono.
- Los folios usan prefijos `MEM`, `VEN` y `ABO` para distinguir el origen.
- Se validaron en producción recibos históricos de mensualidad, venta y abono.

#### Fase 7C — PDF, impresión y WhatsApp — LIBERADA 2026-08-03

- [x] Crear diseño de recibo con identidad Kronos.
- [x] Descargar el recibo como PDF.
- [x] Imprimir el recibo.
- [x] Compartir el PDF mediante Web Share API cuando el dispositivo lo permita.
- [x] Abrir WhatsApp con destinatario y mensaje preparados como alternativa.
- [x] Validar el PDF renderizado y probar la liberación en producción.

Verificación de liberación:

- El PDF A5 utiliza la paleta Kronos, muestra detalle, total, pago y saldo, y fue renderizado visualmente sin cortes, solapamientos ni texto ilegible.
- En dispositivos compatibles, Compartir abre el menú nativo con el archivo PDF. Como alternativa, el PDF se descarga y WhatsApp abre el chat con teléfono y mensaje preparados.
- La vista de recibo se verificó a 390×844 sin desbordamiento horizontal.
- `jspdf` se actualizó a 4.2.1 después de detectar una vulnerabilidad crítica en versiones anteriores; la auditoría de producción ya no reporta vulnerabilidades críticas.
- Typecheck, build y despliegue final de Firebase Hosting completados correctamente.

### Fase 8 — Operación avanzada y experiencia de uso — EN PROGRESO

#### Fase 8A — Identidad, recibos y cobro emergente — LIBERADA 2026-08-03

- [x] Usar los logos oficiales de `app/public/images/Kronos` en navegación, estados de sistema y recibos.
- [x] Sustituir el estado ambiguo `Liquidado $0` por `Saldo $0` y `Pago completo`.
- [x] Abrir el cobro en un diálogo desde el dashboard sin abandonar la página.
- [x] Generar el recibo inmediatamente después del cobro emergente.
- [x] Cambiar la selección de atleta del cobro a un autocomplete buscable.
- [x] Separar visualmente atleta, periodo, monto y método en el formulario de pago.
- [x] Mejorar el espaciado del formulario de venta y hacer buscables atleta y producto.
- [x] Mover deudas, inventario y egresos antes de las listas de acciones mensuales.
- [x] Añadir búsqueda, filtro por periodo y paginación de 15 al historial de pagos.
- [x] Renderizar y revisar visualmente el PDF actualizado.
- [x] Ejecutar typecheck, build, despliegue y prueba en producción.

Verificación de liberación:

- El PDF muestra el logo horizontal oficial sobre el encabezado oscuro, saldo separado y estado `Pago completo` sin presentar `$0` como si fuera el importe liquidado.
- En producción, el botón Cobrar abrió un diálogo con atleta buscable, periodo, importe y método; no se escribió ningún pago durante la prueba de interfaz.
- Los indicadores operativos aparecen antes de las mensualidades vencidas.
- El historial de pagos publicado muestra filtros y máximo 15 registros por página.
- La consola de producción no registró errores ni advertencias.

#### Fase 8B — Tickets de cobranza consolidados — LIBERADA 2026-08-03

- [x] Crear aviso de cobranza con mensualidad y adeudos de tienda del atleta.
- [x] Detallar productos y saldos de cada venta pendiente.
- [x] Mostrar el adeudo de tienda junto al atleta en las acciones del dashboard.
- [x] Descargar, imprimir y compartir el aviso por WhatsApp.
- [x] Diferenciar visualmente un aviso informativo de un recibo pagado.
- [x] Renderizar, revisar, construir y desplegar la fase.

Verificación de liberación:

- El aviso A5 usa el logo oficial, lista mensualidad y productos pendientes, muestra el total a pagar y aclara que no es comprobante de pago.
- El mensaje de WhatsApp enumera cada concepto y su importe antes del total.
- En producción, Recordar abrió el aviso con mensualidad, total, PDF, impresión y WhatsApp sin errores de consola.

#### Fase 8C — Visitas y cuponera — PENDIENTE

- [ ] Registrar visitas por atleta y periodo.
- [ ] Calcular visitas acumuladas para cobro al final del mes.
- [ ] Controlar cuponera de 10 visitas y visitas restantes.
- [ ] Alertar cuando queden dos visitas y preparar recordatorio de renovación.
- [ ] Considerar adeudos de tienda en estados de cuenta por visitas.

#### Fase 8D — Tablas, filtros y formularios — PENDIENTE

- [ ] Limitar todas las tablas a 15 registros por página.
- [ ] Añadir filtros útiles a todas las tablas.
- [ ] Sustituir selects extensos por autocompletes buscables.
- [ ] Revisar espaciado y comportamiento responsivo de todos los formularios.

#### Fase 8E — Rendimiento comparativo — PENDIENTE

- [ ] Editar marcas existentes.
- [ ] Seleccionar atleta y skill con búsqueda.
- [ ] Mostrar gráfica histórica y evolución por marca.
- [ ] Mantener eliminación y conversión lb/kg.

Riesgo de dependencias pendiente:

- `npm audit --omit=dev` reporta 9 avisos (2 moderados y 7 altos) en la cadena de herramientas heredada de la plantilla: Vite/esbuild/Rollup, PostCSS, Immutable y utilidades de lint/build.
- El artefacto publicado es estático y esos paquetes no ejecutan un servidor Node en Firebase Hosting, pero deben actualizarse en una fase de mantenimiento.
- No ejecutar `npm audit fix --force` sin una rama y pruebas completas porque propone una actualización mayor de Vite.

## Procedimiento controlado ejecutado

1. Registrar u obtener la aplicación web en Firebase Console y crear `app/.env.local` desde `.env.example`.
2. Habilitar Authentication > Sign-in method > Anonymous.
3. Ejecutar `npm run build` con la configuración real.
4. Iniciar sesión en Firebase CLI mediante `npx firebase login`.
5. Desplegar primero las reglas con `npx firebase deploy --only database`.
6. Ejecutar `npm run migrate:check` y revisar nuevamente los conteos.
7. Generar el archivo local ignorado por Git con `npm run migrate:export`.
8. Confirmar que la base destino no contiene datos de negocio que deban conservarse.
9. Ejecutar una sola vez `npx firebase database:update /v1 kronos-v1-migration.json --project kronos-training-fd5e5 --force`. Esta operación conserva `/v1/authorizedDevices` porque el archivo sólo contiene los hijos de negocio.
10. Abrir la aplicación, copiar el UID pendiente y crear `/v1/authorizedDevices/{uid}` con `{ "enabled": true, "label": "..." }` desde Firebase Console.
11. Configurar reCAPTCHA Enterprise/App Check, colocar `VITE_FIREBASE_APPCHECK_SITE_KEY`, reconstruir y activar enforcement.
12. Validar la versión oficial y publicar Hosting. En esta liberación se omitió el canal preview porque el usuario solicitó avanzar directamente al despliegue oficial.

Los pasos 1 a 12 se completaron el 2026-08-03. Si se repite el procedimiento en otro entorno, primero debe comprobarse que el destino no contiene una migración previa.

El archivo `kronos-v1-migration.json` contiene datos reales y está excluido de Git. Debe eliminarse de forma segura después de verificar la migración.

## Criterios de aceptación

1. Firebase es la fuente de verdad.
2. Dos dispositivos autorizados sincronizan cambios.
3. Un dispositivo no autorizado no lee datos de negocio.
4. Atletas y pagos funcionan sin año fijo.
5. Ventas, cambio, créditos y abonos son conciliables.
6. El inventario no queda negativo por concurrencia.
7. Las cancelaciones no duplican devoluciones.
8. Los egresos alimentan los reportes.
9. El respaldo se migra con conteos esperados.
10. La interfaz funciona en móvil, tablet y escritorio.
11. Build y typecheck pasan.
12. Las reglas tienen pruebas permitidas y denegadas.
13. La aplicación está en Firebase Hosting.

## Pruebas esenciales

- Seguridad: usuario no autenticado, anónimo no autorizado, dispositivo autorizado y autoautorización denegada.
- Multi-dispositivo: atleta, pago y plan reflejados en tiempo real.
- Finanzas: pago exacto, cambio, crédito, abono inicial, abono posterior, liquidación y cancelación.
- Inventario: dos ventas simultáneas con stock limitado.
- Migración: conteos, referencias, stock, deuda, pagos y registros por revisar.

## Fuera de alcance inicial

- Login visible por correo o Google.
- Roles múltiples detallados.
- Nómina y facturación fiscal.
- Pagos en línea.
- Cloud Functions salvo necesidad de atomicidad.
- Comprobantes en Firebase Storage.
- Notificaciones push.
- Aplicación móvil nativa.
- Portal de atletas.

## Primeras acciones para el siguiente chat

1. Leer ambos documentos.
2. Revisar `git status` y preservar cambios del usuario.
3. Trabajar en `app/`.
4. Revisar `package.json`, tema, rutas y navegación; no repetir el análisis de `kronos.html`.
5. Retomar desde el mantenimiento posterior al MVP o desde una nueva solicitud del usuario; las fases 1 a 6 están liberadas.
6. Mantener `.env.local` fuera de Git y no copiar credenciales a documentos ni mensajes.
7. No abrir reglas públicas ni volver a ejecutar la migración real sobre el proyecto de producción.
8. Repetir typecheck, build, `migrate:check` y `test:rules` antes de una futura publicación.

## Mensaje sugerido para reanudar

> Continúa la implementación del MVP Firebase de Kronos dentro de `app/`. Lee primero `AppKronos/Docs/01-contexto-aplicacion-actual.md` y `AppKronos/Docs/02-handoff-mvp-firebase.md`. Retoma desde la primera casilla pendiente, conserva Vue/Vuetify y no uses reglas públicas de Firebase.

## Estado actual del handoff

- Análisis y estrategia Firebase terminados.
- Fases 1 a 7 implementadas y liberadas.
- Respaldo migrado una sola vez a Realtime Database y conteos remotos verificados.
- Anonymous Authentication, autorización por dispositivo, reglas y App Check activos.
- Build, typecheck, Emulator Suite y pruebas responsivas completados.
- Aplicación oficial disponible en `https://kronos-training-fd5e5.web.app`.
- Dashboard anual, acciones de cobranza y recibos PDF/WhatsApp disponibles en producción.
- Siguiente paso recomendado: priorizar el mantenimiento de dependencias señalado en este documento y definir el siguiente módulo operativo.
