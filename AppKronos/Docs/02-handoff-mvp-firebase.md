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

## Configuración Firebase pendiente

Antes de probar la conexión real se necesita obtener de Firebase Console el objeto de configuración de la aplicación web:

- `apiKey`
- `authDomain`
- `appId`
- `storageBucket`
- `messagingSenderId`
- `databaseURL`
- `projectId`

Para App Check también se requiere la clave pública del proveedor reCAPTCHA Enterprise o del proveedor elegido.

Estas propiedades deben representarse como variables `VITE_FIREBASE_*`. Debe existir un `.env.example` sin secretos y un `.env.local` ignorado por Git.

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

### Fase 5 — Migración

- [ ] Leer el respaldo sin modificarlo.
- [ ] Validar esquema y tipos.
- [ ] Transformar a `/v1`.
- [ ] Corregir lógica financiera sin inventar fechas.
- [ ] Marcar bajas sin fecha como `migrationNeedsReview`.
- [ ] Comparar conteos.
- [ ] Probar en Emulator Suite.
- [ ] Ejecutar migración real una sola vez.
- [ ] Registrar `schemaVersion` y `migratedAt`.

Conteos esperados:

- 55 atletas.
- 5 planes.
- 11 skills.
- 5 productos.
- 92 ventas.
- 74 egresos.
- 97 marcas.
- 660 estados mensuales de pago, salvo transformación documentada.

### Fase 6 — Hosting

- [ ] Crear `.firebaserc` para `kronos-training-fd5e5`.
- [ ] Crear `firebase.json` con `dist`.
- [ ] Configurar rewrite SPA.
- [ ] Incluir `database.rules.json`.
- [ ] Ejecutar typecheck y build.
- [ ] Probar reglas en emulador.
- [ ] Desplegar a preview.
- [ ] Validar móvil, tablet y escritorio.
- [ ] Activar App Check.
- [ ] Desplegar Hosting y reglas.
- [ ] Configurar alertas de presupuesto.

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
5. Implementar la Fase 1.
6. Hacer que el proyecto compile aunque falten variables reales.
7. No abrir reglas públicas.
8. Ejecutar typecheck y build tras el primer bloque.

## Mensaje sugerido para reanudar

> Continúa la implementación del MVP Firebase de Kronos dentro de `app/`. Lee primero `AppKronos/Docs/01-contexto-aplicacion-actual.md` y `AppKronos/Docs/02-handoff-mvp-firebase.md`. Retoma desde la primera casilla pendiente, conserva Vue/Vuetify y no uses reglas públicas de Firebase.

## Estado actual del handoff

- Análisis y estrategia Firebase terminados.
- Fases 1, 2, 3 y 4 implementadas y verificadas mediante typecheck.
- Firebase instalado; la conexión real continúa pendiente de las variables de la aplicación web.
- Sin migración real ni despliegue todavía.
- Siguiente paso: Fase 5 — reglas, transformación y validación del respaldo.
