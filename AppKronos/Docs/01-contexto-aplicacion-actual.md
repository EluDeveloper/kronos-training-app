# Kronos Training — Contexto de la aplicación actual

Última actualización: 2026-08-03

## Propósito de este documento

Este archivo describe el estado real de la aplicación Kronos antes de comenzar su migración a Firebase. Debe utilizarse como fuente de contexto para evitar repetir el análisis de `AppKronos/kronos.html` y del respaldo JSON.

No contiene nombres, teléfonos ni otros datos personales provenientes del respaldo.

## Ubicación de los componentes principales

- Aplicación original: `AppKronos/kronos.html`
- Respaldo analizado: `AppKronos/Backup/kronos_backup_20260802.json`
- Nueva aplicación donde se realizará la migración: `app/`
- Repositorio: `kronos-training-app`
- Rama observada durante el análisis: `develop`

## Qué hace actualmente Kronos

La aplicación original es un panel administrativo para un gimnasio o box de CrossFit. Incluye los siguientes módulos:

1. Dashboard mensual y anual.
2. Programación semanal de entrenamientos o WODs.
3. Registro y directorio de atletas.
4. Control de mensualidades.
5. Registro de marcas y rendimiento deportivo.
6. Punto de venta, inventario, ventas y cuentas por cobrar.
7. Registro de egresos.
8. Comunidad, cumpleaños y marcas recientes.
9. Administración de planes.
10. Importación y exportación manual de respaldos JSON.

## Arquitectura actual de `kronos.html`

La aplicación está contenida completamente en un único archivo HTML de aproximadamente 254 KB y 3,353 líneas.

### Interfaz

- HTML estático.
- Tailwind cargado desde CDN.
- Chart.js cargado desde CDN.
- Fuentes de Google Fonts.
- Diseño oscuro y responsivo.
- Manejadores `onclick` declarados directamente en el HTML.
- Generación dinámica de muchas secciones mediante `innerHTML`.

### JavaScript

El código utiliza un módulo IIFE global llamado `KronosApp` con estas áreas principales:

- `State`: estado completo de la aplicación.
- `Storage`: lectura y escritura de datos locales.
- `Utils`: notificaciones, estados de pago e importación/exportación.
- `UI`: navegación, pestañas, alertas, confirmaciones y prompts.
- `Modules`: lógica funcional de cada módulo.

### Persistencia

La fuente de verdad actual es `localStorage`. Se utilizan estas claves:

- `crossfitData`
- `crossfitSkills`
- `kronosPlanes`
- `kronosProductos`
- `kronosVentas`
- `kronosEgresos`

El carrito temporal del punto de venta utiliza `sessionStorage.kronosCarritoPos`.

El respaldo JSON no se carga automáticamente. Para restaurarlo hay que utilizar manualmente la función de importación de la interfaz, después de lo cual sus datos se copian a `localStorage`.

### Dependencias externas

- `https://cdn.tailwindcss.com`
- `https://cdn.jsdelivr.net/npm/chart.js`
- Google Fonts

Esto implica que la presentación y las gráficas pueden fallar sin conexión. Chart.js tampoco tiene una versión fijada en la URL.

## Paleta visual de Kronos

La nueva aplicación debe conservar esta identidad:

| Uso | Color |
| --- | --- |
| Naranja de acción | `#FF401B` |
| Teal principal | `#44797F` |
| Cyan de acento | `#97D5DE` |
| Fondo principal | `#1B1D1A` |
| Superficie principal | `#232622` |
| Superficie secundaria | `#262925` |
| Texto claro | `#EBEBEB` |

Tipografías utilizadas:

- Syncopate para títulos de alto impacto.
- Montserrat para encabezados y etiquetas.
- Mulish para texto de lectura.

## Estructura de los datos actuales

### Atleta

Cada atleta contiene:

- `perfil`: nombre, teléfono, fecha de nacimiento, edad, estatus y, opcionalmente, fecha y motivo de baja.
- `membresia`: horario, plan, monto, día de pago, fecha de registro y recordatorio.
- `historial_pagos`: año, mes, estatus, método, monto y fecha de aplicación.
- `marcas`: skill y registros con fecha, libras, kilos y tipo.

### Plan

- Nombre.
- Vigencia.
- Estatus.
- Precio.

### Producto

- ID y nombre.
- Categoría y tamaño.
- Stock inicial, entradas, salidas y stock actual.
- Nivel de alerta.
- Costo unitario y precio de venta.
- Valor de inventario.

### Venta

- ID y fecha.
- Cliente o atleta.
- Producto principal y lista de artículos.
- Total, estatus y método de pago.
- Monto recibido, cambio, saldo a favor y abonos.

### Egreso

- ID y fecha.
- Categoría, subcategoría y descripción.
- Monto, método, estado y responsable.
- URL opcional de comprobante y timestamps.

## Estado del respaldo analizado

El archivo `kronos_backup_20260802.json` es JSON válido y coincide con el formato de exportación de `kronos.html`.

### Conteos

