# Task List: Adopción de SDD en Kronos

## Mantenimiento técnico

- [x] Declarar npm y `app/package-lock.json` como fuente autoritativa.
- [x] Corregir las vulnerabilidades alcanzables sin aplicar `npm audit fix --force`; producción queda en cero y el tooling conserva 5 moderadas documentadas.
- [x] Instalar/habilitar JDK 21 para el emulador de reglas.
- [x] Ejecutar `npm run test:rules` con Java 21 y documentar el resultado (26/26).

## Roadmap funcional aprobado para planificación

- [x] Revisar y autorizar `specs/SPEC-athlete-form-tabs.md` antes de implementar Fase B.
- [x] Revisar y autorizar `specs/SPEC-quality-gates.md` antes de integrar Playwright.
- [ ] Fase B: dividir el formulario de atleta en pestañas.
- [ ] Fase C: generar ficha de inscripción reutilizando el diseño de recibos.
- [ ] Fase D: cambiar el código de quiosco al formato determinista solicitado.
- [ ] Fase E: implementar notificaciones de pagos con WhatsApp Business.
- [ ] Fase F: evaluar notificaciones push como alternativa.

## Foundation

- [ ] Revisar y aprobar el capability map.
- [x] Elegir la fuente de verdad para las skills.
- [x] Configurar el flujo de QA con Chrome DevTools MCP.
- [x] Documentar como regla global la validación del flujo completo afectado en Chrome.
- [x] Documentar Playwright como complemento de responsive, no como sustituto de Chrome o `frontend-ui-engineering`.

## Pilot

- [x] Elegir el primer flujo vertical: alta y edición de atletas.
- [x] Crear `specs/SPEC-athletes-payments.md`.
- [x] Descomponer la spec en tareas ejecutables.
- [x] Aprobar la spec del piloto.
- [x] Confirmar el modelo de acceso y privacidad para datos de salud: nodo `athleteIntake` separado y permisos `athletesIntake`/`athletesIntakeManage` con mínimo privilegio.
- [x] Implementar el modelo backward-compatible y validación determinista.
- [x] Añadir pruebas enfocadas de contacto de emergencia y cuestionario de salud.
- [x] Integrar errores por campo y estados de formulario.
- [x] Integrar secciones accesibles y campos condicionales.
- [x] Mejorar estados de carga, error y resultados vacíos.
- [x] Implementar la primera tarea sin mezclar módulos.
- [x] Ejecutar pruebas de reglas con Java 21; typecheck, lint, build, pruebas enfocadas y QA Chrome de producción ya pasan.
- [x] Entregar el reporte de impacto.

## Checkpoint: Foundation

- [x] Las reglas del agente están documentadas.
- [ ] El mapa de capacidades está aprobado.
- [x] Los fallos previos del entorno están separados de los fallos nuevos.

## Checkpoint: Pilot

- [x] La rebanada funciona de extremo a extremo.
- [x] La spec coincide con el comportamiento implementado.
- [x] El reporte identifica archivos y flujos afectados.

## Checkpoint: Antes de Fase B

- [x] Las specs propuestas están disponibles para revisión.
- [x] El usuario autoriza `specs/SPEC-athlete-form-tabs.md`.
- [x] El usuario autoriza `specs/SPEC-quality-gates.md` y la dependencia `@playwright/test`.
- [x] Se define autenticación manual local y no versionada para pruebas Playwright protegidas; no se automatizan credenciales ni escrituras.

## Fase B: Formulario por pestañas

- [x] B1 — Integrar Playwright Test, Chromium, ignores y configuración responsive segura.
  - Aceptación: cuatro viewports configurados; producción no es el destino predeterminado; estado autenticado excluido de Git.
  - Verificación: `npx playwright test --project=responsive-public` y auditoría npm.
- [x] B2 — Probar y añadir el contrato de errores por pestaña.
  - Aceptación: conteos y primer error siguen el orden Personal → Membresía → Admisión.
  - Verificación: `npm run test:athlete-intake` con evidencia RED/GREEN.
- [x] B3 — Implementar tabs accesibles en alta/edición.
  - Aceptación: no se pierden datos, el primer tab inválido se activa/enfoca y permisos/carga se conservan.
  - Verificación: test enfocado, typecheck, lint y build.
- [ ] B4 — Ejecutar QA responsive y flujo completo afectado.
  - Aceptación: Playwright pasa a 320/768/1024/1440 y Chrome valida alta/edición completa sin errores nuevos.
  - Verificación: Playwright, Chrome DevTools y reporte de impacto.

## Checkpoint: Fase B

- [x] B1–B3 pasan pruebas automatizadas, typecheck y build.
- [ ] B4 completa Playwright y Chrome con login manual autorizado.
- [ ] Reporte, commits y push quedan sincronizados en `develop` y `main`.
