# Spec de fase: Reportes de Inventario y personal

Estado: implementada y verificada localmente el 2026-09-25; sin datos reales ni despliegue. Chrome cubrió los cuatro viewports; Playwright quedó bloqueado por su estado autenticado aislado inválido.
Módulo: `reports` / `reporting-contracts`.
Dependencias: `specs/SPEC-reporting-contracts.md` aprobada; contratos auditables de `inventory-reconciliation` y `workforce-payroll`; shell Fase 2 y reportes implementados en Fases 3–4.

## Objetivo

Ampliar Reportes con indicadores auditables de diferencias y resoluciones de inventario, así como trabajo devengado, pagado y pendiente, permitiendo navegar de cada KPI al registro fuente sin duplicar flujos de efectivo ni exponer datos de contacto o texto libre de empleados.

## Supuestos explícitos

1. Inventario y Personal permanecen Admin-only conforme a `reporting-access.ts`; el permiso general `reports` por sí solo no autoriza estas fuentes.
2. Inventario usa únicamente cierres finalizados y resoluciones inmutables. La diferencia pertenece a la fecha efectiva del cierre y cada resolución a su propia fecha de creación.
3. `found` recupera unidades; `covered` recupera dinero y aporta flujo de entrada; `written-off` reconoce pérdida sin crear egreso de caja; `corrected` permanece visible en el detalle auditable, pero no incrementa encontrados, cubiertos, fondo perdido ni flujo.
4. Personal usa snapshots de `WorkEntry` y `PayrollSettlement`; no requiere suscribirse al catálogo `Employee`.
5. El nombre snapshot del empleado es necesario para identificar filas operativas y puede mostrarse junto con su ID. Se excluyen teléfono, notas, motivos de corrección, referencia de liquidación, vínculo de usuario y actores de auditoría.
6. Se reutiliza el stack y la capa de reportes actual. No se agregan dependencias, reglas, esquema, escrituras ni agregados persistidos.
7. Playwright es complemento de la validación Chrome. No se reutilizarán ni inspeccionarán cookies, tokens o credenciales para sortear un contexto aislado sin sesión.

## Alcance propuesto

- Inventario: diferencia neta en unidades y valor, unidades encontradas, unidades/monto cubiertos y monto enviado a fondo perdido.
- Separación temporal explícita entre cierre y resolución: un cierre fuera del periodo puede aportar una resolución dentro del periodo sin volver a sumar la diferencia original.
- Detalle por cierre, ajuste, producto y resolución, con clase, unidades, monto, método permitido y fechas efectivas.
- Personal: trabajo devengado por fecha de trabajo, pagado por fecha efectiva de liquidación y pendiente acumulado al corte.
- Una liquidación válida distribuye pago sobre sus líneas una sola vez; el reporte de Personal no vuelve a contabilizar el egreso financiero enlazado.
- Drill-down desde KPI y resumen hasta tabla y registro fuente, conservando periodo, producto, empleado, estado y método aplicable.
- Filtros independientes por `productIds`, `employeeId`, `workStatus`, `inventoryResolutionKind` y método, sin colisionar con estados de Tienda, Atletas o mensualidades.
- Serialización restaurable en URL; los filtros de fases previas permanecen compatibles.
- Calidad `exact`, `partial` o `unavailable` cuando falten snapshots, vínculos o conciliación suficiente; nunca se inferirán montos o estados desde datos ambiguos.

## Fuera de alcance

- Crear, editar, finalizar o resolver cierres; registrar trabajo, aprobarlo o liquidarlo desde Reportes.
- Cambiar reglas de inventario, nómina, egresos, permisos, esquema Firebase o índices.
- Backfill, migraciones, escrituras reales, despliegue o agregados persistidos.
- Exponer catálogo/contacto de empleados, teléfono, notas, texto libre, referencias o actores de auditoría.
- Egresos, flujo financiero global, conciliación de caja y exportación, reservados a fases posteriores.
- Cambiar el significado histórico de resoluciones o liquidaciones ya persistidas.

## Criterios de aceptación

