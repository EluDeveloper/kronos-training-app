# Implementation Plan: Adopción de SDD en Kronos

## Overview

Establecer un flujo de desarrollo basado en specs, tareas verificables, implementación incremental, pruebas y validación obligatoria en Chrome para cambios de la aplicación web.

## Architecture Decisions

- La aplicación vigente es `app/`; `AppKronos/` se conserva como referencia histórica.
- Las specs y tareas vivirán en la raíz del repositorio para que sobrevivan entre sesiones.
- `tasks/plan.md` contiene decisiones y riesgos; `tasks/todo.md` contiene el checklist ejecutable.
- La autenticación en Chrome será iniciada manualmente por el usuario en un perfil de pruebas.
- El navegador será un gate obligatorio para cambios de aplicación, no para cambios puramente documentales.
- Las skills externas no se duplicarán si ya existe una versión equivalente disponible.

## Task List

### Fase 0: Base del proceso

- [ ] Revisar y aprobar `specs/CAPABILITY-MAP.md`.
- [x] Confirmar la fuente/versionado de skills.
- [x] Configurar Chrome DevTools MCP para el primer cambio de interfaz.

### Fase 1: Primer piloto

- [x] Crear la spec del piloto elegido.
- [x] Descomponerla en tareas de tamaño S o M.
- [ ] Aprobar `specs/SPEC-athletes-payments.md`.
- [ ] Implementar validación determinista y pruebas enfocadas.
- [ ] Integrar errores por campo y estados de formulario.
- [ ] Mejorar estados de carga, error y resultados vacíos.
- [ ] Implementar una rebanada vertical.
- [ ] Añadir o actualizar pruebas de comportamiento.
- [ ] Ejecutar typecheck, build y pruebas relevantes.
- [ ] Validar el flujo en Chrome con autorización manual si requiere login.
- [ ] Entregar el reporte de impacto.

### Checkpoint: Primer piloto

- [ ] La spec está aprobada.
- [ ] Todos los criterios de aceptación pasan.
- [ ] La aplicación no tiene errores nuevos en consola.
- [ ] El usuario revisó el reporte de archivos y flujos afectados.

### Fase 2: Aplicación progresiva

- [ ] Extender SDD a los módulos en el orden del capability map.
- [ ] Ejecutar checkpoints cada 2 o 3 tareas.
- [ ] Revisar y simplificar el proceso después de tres rebanadas.

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Specs demasiado grandes | Alto | Capability map y tareas de máximo 5 archivos cuando sea posible |
| Duplicación de skills | Medio | Elegir una fuente de verdad y documentar versiones |
| Sesiones Chrome con datos sensibles | Alto | Perfil de pruebas, login manual y prohibición de leer tokens |
| Build afectado por permisos de `node_modules` | Medio | Resolver el entorno antes de atribuir fallos al cambio |
| Pruebas financieras o de reglas lentas | Alto | Ejecutar pruebas enfocadas por tarea y suite completa en checkpoints |

## Known Baseline Findings

- `npm run typecheck` pasa en `app/`.
- `npm run build` falla antes de estos cambios al intentar escribir en `app/node_modules/.vite-temp` con `EPERM`.
- `npm run test:finance` falla antes de estos cambios con `uv_os_get_passwd returned ENOMEM`.

## Open Questions

- Selección del primer piloto.
- Política definitiva para instalar `addyosmani/agent-skills`.
- Cuenta/perfil de Chrome de pruebas.
