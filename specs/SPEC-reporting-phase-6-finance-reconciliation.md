# Spec de fase: Reportes de egresos, flujo y conciliación

Estado: implementada y verificada localmente el 2026-09-25; sin datos reales ni despliegue.
Módulo: `reports` / `reporting-contracts`.
Dependencias: `specs/SPEC-reporting-contracts.md` aprobada; contratos finales de correcciones de cobro, anticipos, conciliación de inventario y nómina; shell de Reportes y Fases 3–5 implementadas.

## Objetivo

Completar el dominio financiero de Reportes con una lectura Admin-only y auditable que presente, sin mezclar conceptos, el ingreso reconocido disponible, el cobro efectivo, la cartera, la utilidad bruta de Tienda, los egresos pagados, el flujo por cuenta/método y las diferencias registradas en cierres de caja y banco.

## Supuestos explícitos

1. Finanzas, egresos y cierres permanecen Admin-only conforme a `reporting-access.ts`; el permiso general `reports` no concede acceso a estas fuentes.
2. La fase es exclusivamente de consulta. Reutiliza `buildFinancialMovements`, los ajustes efectivos de cobro y los cierres persistidos; no crea, modifica ni elimina ventas, pagos, egresos, recuperaciones o cierres.
3. Sólo egresos con estado `paid` afectan el flujo. `pending` y `scheduled` pueden mostrarse como compromisos informativos separados, pero nunca restan efectivo ni se presentan como ya pagados.
4. `cash` pertenece a caja; `transfer` y `card` pertenecen a banco; `other` queda separado; `store-credit` es no monetario y no incrementa caja/banco.
5. Correcciones de método y reversos de Tienda usan el movimiento efectivo final. Un pago corregido o revertido no se conserva además como otro ingreso.
6. Una recuperación de inventario `covered` es entrada efectiva por su método; `found`, `written-off` y `corrected` no crean movimiento de caja. El egreso generado por una liquidación de personal se contabiliza únicamente desde `expenses`, no además desde `PayrollSettlement`.
7. La variación de cierre es `contado - esperado`. Se informa por caja, banco y total, pero no se suma a ingreso, egreso, utilidad ni flujo del periodo.
8. El ingreso reconocido, la cartera y la utilidad bruta se muestran mediante las métricas ya definidas en Tienda/Mensualidades. No se derivará una “utilidad neta” porque el modelo no garantiza que todos los costos y devengos estén completos.
9. Los filtros compartidos sólo afectan métricas a las que semánticamente aplican. Producto no altera mensualidades, visitas, egresos ni cierres; atleta no recorta egresos/cierres; método no altera ingreso reconocido, costo, utilidad bruta o cartera. La interfaz explica estas excepciones.
10. Las proyecciones excluyen texto libre y material sensible: descripción y recibo del egreso, notas del cierre, nombres/IDs de actores, teléfono y nombre de visitante. Se conservan únicamente identificadores y campos financieros necesarios para conciliar y navegar al módulo fuente.
11. Se reutiliza Vue 3, TypeScript, Vuetify, Pinia, Firebase y Vite. No se agregan dependencias, reglas, índices, agregados persistidos ni cambios de esquema.
12. Playwright complementa la validación Chrome y no reutiliza ni inspecciona cookies, tokens o credenciales de la sesión manual.

## Alcance propuesto

- Resumen semántico que mantenga separados:
  - ingreso reconocido, cobrado y cartera de Tienda/Mensualidades;
  - costo histórico y utilidad bruta de Tienda;
  - egresos pagados;
  - entradas, salidas y flujo neto por caja, banco, otro y no monetario;
  - diferencias de cierre de caja, banco y total.
