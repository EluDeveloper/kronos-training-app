# Spec de fase: Reportes de Atletas y mensualidades

Estado: implementada y verificada localmente el 2026-09-25; sin datos reales ni despliegue.
Módulo: `reports` / `reporting-contracts`.
Dependencias: `specs/SPEC-reporting-contracts.md` aprobada; contratos auditables de `athlete-lifecycle-statuses` y `membership-advance-payments`; shell Fase 2 y base ejecutiva/Tienda Fase 3.

## Objetivo

Ampliar Reportes con indicadores ejecutivos y operativos de ciclo de vida de atletas y mensualidades, navegables hasta eventos y pagos auditables, respetando la fecha efectiva, el snapshot del periodo, la calidad histórica y los permisos vigentes.

## Supuestos explícitos

1. Los estados de atletas se calculan desde `lifecycleEvents`; para legado sin cobertura suficiente se muestra `Histórico parcial` o `No disponible`, nunca se reconstruyen transiciones.
2. Membresías y pagos son datos financieros y permanecen Admin-only como establece `reporting-access.ts`; no se ampliará acceso a usuarios con sólo `reports`.
3. Atletas conserva el acceso por permiso fuente existente; las proyecciones omiten nombre, teléfono, admisión, salud y notas personales.
4. Se reutiliza el stack y la capa de reporte actual. No se agregan dependencias ni persistencia de agregados.
5. Playwright es complemento de la validación Chrome. La limitación actual del contexto Playwright quedará registrada, no se sorteará cambiando reglas/permisos.

## Alcance propuesto

- Atletas al corte: activos, pausados y bajas; eventos del periodo: altas, pausas, bajas y reactivaciones.
- Evolución agregada por día, mes o año, usando fecha efectiva local `America/Mexico_City`; filtros por periodo y atleta.
- Crecimiento, retención o cohortes sólo cuando cobertura y ventanas observadas sean suficientes; de otro modo `No disponible` con explicación.
- Mensualidades: esperado, cobrado, vencido, adelantado y saldo pendiente.
- Abonos desde `installments`; obligaciones y vencimientos desde `totalAmount`/snapshot auditable. Separar fecha de movimiento, periodo de membresía y fecha de corte.
- Drill-down desde cada KPI o punto de tendencia hasta tabla y registro con atleta-ID, evento/periodo, fecha, estado, monto y método cuando corresponda.
- Filtros compartidos de periodo y atleta; filtro de estado específico de Atletas o de mensualidad, y método para mensualidades. Filtro de producto permanece aplicable sólo a Tienda.
- Serialización restaurable en URL; se preservan los filtros existentes de Tienda.

## Fuera de alcance

- Cambiar ciclo de vida, cobros, snapshots, vencimientos, recordatorios, Dashboard o reglas de negocio.
- Backfill/migración de historial, alterar registros reales, nuevos permisos o cambios de reglas.
- Exponer nombres, teléfono, admisión, salud, razón/notas de transición o contacto.
- Inventario, personal, egresos, conciliación y exportación, reservados a fases posteriores.

## Criterios de aceptación

1. Cifras de estado al corte respetan eventos efectivos; altas/pausas/bajas/reactivaciones se cuentan por su fecha efectiva y agrupan día/mes/año.
2. Un atleta legado sin eventos suficientes nunca aparece como historia exacta; su estado/eventos afectados se etiquetan parcial o no disponibles.
3. Crecimiento/retención/cohortes no se fabrican desde snapshots actuales; se habilitan sólo si los datos cubren cohortes y ventanas comparables.
4. Esperado usa monto congelado en snapshot/total respaldado; vencimiento usa fecha de snapshot. Datos legados sin total/fecha suficientes no se estiman.
5. Cobrado usa fecha efectiva de cada parcialidad; adelantado corresponde al abono anterior al vencimiento del periodo de membresía; vencido y pendiente se calculan al corte sin duplicar importes.
6. Suma de filas/detalle concilia con cada KPI aplicable a $0.01 y filtros de atleta, estado y método conservan el significado de la métrica.
7. Periodo, atleta, estados de dominio y método restauran desde URL sin colisionar entre estados de atleta y de mensualidad.
8. KPI/tendencia → tabla → registro y retorno conservan filtros; no se muestran datos sensibles enumerados en los límites.
9. Lecturas de atletas respetan permisos fuente actuales; membresías/pagos siguen Admin-only. Pruebas prueban que `reports` por sí solo no autoriza esas lecturas.
10. Carga, error, vacío y datos parciales son estados distintos y accesibles; Chrome valida el flujo protegido completo y anota consola, red, DOM, accesibilidad y responsive. Playwright aporta `320/768/1024/1440` cuando hay perfil QA autorizado; cualquier limitación se reporta literalmente.
11. Typecheck, build, lint focalizado y suites relevantes pasan. No hay migraciones, escrituras a Firebase ni despliegues.

## Datos, esquema y permisos

- Esquema persistido: sin cambios previstos.
- Reglas Firebase: sin cambios previstos. Membresías/pagos permanecen Admin-only conforme a Fase 2; fuentes de atletas conservan sus permisos actuales.
- Servicio: añadir una proyección allowlisted de `Payment` que retenga sólo atleta-ID, periodo, estado, total auditable, campos de snapshot necesarios e installments (`id`, importe aplicado, método y fecha efectiva). No proyectar concepto libre, nombre, teléfono, motivo/notas ni actor.
- Atleta: reutilizar proyección actual (`id`, estado, creación, marca de revisión y eventos mínimos); no ampliar su lectura con PII.
- Toda consulta permanece de sólo lectura. No migrar ni escribir datos reales.