1. Diferencia en unidades/valor usa sólo cierres finalizados cuya fecha efectiva cae en el periodo y concilia con sus filas a $0.01.
2. Encontrado, cubierto y fondo perdido usan la fecha propia de la resolución. Una resolución dentro del periodo asociada a un cierre anterior aparece sin duplicar la diferencia del cierre.
3. `covered` suma unidades, recuperación monetaria y flujo de entrada por método; `written-off` no crea egreso; `found` no crea efectivo; `corrected` se identifica sin inflar esos KPI.
4. Producto y método filtran únicamente métricas a las que aplican y la interfaz explica cualquier KPI no afectado por el filtro.
5. Devengado usa fecha de trabajo; pagado usa `paidAt`; pendiente al corte incluye líneas no pagadas hasta `through` y no depende de que hayan sido creadas dentro de `from`.
6. Una línea incluida en una liquidación válida suma una vez a pagado y cero a pendiente. Liquidaciones rotas, parciales o con monto inconsistente se etiquetan parcial/no disponible y no se corrigen silenciosamente.
7. Suma del detalle coincide con cada KPI aplicable a $0.01; filtros de empleado, estado y método conservan el significado temporal de devengado, pagado y pendiente.
8. KPI → tabla → registro y retorno conservan filtros. Las filas de Personal permiten identificar empleado por nombre snapshot/ID y excluyen todos los campos sensibles enumerados.
9. Parámetros URL de Inventario y Personal restauran tras recarga sin colisionar con filtros de fases previas.
10. Pruebas de servicio demuestran que usuarios no Admin, incluso con permiso `reports`, no abren suscripciones de cierres, resoluciones, trabajo o liquidaciones.
11. Carga, error, vacío y calidad parcial son estados distintos y accesibles. Chrome valida el flujo protegido completo, consola, red, DOM, accesibilidad y responsive; Playwright aporta `320/768/1024/1440` cuando exista perfil QA autorizado.
12. Typecheck, build, lint focalizado y suites relevantes pasan. No hay cambios de reglas, esquema, datos reales ni despliegue.

## Datos, esquema y permisos

- Esquema persistido: sin cambios previstos.
- Reglas Firebase: sin cambios previstos; ambas fuentes continúan Admin-only.
- Inventario: proyectar sólo IDs de cierre/ajuste/producto/resolución, snapshot de nombre/costo, stock/conteo/variación, estado/finalización y resolución (`kind`, unidades, monto, método y fecha). Omitir notas, motivo, referencia, nombres/IDs de actor y campos libres.
- Personal: proyectar desde trabajo sólo ID, empleado-ID/nombre snapshot, fecha, tipo, monto y estado; desde liquidación sólo ID, empleado-ID/nombre snapshot, fecha de pago, método, monto y IDs de líneas. Omitir teléfono, notas, motivos, referencia, vínculo de usuario y actores.
- Toda consulta permanece de sólo lectura. El reporte no lee `employees` ni escribe en Firebase.

## Archivos probables

- `app/src/types/reporting.ts`
- `app/src/utils/reporting-periods.ts`
- `app/src/utils/reporting-inventory.ts`
- `app/src/utils/reporting-workforce.ts`
- `app/src/services/reporting.service.ts`
- `app/src/services/reporting.firebase.ts`
- `app/src/stores/reporting.ts`
- `app/src/components/kronos/reports/ReportFilters.vue`
- `app/src/components/kronos/reports/InventoryReport.vue` (nuevo)
- `app/src/components/kronos/reports/WorkforceReport.vue` (nuevo)
- `app/src/components/kronos/reports/ReportDetailTable.vue`
- `app/src/pages/reportes.vue`
- `app/tests/reporting-contracts.test.ts`, `reporting-service.test.ts`, `reporting-operational.test.ts`, `reporting-ui.test.ts`
- `app/e2e/responsive/reporting-responsive.spec.ts`

## Tareas ejecutables y orden

