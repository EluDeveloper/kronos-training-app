# Reportes de implementación

Cada implementación de aplicación debe terminar con un reporte de impacto en la respuesta del agente. Para cambios medianos o grandes, también puede guardarse una copia en esta carpeta.

## Plantilla

````markdown
# Implementation Report: [nombre]

## Estado
- Spec: ✅/⚠️
- Tests: ✅/⚠️
- Typecheck: ✅/⚠️
- Build: ✅/⚠️
- Chrome QA: ✅/⚠️/No aplica
- Flujo completo afectado en Chrome: ✅/⚠️/No aplica
- Playwright responsive: ✅/⚠️/No aplica
- Login manual requerido: Sí/No

## Árbol de archivos modificados
```text
...
```

## Flujos afectados
- ...

## Recorrido completo validado
- Entrada del flujo: ...
- Resultado final: ...
- Segmento modificado y pasos de integración comprobados: ...

## Flujos no afectados
- ...

## Diagrama
```mermaid
flowchart TD
    A["..." ] --> B["..."]
```

## Evidencia
- Comandos ejecutados:
- Resultado de pruebas:
- Viewports revisados:
- Errores o warnings observados:
- Evidencia Playwright/Chrome:

## Riesgos y pendientes
- ...
````
