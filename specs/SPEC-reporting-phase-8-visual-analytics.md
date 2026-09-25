# Spec de fase: Analítica visual de Reportes

Estado: implementada y verificada localmente el 2026-09-25; sin despliegue ni datos reales.
Módulo: `reports` / `experience-quality`.
Dependencias: `SPEC-reporting-contracts.md` aprobada; Fases 1–7 implementadas y verificadas localmente; gráfico de tendencia de Tienda existente.

## Objetivo

Añadir gráficos útiles a los dominios que hoy sólo presentan KPIs y tablas, para que un Admin detecte tendencias, diferencias y anomalías con rapidez sin alterar el significado financiero ni perder la trazabilidad del detalle auditable.

## Supuestos explícitos

1. Los gráficos son apoyo visual. KPIs y tablas continúan siendo la fuente numérica y auditable; ningún dato existirá únicamente dentro de un gráfico.
2. Se reutiliza `vue3-apexcharts`/ApexCharts ya instalado. No se añaden dependencias, consultas, fuentes, agregados persistidos ni cambios de esquema.
3. Cada serie deriva del mismo reporte puro y los mismos filtros URL que alimentan la UI actual; no recalcula con reglas paralelas.
4. No se mezclan unidades incompatibles en un mismo eje. Moneda, conteos, porcentajes y unidades físicas permanecen en gráficos separados.
5. Barras y líneas serán la base. No se usarán gráficos circulares, 3D, gauges decorativos ni dobles ejes ambiguos.
6. Agrupación temporal: día hasta 45 días, mes hasta 730 días y año para rangos mayores; zona `America/Mexico_City`.
7. La ausencia de histórico, costo o cobertura se muestra como parcial/no disponible; nunca se convierte un nulo en cero para completar una serie.
8. Cada gráfico incluye título, explicación breve, leyenda, resumen textual y tabla de datos expandible para teclado/lector de pantalla.
9. Colores provienen del tema, mantienen contraste y nunca son la única forma de distinguir series; cada serie conserva nombre y patrón/forma reconocible.
10. Los gráficos no escriben datos ni disparan navegación externa. Tooltips y selección visual no modifican filtros silenciosamente.

## Alcance propuesto

### Finanzas

- Gráfico temporal de entradas, egresos y flujo neto monetario.
- Selector local de cuenta `Total monetario`, `Caja`, `Banco` y `Otro`; `No monetario` permanece como serie separada y nunca se suma a caja/banco.
- Barras para entradas/egresos y línea para flujo neto; importes conciliados a $0.01 con movimientos visibles.

### Conciliación

- Barras divergentes por cierre con variación de caja y banco alrededor de una línea cero.
- Baselines identificados y excluidos de cualquier interpretación como movimiento.
- La suma de las barras coincide con los KPIs de variación, sin alterar flujo.

### Mensualidades

- Barras agrupadas por periodo: esperado, cobrado y saldo pendiente al corte.
- Métricas parciales/no disponibles conservan su etiqueta y no generan una barra falsa.

### Atletas

- Tendencia apilada de altas, pausas, bajas y reactivaciones por bucket temporal.
- El gráfico representa eventos del periodo, no el total actual de atletas ni una retención inferida.

### Inventario

- Barras por producto/cierre para diferencia valorizada, faltante cubierto y fondo perdido.
- Máximo de diez categorías visibles, ordenadas por magnitud absoluta; el resto se consolida como `Otros` sin perder el total.

### Personal

- Barras por bucket temporal para devengado, pagado y pendiente.
- Devengado usa fecha de trabajo, pagado fecha de liquidación y pendiente el saldo al corte; la ayuda visible explica que las series tienen atribuciones distintas.

### Patrón común

- Componente reusable de series, estados vacío/parcial/no disponible y tabla accesible.
- Formato monetario/porcentaje/conteo consistente con KPIs.
- Leyendas responsivas y etiquetas abreviadas sólo visualmente; el texto accesible conserva el valor completo.
- El gráfico de Tienda existente permanece funcional y no se refactoriza salvo ajustes indispensables de consistencia/accesibilidad.

