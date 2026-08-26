# Spec: Gates de QA web y responsive

Estado: aprobada para implementación incremental el 2026-08-26.
Módulo: `experience-quality`.
Capability map: `specs/CAPABILITY-MAP.md`.

## Objective

Establecer un gate de calidad repetible para cualquier cambio de la aplicación web. Chrome será la validación runtime obligatoria del flujo completo afectado; Playwright será un complemento automatizado para responsive y regresiones visuales. La regla debe aplicar a futuras fases y no sólo al formulario de atletas.

## Alcance

- Cambios de UI, interacción, navegación, validación, estilos, responsive, accesibilidad o estado de una página.
- Cambios a un segmento de un flujo: la evidencia debe recorrer el flujo completo afectado desde su entrada hasta su resultado final.
- Cambios puramente documentales, de dependencias sin efecto en runtime y tooling no web: se documenta por qué Chrome no aplica.

## Decisión propuesta

1. `frontend-ui-engineering` guía diseño, accesibilidad, estados y responsive durante la implementación.
2. Chrome DevTools MCP valida el runtime final en un perfil de pruebas, con login manual cuando el flujo lo requiera.
3. Playwright Test se agregará como dependencia de desarrollo para ejecutar pruebas repetibles en un entorno local o de QA aislado.
4. La matriz inicial de responsive será `320`, `768`, `1024` y `1440` px. Las capturas visuales se revisarán sólo para los viewports y flujos definidos por la spec.
5. La validación en Chrome prevalece ante cualquier diferencia entre la emulación de Playwright y el navegador de uso operativo.

## User Stories

- Como responsable del producto, quiero que cada cambio web tenga evidencia del flujo completo afectado para detectar regresiones de integración.
- Como responsable de UX, quiero una verificación repetible en varios viewports para detectar overflow, contenido cortado y controles inaccesibles.
- Como responsable de seguridad, quiero que ninguna prueba requiera compartir credenciales, inspeccionar tokens/cookies o escribir datos reales.

## Commands proposed

Run from `app/` after authorization and installation:

```sh
npx playwright install chromium
npx playwright test --project=responsive
npx playwright test --project=responsive --headed
```

The exact npm scripts, Playwright version and browser installation policy will be recorded when the dependency is authorized and installed. `npm run typecheck`, `npm run build` and the relevant repository tests remain mandatory.

## Project Structure proposed

```text
app/playwright.config.ts              → configuración local, projects y matriz de viewports
app/e2e/                              → pruebas de flujo web de alto valor
app/e2e/responsive/                   → smoke y regresiones de layout por viewport
app/e2e/fixtures/                     → datos/fixtures no sensibles de QA
app/test-results/                     → salida local ignorada por Git
Docs/implementation-reports/         → evidencia, árbol, flujos y diagramas
```

No se versionará ningún `storageState` que contenga sesión, token o cookie.

## Testing Strategy

### Gate obligatorio en Chrome

- Abrir la entrada real del flujo afectado.
- Si es protegido, detenerse antes del login y solicitar al usuario que inicie sesión manualmente.
- Ejecutar el recorrido completo: entrada, interacción modificada, validaciones/estados, persistencia o resultado final y salida segura.
- Revisar consola y red; inspeccionar DOM/árbol de accesibilidad cuando el cambio lo requiera; capturar evidencia visual.
- Si el cambio sólo afecta un segmento, no recorrer toda la aplicación, pero sí todos los pasos del flujo afectado.
- No usar datos de producción para pruebas destructivas; cuando el flujo necesite escritura, usar un registro demo autorizado y eliminarlo al terminar.

### Complemento Playwright

- Ejecutar pruebas contra localhost o un entorno de QA aislado, nunca contra producción por defecto.
- Validar los viewports `320`, `768`, `1024` y `1440` px.
- Comprobar ausencia de overflow horizontal, controles visibles, acciones alcanzables y contenido clave no truncado.
- Usar `toHaveScreenshot()` sólo con snapshots pequeños, revisables y ligados a una spec; no convertir toda la app en snapshots.
- Mantener pocos E2E de alto valor; la lógica pura continúa en pruebas unitarias y la integración en pruebas de servicio/reglas.
- Si el flujo está protegido, la spec debe definir un mecanismo de QA aislado. No automatizar login con credenciales reales ni leer material de autenticación.

## Acceptance Criteria

- [ ] Toda spec de una fase web incluye una sección `QA web` con flujo completo afectado, viewports y evidencia esperada.
- [ ] Todo cambio de aplicación queda bloqueado hasta que Chrome valide el flujo completo afectado.
- [ ] Una modificación en un segmento no se considera verificada sólo por abrir ese componente de forma aislada.
- [ ] Playwright ejecuta la matriz responsive propuesta en un entorno no productivo y genera resultados reproducibles.
- [ ] Playwright no sustituye a Chrome, `frontend-ui-engineering`, las pruebas unitarias ni las pruebas de reglas.
- [ ] No se agregan credenciales, tokens, cookies, `storageState` ni datos reales al repositorio.
- [ ] El reporte final lista árbol de archivos, flujos afectados/no afectados, diagrama y evidencia de Chrome/Playwright o la razón de no aplicabilidad.

## Boundaries

### Always

- Actualizar la spec antes de cambiar comportamiento.
- Solicitar autorización explícita antes de implementar una fase propuesta.
- Ejecutar el flujo completo afectado en Chrome.
- Usar Playwright sólo para pruebas repetibles y seguras de responsive/regresión visual.

### Ask first

- Añadir o actualizar `@playwright/test` o cualquier dependencia.
- Instalar navegadores con `npx playwright install`.
- Crear un mecanismo de autenticación o `storageState` para pruebas protegidas.
- Ejecutar pruebas contra staging/producción o crear/eliminar datos en un entorno compartido.

### Never

- Sustituir la validación de Chrome por Playwright.
- Leer, imprimir o copiar credenciales, cookies, tokens o secretos.
- Automatizar un login real con credenciales del usuario.
- Usar producción como entorno predeterminado de pruebas Playwright.
- Declarar completado un cambio tras validar únicamente el componente modificado.

## Open Questions

- Resuelto: `@playwright/test` queda aprobado como dependencia de desarrollo de `app/`.
- Resuelto: Chromium empaquetado será el proyecto automatizado predeterminado; Chrome seguirá como gate runtime manual separado.
- Resuelto para Fase B: las pruebas Playwright protegidas usarán un estado autenticado creado manualmente, local y excluido de Git; no escribirán datos.
- Resuelto para Fase B: las capturas se limitarán al diálogo inicial, admisión y validación en los viewports definidos; cualquier actualización intencional se revisará en el diff.
