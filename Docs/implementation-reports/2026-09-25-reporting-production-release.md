# Production Release: Reportes Fases 1–8

Estado: reglas y Hosting publicados en producción; smoke autenticado y sincronización de `main` pendientes.

## Alcance autorizado

- Proyecto Firebase: `kronos-training-fd5e5`.
- Publicar únicamente reglas de Realtime Database y Firebase Hosting, en ese orden.
- Sin despliegue de Functions, migraciones ni escritura manual de datos de producción.
- `develop` publicado con los commits `cccbef2`, `6f62bac` y `448250e`; integrar `main` tras el smoke productivo.

## Controles previos

- `origin/develop` coincide con `develop` antes del commit de Reportes; `origin/main` es ancestro de `develop` (15 commits detrás).
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades.
- Reglas: 45/45 pruebas en emulador aislado `demo-kronos-training`, sin afectar el emulador QA existente.
- App: 149/149 pruebas TypeScript; ESLint de Reportes sin hallazgos.
- Functions: 228/228 pruebas. Functions quedan fuera del deploy.
- La nueva regla `reports` valida booleanos pero no concede lecturas de negocio; las pruebas niegan atletas, visitas, pagos, ventas, inventario y empleados a un perfil que sólo tiene `reports`.
- `.env.local` está ignorado por Git; su proyecto coincide con `.firebaserc` y no activa el modo emulador.
- Typecheck y build finales de app y Functions: correctos; el build de app transformó 1230 módulos. Functions quedan fuera del deploy.

## Rollback preparado

- Último código de aplicación conocido desplegado: `d666522` (reporte de control administrativo, 2026-09-24). Canal `live` observado con último release el 2026-09-24 22:32:03.
- Si el acceso, las cifras o la consola de Reportes fallan, recompilar y redesplegar Hosting desde `d666522` con el entorno local de producción; restaurar las reglas de ese mismo commit si la validación de permisos falla. No hay migración que revertir.
- No forzar ni reescribir ramas remotas como mecanismo de rollback. Registrar el incidente y verificar nuevamente la URL pública y los flujos críticos después de restaurar.
- Disparadores: errores JS nuevos persistentes, usuarios autorizados sin acceso, usuarios sin permiso con acceso, cifras que contradigan filas auditables o errores de lectura generalizados.

## Comprobación posterior

1. Confirmar release de Hosting y publicación de reglas con Firebase CLI.
2. Abrir la URL pública por HTTPS, confirmar carga y ausencia de errores de consola/red.
3. Con sesión Admin iniciada manualmente por el usuario, recorrer Reportes → gráfico → KPI → detalle; no automatizar credenciales ni escribir datos reales.
4. Comprobar acceso denegado a perfiles no autorizados si existe una sesión QA apropiada; no cambiar permisos productivos para probar.
5. Integrar `develop` en `main` por avance rápido sólo tras el smoke productivo.

## Resultado

- `npx firebase deploy --only database --project kronos-training-fd5e5`: sintaxis válida y reglas liberadas correctamente.
- `npx firebase deploy --only hosting --project kronos-training-fd5e5`: 107 archivos en `dist`, versión finalizada y release completo.
- `https://kronos-training-fd5e5.web.app/reportes`: HTTP 200 sobre HTTPS; HSTS presente. El HTML público referencia `/assets/index-BvUSzIuZ.js`, idéntico al build local, y ese recurso responde HTTP 200.
- Pendiente: smoke autenticado por Admin con sesión manual del usuario; no se ejecutaron escrituras reales. `main` no se ha movido todavía.
- Observación preexistente: la ruta profunda `/reportes` devuelve `Cache-Control: max-age=3600`, aunque el recurso `/index.html` tiene cabecera `no-cache` en `firebase.json`. El bundle servido ahora es el nuevo; la política de caché de rewrites merece una spec separada si se desea corregirla.
