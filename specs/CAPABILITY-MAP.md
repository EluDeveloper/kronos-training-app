# Capability Map: Kronos Training

Estado: aprobado el 2026-08-26.

## Objetivo de la iniciativa

Adoptar Spec-Driven Development para que los cambios de Kronos se definan, implementen y verifiquen mediante rebanadas pequeñas, con control explícito del impacto funcional y de la experiencia de usuario.

## Módulos

| ID estable | Responsabilidad | Dependencias |
|---|---|---|
| `foundation` | Tema Kronos, layout, navegación, autenticación, sesión y permisos | — |
| `athletes-payments` | Directorio de atletas, membresías, pagos y rendimiento relacionado | `foundation` |
| `store-inventory` | POS, productos, inventario, ventas, deudas y créditos | `foundation` |
| `operations` | Programación, visitas, comunidad y cierres operativos | `foundation`, `athletes-payments` |
| `reports` | Dashboard, métricas financieras y reportes anuales | `athletes-payments`, `store-inventory`, `operations` |
| `experience-quality` | Accesibilidad, responsive, estados de carga/error/vacío, consistencia visual y gates de QA web | todos los módulos de aplicación |

## Orden propuesto

```text
foundation
    ↓
athletes-payments ─────┐
                       ├──→ reports
store-inventory ───────┤
                       │
operations ─────────────┘
    ↓
experience-quality
```

El mapa debe ser aprobado antes de crear specs de módulos. Si la arquitectura vigente demuestra otros límites, actualizar este mapa primero.

## Regla transversal de calidad

`experience-quality` participa en cada fase que cambie una interfaz. Chrome valida el flujo completo afectado; Playwright aporta una matriz repetible de responsive y regresión visual. La validación del navegador se limita al flujo en alcance y no exige recorrer toda la aplicación.

## Primer piloto recomendado

Implementar una sola rebanada vertical de `athletes-payments`: alta o edición de atleta con validación, estados de carga/error/vacío, persistencia y validación runtime en Chrome. No incluye rediseñar todo el módulo ni cambiar el modelo de Firebase.

## Decisiones resueltas

- El primer piloto fue el flujo de alta y edición de atletas y ya quedó implementado y validado.
- Chrome usará autenticación manual del usuario y un atleta QA sintético, claramente identificable y persistente para futuras validaciones; no se inspeccionarán credenciales, cookies ni tokens.
- Por ahora no se fijan métricas UX numéricas adicionales. Cada spec definirá criterios funcionales, accesibilidad, consola limpia y la matriz responsive `320/768/1024/1440`; cualquier umbral de rendimiento requerirá una decisión posterior.
- Los skills reutilizables se prefieren globales y no deben duplicarse si ya están disponibles. La versión instalada en el repositorio permanece documentada en `skills-lock.json` y no se actualizará durante una tarea de aplicación.

## Authorization Gate

El usuario respondió las preguntas abiertas y autorizó este capability map el 2026-08-26. Cada fase conserva su propio gate de spec antes de implementar o cambiar comportamiento.