- Detalle de movimientos efectivos por fecha, dirección, fuente, cuenta, método, importe e identificador fuente.
- Detalle de egresos por fecha, categoría/subcategoría, estado, método, importe y vínculos técnicos permitidos a liquidación/empleado, sin descripción, recibo o actor.
- Detalle de cierres por fecha y rango de movimientos, saldos iniciales, entradas/salidas, esperado, contado y variación por cuenta, sin notas ni actor.
- Drill-down KPI → tabla filtrada → módulo fuente (`/tienda`, `/pagos`, `/visitas`, `/egresos` o `/cierres`) y retorno a Reportes conservando periodo y filtros aplicables.
- Filtros restaurables por URL para método, cuenta financiera, categoría y estado de egreso, además de los filtros compartidos vigentes.
- Conciliación a $0.01 entre KPI y filas visibles; calidad `exact`, `partial-history` o `unavailable` cuando falte historia, vínculo o cobertura suficiente.
- Estados accesibles y distintos de carga, error por fuente, vacío, histórico parcial y sin permiso.

## Fuera de alcance

- Crear, editar, pagar, programar o eliminar egresos; abrir, guardar o corregir cierres desde Reportes.
- Modificar reglas Firebase, autenticación, permisos, esquema, índices o estructura persistida.
- Migrar/backfillear datos, escribir datos reales, desplegar o crear agregados backend.
- Exportación de reportes, reservada para Fase 7.
- Calcular utilidad neta, EBITDA, impuestos, cuentas contables o estados financieros formales.
- Inferir efectivo desde egresos pendientes/programados o tratar diferencias de cierre como ingreso/egreso.
- Mostrar descripción, recibo, notas, nombres de visitante o actores de auditoría.

## Criterios de aceptación

1. Las etiquetas y ayudas distinguen inequívocamente devengo/ingreso reconocido, cobro, cartera, costo, utilidad bruta, egreso pagado, flujo y variación; ninguna cifra incompleta se llama utilidad neta.
2. Venta reconocida, costo histórico, utilidad bruta y cartera reutilizan los contratos de Tienda/Mensualidades y concilian con sus reportes para el mismo periodo/filtros a $0.01.
3. El cobrado efectivo usa fecha de movimiento e incluye una sola vez mensualidades, visitas, pagos efectivos de Tienda y recuperaciones `covered`; `store-credit` no incrementa caja/banco.
4. Correcciones de método, reversos y cancelaciones producen sólo el movimiento efectivo vigente. Las pruebas demuestran que no hay cobro duplicado ni permanencia en la cuenta anterior.
5. Egresos pagados usan su fecha y método; pendientes/programados no reducen flujo. Un egreso de nómina enlazado se suma una vez desde `expenses`, aunque su liquidación exista en Personal.
6. Entradas menos salidas coincide con el flujo neto de cada cuenta y con el total monetario a $0.01. “Otro” y “no monetario” permanecen visibles y no se atribuyen a caja/banco.
7. Cada cierre muestra sus importes persistidos y la variación `contado - esperado`. La suma de variaciones del detalle coincide con el KPI, pero nunca altera flujo, ingreso, egreso o utilidad.
8. Los cierres baseline se identifican como tales; la UI no presenta sus saldos iniciales como movimientos del periodo ni reconstruye silenciosamente un cierre histórico.
9. Producto, atleta, método, cuenta, categoría y estado sólo afectan métricas compatibles. La UI indica las métricas no afectadas y la URL restaura los filtros sin colisiones con fases anteriores.
10. KPI → detalle → registro fuente y retorno conserva contexto. Si el registro fuente ya no existe o no es navegable, la fila permanece auditable y comunica la limitación sin enlace roto.
11. Las proyecciones serializadas de visitas, egresos y cierres no contienen teléfono, nombre de visitante, descripción, recibo, notas ni actores; usuarios no Admin no abren ninguna de esas suscripciones.
12. Carga, error, vacío, histórico parcial y sin permiso son estados distintos y accesibles. Chrome valida el flujo protegido completo, consola, red, DOM, accesibilidad y responsive; Playwright cubre `320`, `768`, `1024` y `1440` cuando su perfil QA esté autenticado.
13. `npm run test:finance`, suites reporting relevantes, typecheck, lint focalizado y build pasan. No hay cambios de reglas, esquema, datos reales ni despliegue.

