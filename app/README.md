# Kronos Training

Panel operativo de Kronos Training construido con Vue 3, Vuetify, Pinia y Firebase.

## Requisitos

- Node.js 20.19 o superior.
- Un proyecto Firebase configurado mediante `.env.local`; usa `.env.example` como referencia.
- Authentication con los proveedores **Correo electrónico/contraseña** y **Anónimo** habilitados.
- Realtime Database y Hosting configurados para el mismo proyecto.

## Desarrollo

```sh
npm install
npm run dev
```

El servidor sólo escucha en localhost. Para probarlo desde otro dispositivo de la red usa `npm run dev:host`.

## Validación

```sh
npm run typecheck
npm run build
npm run test:finance
npm run test:rules
npm audit --omit=dev
```

`npm run migrate:check` sólo debe ejecutarse cuando se proporcione de forma controlada una copia local autorizada del respaldo original, que ya no forma parte del repositorio.

Las pruebas de reglas requieren Java 21 o una versión compatible con Firebase Emulator Suite.

## Acceso y perfiles

- **Admin** tiene acceso total, crea cuentas y asigna permisos desde **Usuarios y permisos**.
- **Recepción** sólo abre los módulos habilitados y, dentro de cada uno, ejecuta las acciones asignadas por un Admin.
- Tienda separa **realizar ventas**, **aplicar abonos**, **administrar inventario** y **cancelar ventas**; estos permisos son independientes.
- Las cuentas nuevas reciben una contraseña temporal y deben cambiarla en el primer acceso.
- El primer Admin se crea desde un dispositivo anónimo que ya figure como autorizado en `v1/authorizedDevices`.

El alta se realiza con una instancia secundaria de Firebase Auth para no cerrar la sesión del Admin que crea al usuario. Los permisos también están aplicados en `database.rules.json`; ocultar una opción del menú no es el único control de acceso.

## Reportes y cierres

- El Dashboard Admin incluye detalle de ingresos, egresos, tienda, altas, bajas y stock por mes, además de comparación entre dos periodos.
- Caja chica corresponde a movimientos en efectivo. Cuenta bancaria agrupa transferencias y tarjetas; el método “Otro” permanece visible pero no se concilia automáticamente.
- El primer cierre diario solicita saldos iniciales. Los siguientes usan el último saldo contado y agregan los movimientos posteriores para mostrar diferencias.
- El cierre semanal de inventario compara existencias del sistema contra conteo físico y calcula faltantes a costo unitario. Guardar el cierre no modifica el stock.
- Los cierres y sus saldos son exclusivos de Admin en esta fase.

## Publicación de esta fase

1. Habilita Correo electrónico/contraseña y conserva Anónimo en Firebase Authentication.
2. Publica primero las reglas: `firebase deploy --only database`.
3. Publica la aplicación: `npm run build` y `firebase deploy --only hosting`.
4. En el acceso de Kronos, selecciona **Configurar el primer acceso** desde un dispositivo previamente autorizado y crea la cuenta Admin inicial.

No se debe crear el primer Admin antes de desplegar las nuevas reglas de Realtime Database.