## Fuera de alcance

- Añadir nuevos KPIs, predicciones, metas, presupuestos, cohortes inferidas o comparaciones históricas sin cobertura.
- Gráficos en tiempo real, edición desde el gráfico, drag-and-drop, zoom persistido o filtros nuevos.
- Exportar gráficos como imagen/PDF o añadirlos al CSV.
- Modificar permisos, Firebase, reglas, esquema, datos reales, CI, hosting o despliegue.
- Sustituir tablas, ocultar calidad del dato o representar utilidad neta.

## Criterios de aceptación

1. Cada punto o barra coincide con su conjunto de filas fuente y los totales del gráfico concilian con su KPI compatible a $0.01.
2. Finanzas mantiene separados entrada, egreso, flujo, cuenta y no monetario; cambiar la cuenta local no modifica filtros globales ni devengo/cartera.
3. Conciliación representa valores positivos y negativos respecto de cero; baseline y variación nunca se suman al flujo.
4. Mensualidades distingue esperado, cobrado y pendiente; un valor desconocido se anuncia como no disponible y no aparece como cero.
5. Atletas grafica eventos, no estados actuales; cada tipo de transición se atribuye a su fecha efectiva.
6. Inventario limita categorías visuales sin alterar el total; `Otros` es determinista y permite consultar las filas completas en la tabla existente.
7. Personal respeta las fechas de atribución de devengo/pago y no duplica liquidaciones o egresos.
8. Producto, atleta, empleado, estados, método, cuenta, categoría y periodo producen las mismas inclusiones/exclusiones que KPIs y tablas.
9. Cada gráfico tiene nombre accesible, resumen, leyenda textual, estado vacío/parcial/error y tabla expandible navegable por teclado.
10. En `320`, `768`, `1024` y `1440` px no existe overflow de página; leyenda, tooltip y tabla accesible permanecen utilizables.
11. Tema claro/oscuro conserva contraste y series distinguibles sin depender sólo del color.
12. Renderizar los nuevos gráficos no crea solicitudes de red adicionales, no escribe Firebase y no expone PII o texto libre excluido.
13. Pruebas puras cubren buckets, zonas, nulos, `Otros`, filtros y conciliación. Suites reporting/finanzas, typecheck, lint y build pasan.
14. Chrome recorre cada dominio gráfico → KPI → tabla auditable, revisa DOM/accesibilidad, consola, red y cuatro viewports. Playwright complementa cuando su perfil QA esté autenticado.

## Contrato propuesto

```ts
interface ReportingChartPoint {
  bucket: string
  label: string
  values: Record<string, number | null>
  quality: ReportingDataQuality
}

interface ReportingChartModel {
  title: string
  description: string
  unit: 'currency' | 'count' | 'percent'
  series: Array<{ key: string; label: string; kind: 'bar' | 'line' }>
  points: ReportingChartPoint[]
  state: 'ready' | 'empty' | 'partial' | 'unavailable'
}
```

Las funciones de dominio producen este modelo común. El componente visual recibe sólo el modelo allowlisted y no accede a stores, Firebase ni datos crudos.

## Archivos probables

- `app/src/utils/reporting-charts.ts` (nuevo)
- `app/src/components/kronos/reports/ReportSeriesChart.vue` (nuevo)
- `app/src/components/kronos/reports/AthletesReport.vue`
- `app/src/components/kronos/reports/MembershipsReport.vue`
- `app/src/components/kronos/reports/InventoryReport.vue`
- `app/src/components/kronos/reports/WorkforceReport.vue`
- `app/src/components/kronos/reports/FinanceReport.vue`
- `app/src/components/kronos/reports/ReconciliationReport.vue`
- `app/tests/reporting-charts.test.ts` (nuevo)
- `app/tests/reporting-ui.test.ts`
- `app/e2e/responsive/reporting-responsive.spec.ts`
- `Docs/implementation-reports/2026-09-25-reporting-phase-8-visual-analytics.md`
- `tasks/plan.md`, `tasks/todo.md` y esta spec

