# Spec de fase: resumen ejecutivo y Tienda

Estado: aprobada por el usuario el 2026-09-25; implementación local autorizada.
Módulo: `reports` / `reporting-contracts`.
Dependencias: `specs/SPEC-reporting-contracts.md`, `specs/SPEC-reporting-phase-2-access-shell.md` y Checkpoint R2.

## Objetivo

Entregar el primer nivel funcional de Reportes: indicadores ejecutivos con definiciones y calidad de dato visibles, y un reporte de Tienda que permita pasar de KPI/gráfica a tabla y registros auditables preservando los filtros.

## Alcance

- Resumen ejecutivo y vista de Tienda, usando exclusivamente las proyecciones puras y adaptadores canónicos existentes.
- Indicadores de tienda: unidades/artículos vendidos, venta reconocida, costo histórico, utilidad y margen bruto, cobrado, recuperado, saldo pendiente y cancelaciones.
- Selector de ninguno/uno/varios/todos los productos; vacío incluye toda la tienda.
- Filtros globales de periodo, productos, atleta, estado y método de pago restaurables en URL. Un filtro que no aplique a un indicador no debe alterar su semántica.
- Comparación anterior/interanual sólo cuando exista cobertura suficiente y fechas comparables; de lo contrario, etiquetar histórico parcial/no disponible.
- Drill-down de resumen → Tienda → indicador → partidas/ventas/pagos permitidos, conservando filtros y atribuciones.
- Distinguir venta reconocida, cobro efectivo, recuperación de saldo, cuentas por cobrar, costo y utilidad bruta; señalar asignación proporcional de cobros multi-producto.
- Sólo lectura. Sin cambios de esquema, reglas, permisos, dependencias, agregados persistidos, escrituras, migraciones o despliegue.

## Criterios de aceptación

1. Cada KPI declara definición, periodo, unidad y calidad del dato.
2. El detalle suma al KPI correspondiente con tolerancia máxima de $0.01.
3. Venta reconocida, cobro, recuperación, pendiente, costo y utilidad no se usan como sinónimos; utilidad se presenta como utilidad bruta.
4. Cero, uno, varios y todos los productos producen consolidaciones correctas; cobros compartidos se etiquetan como asignación proporcional.
5. Cancelaciones/reversiones siguen los contratos existentes y no duplican cobros, ventas ni saldos.
6. Cada KPI/gráfica navega a su dominio y detalle preservando filtros en URL; volver restaura contexto.
7. Sin cobertura histórica suficiente no se fabrican comparaciones ni transacciones; aparece `Histórico parcial` o `No disponible`.
8. El detalle no expone salud, admisión, teléfono, secretos ni datos fuera de los contratos aprobados.
9. Carga, vacío, error y fuentes no disponibles tienen estados accesibles y distinguibles.
10. Pruebas enfocadas, regresión financiera, typecheck, build y lint focalizado pasan; Chrome verifica el flujo completo en dataset QA no productivo. Playwright complementa a 320/768/1024/1440 px.
11. Sin cambios de esquema/reglas/permisos, escrituras a Firebase, migraciones de datos reales ni despliegues.

## Archivos probables

- `app/src/pages/reportes.vue`
- `app/src/components/kronos/reports/ReportFilters.vue`
- `app/src/components/kronos/reports/ReportKpiCard.vue`
- `app/src/components/kronos/reports/ExecutiveOverview.vue`
- `app/src/components/kronos/reports/StoreReport.vue`
- `app/src/components/kronos/reports/ReportChart.vue`
- `app/src/components/kronos/reports/ReportDetailTable.vue`
- `app/tests/reporting-ui.test.ts`
- `app/e2e/responsive/reporting-responsive.spec.ts`

## Esquema, reglas y permisos

No se prevén cambios. El acceso se limita por los permisos/suscripciones de la Fase 2. Todo dato mostrado se deriva de contratos auditables ya implementados.

## Pruebas y validación Chrome

- RED/GREEN para render, filtros, definiciones, navegación, URL y suma KPI/detalle; casos con crédito, reverso, cancelación y asignación multi-producto.
- Ejecutar suites `reporting-*`, `npm run test:finance`, `npm run typecheck`, `npm run build` y lint focalizado.
- Chrome con sesión QA iniciada manualmente: resumen → KPI tienda → tabla → registro → volver; revisar DOM, consola, red, accesibilidad y evidencia visual. No inspeccionar credenciales/tokens/cookies ni escribir datos reales.
- Playwright complementario en 320, 768, 1024 y 1440 px sobre fixture/local seguro.
- Para QA autenticado, capturar el estado local de Playwright con IndexedDB de Firebase incluido; guardarlo sólo en `app/.playwright/auth/user.json` (ignorado por Git), nunca leerlo, mostrarlo o versionarlo. La sesión se obtiene con login manual del usuario y contra localhost/emuladores.

## Decisiones de implementación dentro del alcance aprobado

- Tienda sólo se carga para Admin, de acuerdo con los permisos y suscripciones aprobados en Fase 2.
- Como las fuentes auditables no ofrecen límite de cobertura histórica, las comparaciones se muestran como no disponibles; no se infiere que un periodo anterior sin filas sea cero.
- Si alguna partida carece de costo unitario histórico, costo/utilidad/margen se marcan parciales o no disponibles, sin reconstruirlos desde el costo actual del producto.
- Cobrado representa pagos aplicados, no flujo de caja; no se netean devoluciones sin movimiento auditable.
- Ventas canceladas se atribuyen por la fecha efectiva de cancelación; cobros se atribuyen por la fecha del movimiento.
- Chrome usa la instancia local autenticada manualmente. Al estar el dataset vacío, el drilldown con filas usa una fixture de QA sintética, habilitada sólo en DEV para Admin y con `qaFixture=store`; reemplaza temporalmente el estado de la tienda en memoria tras desconectar su suscripción, no escribe ni consulta transacciones reales y muestra un aviso visible. Al salir de esa URL se vuelve al flujo canónico.
- La fixture contiene únicamente campos allowlisted de reporte y datos inventados; no incluye PII ni modifica contratos de dominio. Playwright debe apuntar a la instancia local ya iniciada para no cargar configuración ambiental externa/productiva.

## Riesgos

- Confundir venta/cobro/cartera/utilidad: contrato semántico visible y pruebas de conciliación.
- Atribuir un pago parcial a productos sin evidencia: etiquetar proporcional y mostrar la política determinista.
- Comparar periodos con cobertura desigual: fail-closed con calidad parcial/no disponible.
- UI navegable pero sin historial local para comprobar datos: usar fixtures aislados, no sembrar datos reales.
- Regresión de acceso: no cambiar reglas ni permisos en esta fase.

## Rollback

Retirar los componentes/UI/pruebas de Fase 3 dejando intactos contratos de dominio, servicio canónico, reglas y datos. No requiere restaurar esquema ni ejecutar migración.