## Archivos probables

- `app/src/types/reporting.ts`
- `app/src/utils/reporting-periods.ts`
- `app/src/utils/reporting-athletes.ts`
- `app/src/utils/reporting-memberships.ts`
- `app/src/services/reporting.service.ts`
- `app/src/services/reporting.firebase.ts`
- `app/src/stores/reporting.ts`
- `app/src/components/kronos/reports/ReportFilters.vue`
- `app/src/components/kronos/reports/AthletesReport.vue` (nuevo)
- `app/src/components/kronos/reports/MembershipsReport.vue` (nuevo)
- `app/src/components/kronos/reports/ReportDetailTable.vue`
- `app/src/pages/reportes.vue`
- `app/tests/reporting-contracts.test.ts`, `reporting-service.test.ts`, `reporting-operational.test.ts`, `reporting-ui.test.ts`
- `app/e2e/responsive/reporting-responsive.spec.ts`

## Tareas ejecutables y orden

- RP9.1 — Proyección de mensualidades y estados de filtros/URL. Aceptación: allowlist de pagos; fuente sólo Admin; estados de Atletas y mensualidad serializan sin colisión. Verificación: TDD en reporting-contracts/service/operational. Archivos: tipos, periodos, servicio Firebase/servicio, store y pruebas (dividir en rebanadas de máximo cinco archivos).
- RP9.2 — Reporte de Atletas. Aceptación: KPI de estados y eventos por cortes día/mes/año con calidad parcial visible y detalle sin PII. Verificación: pruebas de contrato/UI; Chrome KPI→evento. Archivos: `AthletesReport.vue`, `reportes.vue`, `ReportDetailTable.vue`, `reporting-ui.test.ts`.
- RP9.3 — Reporte de mensualidades. Aceptación: esperado/cobrado/vencido/adelantado/pendiente al corte, reconciliados y con atribución clara. Verificación: casos de abono parcial, adelanto, vencido y legado; Chrome KPI→pago. Archivos: `MembershipsReport.vue`, filtros, `reportes.vue`, pruebas UI/operacionales.
- RP9.4 — Checkpoint integral. Aceptación: rutas, URL, errores/vacío, acceso Admin-only y responsive. Verificación: `npm run typecheck`, `npm run build`, lint, pruebas reporting/finance, Chrome manual y Playwright cuando haya perfil autorizado.

Cada tarea queda sujeta a autorización de esta spec; antes de implementar se presentará su rebanada, criterios, archivos, riesgos y rollback.

## Estrategia de pruebas

- Unitarias: snapshots completos/parciales, eventos efectivos y legado, cortes, cambio de año/mes/día, status filters, método, adelantos pagados antes del corte, montos/fechas desconocidos, estados vacíos y suma detalle-KPI a centavos.
- Servicios/permisos: Admin obtiene proyección de membresías; no Admin con `reports` nunca se suscribe a pagos; PII y campos libres quedan fuera.
- UI: definición, unidad, calidad, filtros URL, tendencia→detalle→registro y retorno.
- Comandos desde `app/`: `node --require ./scripts/node-userinfo-preload.cjs --import tsx --test tests/reporting-contracts.test.ts tests/reporting-service.test.ts tests/reporting-operational.test.ts tests/reporting-ui.test.ts`; `npm run test:finance`; `npm run typecheck`; `npm run build`; `npx eslint <archivos focalizados>`.
- Chrome: login manual en la sesión local, recorrido completo protegido, revisar consola/red/DOM/árbol de accesibilidad y screenshots en `320/768/1024/1440`.
- Playwright complementario sólo con sesión QA autorizada en contexto de prueba y estado local ignorado por Git; nunca inspeccionar estado, credenciales o cookies.

## Riesgos y rollback

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Historial legado incompleto parece un total exacto | Alto | Calidad parcial/no disponible y no reconstruir eventos |
| Confusión entre periodo de membresía, fecha de pago y corte | Alto | Atribuciones separadas en contrato/etiquetas y pruebas de adelantados |
| Lectura de pagos expuesta a no Admin | Alto | Conservar `adminOnlySources`, pruebas negativas del adaptador y sin cambios de reglas |
| Estado compartido de filtros mezcla estados de dos dominios | Medio | Parámetros URL con nombres/tipos de dominio independientes y casos round-trip |
| Volumen de pagos y cómputo en memoria | Medio | Reutilizar adaptador existente, medir carga; agregados persistidos fuera de alcance |

Rollback: retirar las nuevas suscripciones/proyecciones de pagos, componentes y estado URL de Fase 4; mantener intactos contratos fuente, reglas, datos y UI previa de Fases 1–3. No requiere migración ni restauración de datos.

## Comandos y stack

Vue 3, TypeScript, Vuetify, Pinia, Firebase y Vite existentes; sin dependencias.
Dev: `npm run dev -- --host 127.0.0.1 --port 5173`.
Build: `npm run build`.
Tests/lint: los comandos focalizados anteriores.

## Preguntas abiertas

Ninguna para revisar el alcance propuesto. Los estados y atribuciones arriba descritos son las definiciones propuestas; cualquier cambio de métrica, fuente o permiso devuelve la spec a propuesta.