## Estrategia de implementación

- RP14.1 — Modelo común, buckets y pruebas de conciliación/nulos.
- RP14.2 — Componente visual accesible, estados y tabla alternativa.
- RP14.3 — Finanzas y Conciliación como primera rebanada de mayor valor.
- RP14.4 — Mensualidades y Atletas.
- RP14.5 — Inventario y Personal.
- RP14.6 — Regresión integral, Chrome, Playwright y reporte.

Cada rebanada se implementará con TDD y no tocará más de cinco archivos lógicos. Los gráficos se incorporarán de forma aditiva, manteniendo operativas las tablas y el gráfico de Tienda.

## Tech stack, estilo y comandos

- Vue 3, TypeScript, Vuetify, ApexCharts, Pinia y Vite existentes.
- Configuración de ApexCharts derivada del tema; sin colores hex aislados ni estilos inline arbitrarios.
- Cálculos puros en `reporting-charts.ts`; componentes de presentación sin acceso a servicios.
- Pruebas: `node --require ./scripts/node-userinfo-preload.cjs --import tsx --test tests/reporting-*.test.ts`; `npm run test:finance`; `npm run typecheck`; `npx eslint <archivos focalizados>`; `npm run build`; Playwright responsive focalizado.

## Límites

- Siempre: conciliar con tablas/KPIs, conservar calidad y unidad, ofrecer alternativa textual, validar tema y responsive.
- Preguntar antes: cambiar métricas, agrupación, permisos, fuentes, dependencias, esquema, datos reales o estrategia de exportación.
- Nunca: inventar puntos, mezclar unidades, ocultar nulos, depender sólo de color, exponer PII o presentar un gráfico como fuente contable.

## Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El gráfico contradice KPI o tabla | Alto | Una sola proyección pura y pruebas de suma por serie |
| Mezclar devengo, movimiento y saldo | Alto | Descripciones/atribuciones visibles y series separadas |
| Nulos se interpretan como cero | Alto | `null` explícito, huecos en serie y estado parcial/no disponible |
| Visualización inaccesible | Alto | Resumen, leyenda textual, tabla expandible y teclado |
| Exceso de gráficos reduce claridad | Medio | Un gráfico principal por dominio y jerarquía posterior a KPIs |
| Muchas categorías vuelven ilegible Inventario | Medio | Top 10 determinista + `Otros`; tabla conserva todo |
| Overflow o tooltips inutilizables en móvil | Medio | Leyenda responsiva, altura acotada y matriz de cuatro viewports |
| Costo de render sobre datasets grandes | Medio | Agregación pura previa y series acotadas por buckets/categorías |

Rollback: retirar el componente común, las proyecciones visuales y sus inserciones en cada sección. KPIs, tablas, filtros, exportación CSV, fuentes y datos permanecen intactos.

## Preguntas abiertas

Ninguna si se acepta un gráfico principal por dominio, la prioridad Finanzas/Conciliación → Mensualidades/Atletas → Inventario/Personal y las reglas de agrupación propuestas. Cambiar tipos de gráfico, unidades o interacción devuelve la spec a propuesta.

## Resultado de implementación

- Se añadieron seis modelos de gráficos derivados de reportes puros y un componente visual compartido con resumen, leyenda y tabla expandible.
- Inventario agrupa por producto y cierre, conserva `Otros` y muestra sólo moneda; Personal atribuye el saldo pendiente a la fecha del trabajo de origen, indicando que es saldo al corte.
- El histórico legado de atletas se marca parcial: el gráfico sólo representa transiciones con evento efectivo, mientras el KPI puede incluir altas reconstruidas por `createdAt`.
- Se conservaron filtros, KPIs, tablas y CSV. No se añadieron dependencias ni consultas.
- Verificación: 63 pruebas reporting, 5 financieras, typecheck, lint y build correctos; Chrome con fixtures QA y viewports 320/768/1024/1440 sin overflow ni mensajes nuevos de consola. Playwright autenticado no se ejecutó porque su perfil aislado no dispone de sesión manual.
