# ADR-001: Playwright como complemento de QA responsive

## Status

Accepted — autorizado junto con `specs/SPEC-quality-gates.md` el 2026-08-26.

## Date

2026-08-26

## Context

Kronos es una aplicación web Vue/Vuetify con flujos protegidos y validación operativa en Chrome. La revisión manual en Chrome es necesaria para comprobar el runtime real, permisos, persistencia, consola, red y accesibilidad. Sin embargo, la revisión repetitiva de varios anchos de pantalla es costosa y puede omitir regresiones visuales.

## Decision

Agregar `@playwright/test` como dependencia de desarrollo, una vez autorizada la spec de gates de QA, para ejecutar pruebas locales o de QA aislado de responsive y regresión visual. La matriz inicial será de `320`, `768`, `1024` y `1440` px. Chrome seguirá siendo el gate final obligatorio y deberá recorrer el flujo completo afectado.

## Alternatives Considered

### Sólo validación manual en Chrome

- Ventaja: refleja directamente el navegador operativo.
- Desventaja: no ofrece una matriz repetible de viewports ni una señal automatizada de overflow/regresión visual.
- Rechazo: se conserva como gate final, pero no cubre por sí solo la repetibilidad deseada.

### Playwright como sustituto de Chrome

- Ventaja: automatización amplia y repetible.
- Desventaja: no reemplaza la revisión manual autorizada, la comprobación del perfil Chrome ni el recorrido operativo de producción/QA.
- Rechazo: contradice el requisito de validar siempre en Chrome y aumenta el riesgo de confiar en emulación.

### Cypress u otra herramienta E2E

- Ventaja: también permite automatización de browser.
- Desventaja: introduce una alternativa adicional cuando Playwright cubre proyectos, viewports, web server y capturas visuales.
- Rechazo: duplicaría tooling sin una necesidad actual del proyecto.

## Consequences

- Se agrega una dependencia y una política de instalación de navegador que deben revisarse en auditorías.
- Las pruebas deben ejecutarse contra localhost o QA aislado, nunca contra producción por defecto.
- No se versionarán credenciales, tokens, cookies ni `storageState`.
- Los flujos protegidos requieren un mecanismo de prueba aislado; el login real seguirá siendo manual en Chrome.
- Habrá dos evidencias complementarias: Playwright para responsive repetible y Chrome para el flujo runtime completo.
