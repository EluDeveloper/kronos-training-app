# Kronos Training — reglas de trabajo del agente

## Alcance

La aplicación vigente vive en `app/`. El directorio `AppKronos/` contiene la aplicación HTML histórica y documentación de contexto; no debe utilizarse como destino de cambios de la aplicación Vue sin autorización explícita.

## Flujo obligatorio

Para cualquier cambio que afecte más de un archivo o pueda tardar más de 30 minutos:

1. Revisar `specs/CAPABILITY-MAP.md` y el `SPEC-*.md` correspondiente.
2. Presentar al usuario las specs nuevas o modificadas para revisión y autorización explícita antes de implementar la fase.
3. Actualizar la spec después de recibir la autorización y antes de cambiar el comportamiento.
4. Ejecutar la tarea indicada en `tasks/todo.md`.
5. Implementar en una rebanada pequeña y verificable.
6. Ejecutar las pruebas y verificaciones del repositorio.
7. Validar en Chrome cualquier cambio que afecte la aplicación web.
8. Entregar el reporte de impacto usando `Docs/implementation-reports/README.md`.

No se debe implementar una funcionalidad ambigua sin criterios de aceptación escritos.

### Regla global de autorización por fase

- Cada fase funcional debe tener una spec identificable, con estado `propuesta`, antes de iniciar su implementación.
- El agente debe mostrar al usuario el objetivo, alcance, criterios de aceptación, riesgos y archivos probables de la spec.
- El agente no debe instalar dependencias, modificar comportamiento ni iniciar una fase propuesta hasta que el usuario autorice esa spec.
- Si una decisión cambia el alcance, los datos, los permisos o la estrategia de verificación, la spec vuelve a `propuesta` y requiere nueva autorización.

## Skills

Activar sólo el skill que corresponda al trabajo actual:

- `spec-driven-development`: nueva funcionalidad, cambio significativo o requisito ambiguo.
- `planning-and-task-breakdown`: spec aprobada que necesita tareas ejecutables.
- `incremental-implementation`: cambios que afectan varios archivos.
- `test-driven-development`: lógica nueva, bugs o cambios de comportamiento.
- `frontend-ui-engineering`: componentes, estilos, responsive, accesibilidad y estados de interfaz.
- `browser-testing-with-devtools`: validación runtime en Chrome de la aplicación.
- `code-review-and-quality`: revisión previa a integrar o publicar.

Playwright Test es una herramienta de QA complementaria, no una skill: se usará para responsive, viewports y regresiones visuales; nunca sustituye la validación en Chrome.

No instalar ni duplicar skills automáticamente si ya existe una versión disponible en el entorno. Si se instala una fuente externa, documentar la versión y la fuente.

La fuente de skills de este repositorio es `addyosmani/agent-skills`. La instalación se hizo con `skills@1.5.18`; `skills-lock.json` conserva los hashes y es la referencia para actualizaciones futuras. No actualizar skills automáticamente durante una tarea de aplicación.

## Límites

### Siempre

- Mantener Vue 3, TypeScript, Vuetify, Pinia, Firebase y Vite salvo aprobación explícita.
- Usar `app/` como directorio de trabajo de la aplicación.
- Mantener los secretos fuera de Git.
- Ejecutar typecheck, build y las pruebas relevantes antes de cerrar una implementación.
- Actualizar spec y tareas cuando cambien las decisiones o el alcance.
- Validar en Chrome el flujo completo afectado, desde su entrada hasta su resultado final, cuando se modifique cualquier segmento de ese flujo.
- Usar Playwright sólo como complemento para pruebas repetibles de responsive y regresión visual en un entorno seguro y no productivo.

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

## Gate global de QA web

- Chrome es obligatorio para todo cambio que afecte la aplicación web. La validación debe cubrir el flujo completo afectado, aunque el cambio sólo esté en un segmento; no es necesario recorrer módulos no relacionados.
- La validación de Chrome debe revisar, según aplique, resultado funcional, consola, red, DOM, accesibilidad, responsive y evidencia visual.
- Playwright se usará como complemento para ejecutar la matriz repetible de viewports `320`, `768`, `1024` y `1440` px, y para capturas/regresiones visuales cuando estén aprobadas en la spec.
- Playwright no sustituye a `frontend-ui-engineering` durante el diseño ni a Chrome para la comprobación runtime final. Tampoco autoriza automatizar credenciales, leer tokens/cookies ni escribir datos reales.
- Los flujos protegidos requieren sesión iniciada manualmente por el usuario en Chrome. Las pruebas Playwright autenticadas deberán usar un entorno/dataset de QA aislado y un estado local no versionado; nunca credenciales o secretos en Git.
- Si se toca un segmento de un flujo, el reporte debe demostrar el recorrido completo afectado y declarar los flujos no ejecutados por quedar fuera de alcance.

## Definition of Done

Una tarea sólo está terminada cuando:

- los criterios de aceptación de la spec se cumplen;
- las pruebas y verificaciones pasan, o las fallas previas quedan documentadas;
- los cambios de aplicación fueron revisados en Chrome;
- no hay errores o warnings nuevos en consola;
- el flujo completo afectado fue validado en Chrome, no sólo el componente modificado;
- el reporte final incluye árbol de archivos, flujos afectados, diagrama y riesgos pendientes.
