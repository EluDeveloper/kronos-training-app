# Capability Map: Kronos Training

Estado: borrador para revisión humana.

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

## Preguntas abiertas

- ¿El primer piloto debe ser alta de atleta o registro de pago?
- ¿Qué cuenta y datos de prueba se utilizarán en Chrome?
- ¿Qué métricas de UX se convertirán en objetivos cuantitativos?
- ¿Se instalarán skills sólo por proyecto, globalmente o mediante el plugin de Codex?
