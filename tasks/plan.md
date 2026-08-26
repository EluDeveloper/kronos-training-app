# Implementation Plan: Adopción de SDD en Kronos

## Overview

Establecer un flujo de desarrollo basado en specs, tareas verificables, implementación incremental, pruebas y validación obligatoria en Chrome para cambios de la aplicación web.

## Plan vigente: mantenimiento técnico y evolución funcional

### Fase A: Dependencias y entorno de pruebas

1. Declarar npm como gestor autoritativo de `app/`, usando `app/package-lock.json`; conservar `app/pnpm-lock.yaml` sin actualizar hasta decidir su retiro explícito.
2. Aplicar sólo correcciones de auditoría no rompedoras y actualizar de forma controlada las herramientas de desarrollo que mantengan vulnerabilidades altas alcanzables.
3. Instalar o habilitar JDK 21, ejecutar `npm run test:rules` y registrar la evidencia sin modificar reglas ni datos reales.

**Criterios de aceptación:** no quedan vulnerabilidades altas alcanzables en producción; cualquier hallazgo dev-only tiene mitigación, responsable y fecha de revisión; el emulador de reglas ejecuta la suite con Java 21.

**Resultado 2026-08-26:** producción queda sin vulnerabilidades (`npm audit --omit=dev`); no quedan hallazgos críticos/altos. Persisten 5 moderados transitorios en `firebase-tools` de desarrollo; npm propone un downgrade rompedor a `14.23.0`, por lo que se difiere con revisión el 2026-09-26.

### Fase B: Formulario de atleta por pestañas

1. Actualizar la spec del formulario y dividirlo en pestañas: datos personales, membresía y admisión.
2. Mantener validación por campo, navegación por teclado, indicador de pestaña con errores y compatibilidad con edición/lectura por permisos.
3. Validar en Chrome los estados iniciales, errores, responsive y persistencia.

**Criterios de aceptación:** el diálogo reduce la altura visual, no pierde datos al cambiar de pestaña, permite llegar a cada error y conserva el contrato de admisión sensible.

### Fase C: Ficha de inscripción

1. Reutilizar el lenguaje visual de recibos para generar una ficha PDF con nombre, fecha de nacimiento, fecha de inscripción y fechas de pago.
2. Entregar primero vista previa/descarga y compartir manual por WhatsApp, sin enviar información sensible automáticamente.
3. Como segunda rebanada, evaluar WhatsApp Business Cloud API oficial para envío automatizado, con plantilla aprobada, consentimiento, secretos fuera de Git y auditoría de entregas.

**Criterios de aceptación:** la ficha no contiene datos de salud, se genera desde un contrato testeable, conserva el diseño Kronos de recibos y el usuario puede revisar antes de compartir.

### Fase D: Código de quiosco determinista

1. Definir y probar la fórmula: últimos 4 dígitos del teléfono + últimos 2 del año de nacimiento + día de nacimiento.
2. Validar que teléfono y fecha de nacimiento existan y que el resultado no exceda 8 dígitos antes de generar o reemplazar un código.
3. Mostrar alerta accionable y conservar el código existente si faltan datos; verificar compatibilidad con escaneo y compra.

**Criterios de aceptación:** `0634881` se produce para los datos del ejemplo, no se generan códigos incompletos y ningún atleta pierde un código por un intento inválido.

### Fase E: Notificaciones de pagos

1. Definir el contrato de adeudos de mensualidad y tienda, factura PDF, consentimiento, opt-out, idempotencia y reintentos.
2. Implementar primero el evento de pago aplicado y luego recordatorios programados; los envíos deben salir de una función/backend autorizado, no de secretos en el navegador.
3. Integrar WhatsApp Business Cloud API sólo después de confirmar credenciales, número remitente, plantillas y límites de Meta.

**Criterios de aceptación:** cada mensaje tiene destinatario y factura correctos, no se duplica ante reintentos, queda trazabilidad y los fallos no bloquean el registro del pago.

### Fase F: Alternativa push

Evaluar Firebase Cloud Messaging como canal opt-in para recordatorios y confirmaciones si WhatsApp no resulta viable. Debe incluir permiso explícito, revocación, asociación segura del dispositivo y una política para navegadores sin soporte.

## Architecture Decisions