## Datos, esquema y permisos

- Esquema persistido: sin cambios previstos.
- Reglas Firebase: sin cambios previstos; `expenses`, `cashClosures` y datos financieros permanecen Admin-only.
- Visitas pagadas: proyectar sólo ID de pago/visitante, periodo cubierto, monto, método y fecha efectiva. Omitir nombre, teléfono, referencias detalladas y actores.
- Egresos: proyectar sólo ID, fecha, categoría/subcategoría, monto, método, estado y, cuando existan, IDs de liquidación/empleado y periodo cubierto. Omitir descripción, recibo, `registeredBy` y nombres.
- Cierres: proyectar ID/fecha/rango, baseline, apertura, entradas, salidas, esperado, contado y variaciones por cuenta. Omitir notas y datos de quien cerró.
- Ventas, mensualidades y recuperaciones reutilizan las proyecciones allowlisted existentes; se preservan ajustes efectivos y se excluye texto libre.
- Toda consulta es de sólo lectura. El reporte no llama servicios de escritura ni modifica Firebase.

## Archivos probables

- `app/src/types/reporting.ts`
- `app/src/utils/reporting-finance.ts`
- `app/src/utils/financial-reports.ts`
- `app/src/utils/reporting-periods.ts`
- `app/src/services/reporting.service.ts`
- `app/src/services/reporting.firebase.ts`
- `app/src/stores/reporting.ts`
- `app/src/components/kronos/reports/ReportFilters.vue`
- `app/src/components/kronos/reports/FinanceReport.vue` (nuevo)
- `app/src/components/kronos/reports/ReconciliationReport.vue` (nuevo)
- `app/src/components/kronos/reports/ReportDetailTable.vue`
- `app/src/pages/reportes.vue`
- `app/tests/financial-reports.test.ts`, `reporting-finance.test.ts`, `reporting-service.test.ts`, `reporting-ui.test.ts`
- `app/e2e/responsive/reporting-responsive.spec.ts`

## Tareas ejecutables y orden

- RP11.1 — Contratos allowlisted, suscripciones y filtros/URL. Aceptación: fuentes financieras sólo Admin, sin campos sensibles, con estados de carga/error independientes y parámetros sin colisiones. Verificación: TDD en tipos, servicio, acceso y periodos.
- RP11.2 — Cálculo financiero puro. Aceptación: conceptos separados, movimientos efectivos únicos, egresos pagados, cuentas/métodos correctos y conciliación a centavos. Verificación: `test:finance` y casos de corrección, reverso, crédito de tienda, nómina e inventario.
- RP11.3 — UI de Finanzas y drill-down. Aceptación: KPI/definiciones, tabla de movimientos/egresos, navegación al origen y filtros conservados. Verificación: pruebas UI y Chrome de KPI → movimiento/egreso → origen → retorno.
- RP11.4 — UI de Conciliación y checkpoint. Aceptación: cierres/baseline, esperado/contado/variación sin alterar flujo; estados accesibles y responsive. Verificación: pruebas unitarias/UI, typecheck, lint, build, Chrome y Playwright autorizado.

Cada tarea queda sujeta a autorización explícita de esta spec y se implementará incrementalmente con TDD, en rebanadas pequeñas y verificables. Cualquier cambio de fuente, métrica, permiso, esquema, privacidad o estrategia de QA devuelve la spec a `propuesta`.

## Estrategia de pruebas

