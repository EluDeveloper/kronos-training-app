# Spec de fase: acceso y shell de Reportes

Estado: aprobada por el usuario el 2026-09-25.
Módulo: `reports` / `reporting-contracts`.
Dependencia: `specs/SPEC-reporting-contracts.md` (aprobada).

## Objetivo

Conectar Reportes con fuentes canónicas auditables bajo los permisos existentes, añadir el permiso independiente `reports` y entregar una página base accesible con filtros restaurables.

## Alcance autorizado

- `reports` permite entrar al módulo, pero por sí solo no concede lectura a ninguna colección de negocio.
- Cada fuente operativa sólo se suscribe si la persona conserva el permiso de su módulo fuente. Fuentes Admin-only (finanzas, cierres, inventario y personal) sólo se suscriben para Admin.
- El adaptador produce un dataset allowlisted sin datos de admisión, salud, teléfono, secretos o contacto del empleado.
- Ruta, navegación, carga/error/vacío y filtros restaurables en URL.
- Cambio local de reglas únicamente para reconocer `permissions/reports` como booleano; no se amplían expresiones `.read` de colecciones.

## Criterios de aceptación

1. Sin `reports` no se accede a `/reportes`; Admin conserva acceso.
2. `reports` sin permisos fuente no genera suscripciones a colecciones.
3. Cada fuente requiere el permiso fuente existente; las fuentes Admin-only nunca se suscriben para no Admin.
4. Las reglas validan `permissions/reports` como booleano sin conceder nuevas lecturas.
5. Filtros de período, productos, atleta, estado y método se restauran desde URL.
6. Carga, error, vacío y ausencia de fuentes permitidas son estados distintos y accesibles.
7. No hay escrituras a Firebase, migraciones, datos reales o despliegue.

## Archivos probables

`app/src/types/access.ts`, `app/database.rules.json`, `app/tests/database.rules.test.mjs`, `app/src/services/reporting.service.ts`, `app/src/stores/reporting.ts`, `app/src/plugins/router/routes.ts`, `app/src/pages/reportes.vue`, navegación y pruebas.

## Riesgos y rollback

Riesgo principal: confundir permiso de módulo con permiso de fuente. Mitigación: denegación por defecto y pruebas negativas. Rollback local: revertir permiso, regla de validación, adaptador y shell; no hay migración ni datos a restaurar.

## QA

Pruebas de permiso/adaptador/reglas, typecheck, lint focalizado y build. Chrome verifica acceso permitido/denegado y estados de página; las rutas protegidas requieren login manual del usuario. Playwright complementa la matriz 320/768/1024/1440 sin datos reales.
