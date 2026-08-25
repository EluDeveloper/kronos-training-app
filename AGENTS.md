# Kronos Training — reglas de trabajo del agente

## Alcance

La aplicación vigente vive en `app/`. El directorio `AppKronos/` contiene la aplicación HTML histórica y documentación de contexto; no debe utilizarse como destino de cambios de la aplicación Vue sin autorización explícita.

## Flujo obligatorio

Para cualquier cambio que afecte más de un archivo o pueda tardar más de 30 minutos:

1. Revisar `specs/CAPABILITY-MAP.md` y el `SPEC-*.md` correspondiente.
2. Actualizar la spec antes de cambiar el comportamiento.
3. Ejecutar la tarea indicada en `tasks/todo.md`.
4. Implementar en una rebanada pequeña y verificable.
5. Ejecutar las pruebas y verificaciones del repositorio.
6. Validar en Chrome cualquier cambio que afecte la aplicación web.
7. Entregar el reporte de impacto usando `Docs/implementation-reports/README.md`.

No se debe implementar una funcionalidad ambigua sin criterios de aceptación escritos.

## Skills

Activar sólo el skill que corresponda al trabajo actual:

- `spec-driven-development`: nueva funcionalidad, cambio significativo o requisito ambiguo.
- `planning-and-task-breakdown`: spec aprobada que necesita tareas ejecutables.
- `incremental-implementation`: cambios que afectan varios archivos.
- `test-driven-development`: lógica nueva, bugs o cambios de comportamiento.
- `frontend-ui-engineering`: componentes, estilos, responsive, accesibilidad y estados de interfaz.
- `browser-testing-with-devtools`: validación runtime en Chrome de la aplicación.
- `code-review-and-quality`: revisión previa a integrar o publicar.

No instalar ni duplicar skills automáticamente si ya existe una versión disponible en el entorno. Si se instala una fuente externa, documentar la versión y la fuente.

La fuente de skills de este repositorio es `addyosmani/agent-skills`. La instalación se hizo con `skills@1.5.18`; `skills-lock.json` conserva los hashes y es la referencia para actualizaciones futuras. No actualizar skills automáticamente durante una tarea de aplicación.

## Límites

### Siempre

- Mantener Vue 3, TypeScript, Vuetify, Pinia, Firebase y Vite salvo aprobación explícita.
- Usar `app/` como directorio de trabajo de la aplicación.
- Mantener los secretos fuera de Git.
- Ejecutar typecheck, build y las pruebas relevantes antes de cerrar una implementación.
- Actualizar spec y tareas cuando cambien las decisiones o el alcance.

### Preguntar antes

- Cambiar reglas de Firebase, esquema de datos, autenticación o permisos.
- Añadir o actualizar dependencias.
- Cambiar configuración de CI, hosting o despliegue.
- Ejecutar migraciones, publicar en Firebase o modificar datos reales.
- Usar una sesión autenticada en Chrome.

### Nunca

- Solicitar, copiar o imprimir contraseñas, tokens, cookies o secretos.
- Usar reglas públicas de Firebase para facilitar una prueba.
- Ejecutar una migración real sobre datos de producción sin autorización explícita.
- Eliminar pruebas para ocultar un fallo.
- Modificar `AppKronos/kronos.html` como sustituto de la aplicación Vue.

## Gate de autenticación en Chrome

Para flujos protegidos, el agente debe detenerse antes del login y pedir al usuario:

> Inicia sesión manualmente en el perfil de Chrome de pruebas. No compartas tus credenciales. Cuando termines, confirma que puedo continuar.

El usuario inicia sesión y autoriza la continuación. El agente sólo valida el flujo visible y no inspecciona material de autenticación.

## Definition of Done

Una tarea sólo está terminada cuando:

- los criterios de aceptación de la spec se cumplen;
- las pruebas y verificaciones pasan, o las fallas previas quedan documentadas;
- los cambios de aplicación fueron revisados en Chrome;
- no hay errores o warnings nuevos en consola;
- el reporte final incluye árbol de archivos, flujos afectados, diagrama y riesgos pendientes.