- La aplicación vigente es `app/`; `AppKronos/` se conserva como referencia histórica.
- Las specs y tareas vivirán en la raíz del repositorio para que sobrevivan entre sesiones.
- `tasks/plan.md` contiene decisiones y riesgos; `tasks/todo.md` contiene el checklist ejecutable.
- La autenticación en Chrome será iniciada manualmente por el usuario en un perfil de pruebas.
- El navegador será un gate obligatorio para cambios de aplicación, no para cambios puramente documentales.
- Las skills externas no se duplicarán si ya existe una versión equivalente disponible.
- `app/` usa npm como gestor autoritativo y `app/package-lock.json` como lock de instalación; el `app/pnpm-lock.yaml` legado no se actualiza en esta fase.

## Task List

### Fase 0: Base del proceso

- [ ] Revisar y aprobar `specs/CAPABILITY-MAP.md`.
- [x] Confirmar la fuente/versionado de skills.
- [x] Configurar Chrome DevTools MCP para el primer cambio de interfaz.

### Fase 1: Primer piloto

- [x] Crear la spec del piloto elegido.
- [x] Descomponerla en tareas de tamaño S o M.
- [x] Aprobar `specs/SPEC-athletes-payments.md`.
- [x] Confirmar el modelo de acceso y privacidad para datos de salud: nodo `athleteIntake` separado y permisos `athletesIntake`/`athletesIntakeManage` con mínimo privilegio.
- [x] Implementar el modelo backward-compatible y validación determinista.
- [x] Añadir pruebas enfocadas de contacto de emergencia y cuestionario de salud.
- [x] Integrar errores por campo y estados de formulario.
- [x] Integrar secciones accesibles y campos condicionales.
- [x] Mejorar estados de carga, error y resultados vacíos.
- [x] Implementar una rebanada vertical.
- [x] Añadir o actualizar pruebas de comportamiento.
- [x] Ejecutar typecheck, build y pruebas relevantes; reglas pasan con Java 21 y la regresión de Iconify cubre la actualización ESM.
- [x] Validar el flujo en Chrome con autorización manual si requiere login.
- [x] Entregar el reporte de impacto.

### Checkpoint: Primer piloto

- [x] La spec está aprobada.
- [x] Todos los criterios de aceptación pasan.
- [x] La aplicación no tiene errores nuevos en consola.
- [x] El usuario revisó el reporte de archivos y flujos afectados.

### Fase 2: Aplicación progresiva

- [ ] Extender SDD a los módulos en el orden del capability map.
- [ ] Ejecutar checkpoints cada 2 o 3 tareas.
- [ ] Revisar y simplificar el proceso después de tres rebanadas.

### Fases funcionales priorizadas

- [ ] Fase B: formulario por pestañas.
- [ ] Fase C: ficha de inscripción y compartir por WhatsApp.
- [ ] Fase D: código de quiosco determinista.
- [ ] Fase E: WhatsApp Business para notificaciones de pago.
- [ ] Fase F: evaluación de notificaciones push.

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Specs demasiado grandes | Alto | Capability map y tareas de máximo 5 archivos cuando sea posible |
| Duplicación de skills | Medio | Elegir una fuente de verdad y documentar versiones |
| Sesiones Chrome con datos sensibles | Alto | Perfil de pruebas, login manual y prohibición de leer tokens |
| Build afectado por permisos de `node_modules` | Medio | Resolver el entorno antes de atribuir fallos al cambio |
| Pruebas financieras o de reglas lentas | Alto | Ejecutar pruebas enfocadas por tarea y suite completa en checkpoints |
| Vulnerabilidad sólo corregible con cambio mayor | Alto | No usar `npm audit fix --force`; actualizar por paquete, probar y documentar alcance |
| WhatsApp expone PII o requiere secretos en cliente | Alto | Backend/Cloud Function, plantillas aprobadas, consentimiento y auditoría |
| Push no soportado o revocado | Medio | Opt-in, fallback visible y estado de suscripción revocable |

## Known Baseline Findings

- `npm run typecheck` pasa en `app/`.
- `npm run build` falla antes de estos cambios al intentar escribir en `app/node_modules/.vite-temp` con `EPERM`.
- `npm run test:finance` falla antes de estos cambios con `uv_os_get_passwd returned ENOMEM`.

## Open Questions

- Selección del primer piloto.
- Política definitiva para instalar `addyosmani/agent-skills`.
- Cuenta/perfil de Chrome de pruebas.
- ¿Se autoriza retirar el `app/pnpm-lock.yaml` legado después de confirmar que npm será el único gestor de `app/`?
- ¿La ficha inicial se compartirá manualmente desde el navegador o se prioriza desde el inicio la API oficial de WhatsApp Business?
- ¿Qué cuenta/número de WhatsApp Business y política de consentimiento se usarán para recordatorios?