- Unitarias financieras: pago total/parcial, método corregido, reverso, cancelación, cambio entregado, `store-credit`, visita, mensualidad anticipada, recuperación `covered`, egreso paid/pending/scheduled y egreso de nómina enlazado.
- Conciliación: baseline, cierres consecutivos, caja/banco/otro, apertura, esperado, contado, variación positiva/negativa/cero, cierre fuera del periodo y suma a centavos.
- Servicios/permisos: Admin recibe proyecciones allowlisted; no Admin con `reports` no abre visitas pagadas, egresos o cierres; pruebas negativas confirman ausencia de campos excluidos.
- UI: significado/unidad/calidad, filtros URL, KPI → detalle → fuente → retorno, enlaces ausentes, carga/error/vacío/parcial/sin permiso y navegación por teclado.
- Comandos desde `app/`: `node --require ./scripts/node-userinfo-preload.cjs --import tsx --test tests/reporting-*.test.ts`; `npm run test:finance`; `npm run typecheck`; `npm run build`; `npx eslint <archivos focalizados>`.
- Chrome: con sesión manual autorizada, recorrer Finanzas y Conciliación completos; revisar resultado, consola, red, DOM, accesibilidad y evidencia visual en `320/768/1024/1440`. No inspeccionar material de autenticación.
- Playwright: complemento con sesión QA en su contexto aislado y estado local no versionado; una redirección a login se documenta y no se sortea.

## Resultado de implementación

- RP11.1–RP11.4 completadas con proyecciones allowlisted y fuentes financieras Admin-only.
- Finanzas separa ingreso reconocido, utilidad bruta, cartera, cobros, egresos pagados y flujo por cuenta; Conciliación mantiene la variación fuera del flujo.
- Las suites reporting/finanzas cerraron 56/56; typecheck, lint focalizado y build pasaron.
- Chrome, con login manual autorizado, recorrió Finanzas → egreso → módulo fuente → retorno, restauró filtros desde URL y validó `320`, `768`, `1024` y `1440` sin overflow. Consola sin errores o warnings nuevos y comprobación visible sin PII excluida.
- Playwright inició la matriz, pero su perfil aislado redirigió al login en los cuatro primeros casos (incluido Fase 6 a 320 px); se detuvo para no repetir el mismo bloqueo y no se reutilizó ni inspeccionó la sesión de Chrome.

## Riesgos y rollback

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Confundir ingreso reconocido, cobrado, flujo o utilidad | Alto | Bloques separados, diccionario visible y pruebas cruzadas con Tienda/Mensualidades |
| Duplicar pagos corregidos/revertidos o nómina | Alto | Reusar movimientos efectivos, fixtures de duplicidad y origen único del egreso |
| Tratar crédito de tienda o fondo perdido como efectivo | Alto | Cuenta `non-cash`, clases explícitas y pruebas negativas |
| Sumar variación de cierre al flujo | Alto | Modelo/UI separados y prueba de invariancia del flujo |
| Exponer descripción, recibo, notas, visitante o actor | Alto | Proyecciones allowlisted y aserciones negativas serializadas |
| Filtros globales recortan métricas incompatibles | Medio | Matriz de aplicabilidad visible y pruebas por métrica |
| Histórico incompleto aparenta exactitud | Medio | Calidad `partial-history`/`unavailable`, sin reconstrucción silenciosa |
| Volumen de movimientos en memoria | Medio | Reutilizar adaptador actual y medir carga; paginación/agregados quedan fuera de alcance |

Rollback: retirar las suscripciones/proyecciones financieras, filtros URL y componentes de Fase 6; mantener intactos contratos fuente, reglas, datos y UI de Fases 1–5. No requiere migración ni restauración de datos.

## Comandos y stack

Vue 3, TypeScript, Vuetify, Pinia, Firebase y Vite existentes; sin dependencias.
Dev: `npm run dev -- --host 127.0.0.1 --port 5173`.
Build: `npm run build`.
Tests/lint: los comandos focalizados anteriores.

## Preguntas abiertas

Ninguna para revisar el alcance propuesto. Las separaciones semánticas, exclusiones de privacidad y reglas de filtros descritas son las definiciones propuestas; cualquier ajuste requiere nueva revisión antes de implementar.