- RP10.1 — Proyecciones allowlisted, suscripciones y filtros/URL. Aceptación: fuentes sólo Admin, sin catálogo/contacto de empleados y parámetros de dominio sin colisiones. Verificación: TDD en contratos, servicio y periodos. Archivos: tipos, servicio Firebase/servicio, store y pruebas, divididos en rebanadas de máximo cinco archivos.
- RP10.2 — Reporte de Inventario. Aceptación: diferencias y resoluciones por sus fechas efectivas, KPI conciliados y semántica de efectivo inequívoca. Verificación: cierres consecutivos, resolución posterior, clases completas y pruebas UI; Chrome KPI→resolución.
- RP10.3 — Reporte de Personal. Aceptación: devengado/pagado/pendiente al corte sin duplicar liquidaciones ni exponer contacto/texto libre. Verificación: líneas pending/approved/paid, liquidación válida/inconsistente y pruebas UI; Chrome KPI→línea/liquidación.
- RP10.4 — Checkpoint integral. Aceptación: filtros/URL, estados de carga/error/vacío/parcial, negación no Admin y responsive. Verificación: typecheck, build, lint, suites reporting/finance, Chrome manual y Playwright cuando haya perfil autorizado.

Cada tarea queda sujeta a autorización de esta spec y se implementará incrementalmente con TDD. Cualquier cambio de fuente, métrica, permiso, esquema o estrategia de QA devuelve la spec a `propuesta`.

## Estrategia de pruebas

- Unitarias: cierres finalizados/borrador, 10→8→6, resolución parcial y posterior, `found`/`covered`/`written-off`/`corrected`, cortes de periodo, filtros y conciliación a centavos.
- Personal: estados pending/approved/paid, liquidación única, IDs faltantes, suma inconsistente, pago fuera/dentro del periodo y pendiente anterior a `from` pero vigente al corte.
- Servicios/permisos: Admin obtiene proyecciones allowlisted; no Admin con `reports` nunca abre fuentes Admin-only; serialización confirma ausencia de contacto y texto libre.
- UI: definición, unidad, calidad, filtros URL, KPI→detalle→registro y retorno; estados carga/error/vacío/parcial accesibles.
- Comandos desde `app/`: `node --require ./scripts/node-userinfo-preload.cjs --import tsx --test tests/reporting-contracts.test.ts tests/reporting-service.test.ts tests/reporting-operational.test.ts tests/reporting-ui.test.ts`; `npm run test:finance`; `npm run typecheck`; `npm run build`; `npx eslint <archivos focalizados>`.
- Chrome: sesión iniciada manualmente ya autorizada para esta validación visible; recorrer Inventario y Personal completos, revisar consola/red/DOM/árbol de accesibilidad y screenshots en `320/768/1024/1440`. No inspeccionar material de autenticación.
- Playwright complementario sólo con sesión QA autorizada en su propio contexto y estado local ignorado por Git; una redirección a login se registra como limitación, no se sortea.

## Riesgos y rollback

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sumar la diferencia original y resoluciones por la misma fecha | Alto | Fechas independientes, casos de resolución posterior y conciliación por fila |
| Tratar fondo perdido como egreso o encontrado como efectivo | Alto | Contrato de métricas explícito, etiquetas y pruebas de flujo |
| Duplicar pago de personal con el egreso enlazado | Alto | Personal contabiliza liquidación una vez; conciliación financiera queda en Fase 6 |
| Exponer contacto, notas, referencias o actores | Alto | No suscribir `employees`, proyecciones allowlisted y pruebas negativas serializadas |
| Liquidación inconsistente aparenta exactitud | Alto | Calidad parcial/no disponible y motivo visible sin recomputar silenciosamente |
| Volumen de cierres, resoluciones y trabajo en memoria | Medio | Reutilizar adaptador actual, medir carga; paginación/agregados persistidos fuera de alcance |
| Filtros de estado colisionan entre dominios | Medio | Campos y parámetros URL separados por dominio, pruebas round-trip |

Rollback: retirar suscripciones/proyecciones, filtros URL y componentes de Fase 5; mantener intactos contratos fuente, reglas, datos y UI de Fases 1–4. No requiere migración ni restauración de datos.

## Comandos y stack

Vue 3, TypeScript, Vuetify, Pinia, Firebase y Vite existentes; sin dependencias.
Dev: `npm run dev -- --host 127.0.0.1 --port 5173`.
Build: `npm run build`.
Tests/lint: los comandos focalizados anteriores.

## Preguntas abiertas

Ninguna para revisar el alcance propuesto. Las atribuciones temporales, privacidad y semántica de efectivo descritas son las definiciones propuestas; cualquier ajuste requiere nueva revisión antes de implementar.