| Entidad | Cantidad |
| --- | ---: |
| Atletas | 55 |
| Atletas activos | 44 |
| Atletas inactivos | 11 |
| Planes | 5 |
| Skills | 11 |
| Productos | 5 |
| Ventas | 96 |
| Ventas liquidadas | 74 |
| Ventas con deuda | 17 |
| Ventas canceladas | 5 |
| Egresos | 74 |
| Marcas deportivas | 97 |
| Entradas mensuales de pago | 660 |

### Consistencia positiva

- No hay atletas sin perfil, membresía o historial de pagos.
- No hay referencias a planes o productos inexistentes.
- No hay stock negativo.
- Las fórmulas de stock y valor de inventario son consistentes.
- No hay nombres de atletas ni IDs de venta duplicados.
- Todos los teléfonos cumplen diez dígitos.

### Observaciones de calidad

- Existen tres valores de teléfono repetidos. Pueden corresponder a contactos familiares, pero deben revisarse.
- Cuatro edades almacenadas ya no coinciden con la edad calculada al 2026-08-03.
- Cuatro atletas inactivos no tienen `fecha_baja`.
- Todo el historial mensual pertenece a 2026.

## Hallazgos y riesgos conocidos

### 1. Privacidad del respaldo

El respaldo contiene datos personales y financieros en texto claro. El archivo está versionado por Git y el repositorio tiene un remoto de GitHub configurado.

No se confirmó si el repositorio remoto es público. Antes de publicar la nueva aplicación se debe:

- Excluir `Backup/*.json` mediante `.gitignore`.
- Confirmar la visibilidad del repositorio.
- Si el respaldo fue publicado, retirarlo también del historial Git.
- Mantener copias cifradas fuera del repositorio.

### 2. Pérdida de datos por almacenamiento local

El borrado del almacenamiento del navegador, el cambio de perfil o de dispositivo puede hacer que los datos desaparezcan. No existe sincronización multiusuario ni almacenamiento central.

### 3. Cálculo incorrecto de ingresos de tienda

La función actual:

- Ignora abonos actuales de ventas creadas en meses anteriores.
- Asigna abonos posteriores al mes original de la venta.
- Cuenta el efectivo recibido antes de restar el cambio entregado.

Con el respaldo analizado:

- Ventas no canceladas: `$2,415`.
- Deuda abierta: `$540`.
- Valor cobrado por las ventas: `$1,875`.
- El algoritmo anual actual contabilizaría `$2,255`.
- Diferencia neta: sobreestimación de `$380`.

Este cálculo debe corregirse antes de migrar los reportes financieros.

### 4. Año 2026 codificado como fallback

Varias funciones buscan el año actual y, si no existe, utilizan automáticamente el historial `2026`. En 2027 esto podría mostrar pagos de 2026 como si pertenecieran al nuevo año.

### 5. Riesgo de inyección de HTML

Nombres, productos y descripciones se insertan directamente con `innerHTML`. Un respaldo manipulado podría ejecutar JavaScript. La aplicación Vue deberá usar interpolación y eventos Vue seguros.

### 6. Importación sin validación

No existe versión de esquema, validación completa, rollback, vista previa ni reporte detallado de errores.

### 7. Bajas sin fecha

El dashboard asigna al mes presente cualquier baja histórica que no tenga `fecha_baja`. Los cuatro casos del respaldo pueden distorsionar la gráfica anual.

### 8. IDs de ventas

Los IDs usan únicamente los últimos seis dígitos de `Date.now()`. Firebase debe generar los nuevos IDs mediante `push()` o UUID.

### 9. Edades almacenadas

La edad se guarda como dato fijo. En la nueva aplicación debe calcularse desde `fecha_nacimiento`.

## Estado de la carpeta `app`

La carpeta `app` contiene una plantilla Materio con:

- Vue `3.5.x` y TypeScript.
- Vite `5.x`.
- Vuetify `3.7.x`.
- Pinia `2.x`.
- Vue Router `4.x`.
- ApexCharts.
- ESLint y Stylelint.

Archivos importantes:

- `app/src/main.ts`
- `app/src/App.vue`
- `app/src/plugins/vuetify/theme.ts`
- `app/src/plugins/router/routes.ts`
- `app/src/layouts/components/NavItems.vue`
- `app/src/pages/dashboard.vue`

La plantilla todavía contiene dashboard y páginas demo, navegación en inglés, login/registro de demostración e imágenes promocionales de Materio.

El tema ya utiliza parcialmente `#44797F` y `#FF401B`, pero el modo oscuro todavía conserva fondos morados de la plantilla.

## Verificaciones técnicas realizadas

- Los dos scripts inline de `kronos.html` tienen sintaxis JavaScript válida.
- Se encontraron 175 IDs HTML sin duplicados.
- Las 144 referencias estáticas a `getElementById` tienen un elemento correspondiente.
- No existen pruebas automatizadas para la lógica funcional.
- La validación visual automatizada no pudo ejecutarse porque el navegador aislado no puede abrir archivos locales ni el servidor local del host. El análisis estático sí se completó.

## Estado de implementación al cerrar este documento

Todavía no se ha modificado `app` para Firebase. El intento inicial de agregar la dependencia fue interrumpido antes de aplicarse.

El siguiente documento, `02-handoff-mvp-firebase.md`, contiene el plan operativo y el punto exacto de continuación.
