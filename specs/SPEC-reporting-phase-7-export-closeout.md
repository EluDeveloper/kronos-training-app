# Spec de fase: Exportación CSV y cierre integral de Reportes

Estado: implementada y verificada localmente el 2026-09-25; módulo de Reportes cerrado sin datos reales ni despliegue.
Módulo: `reports` / `reporting-contracts`.
Dependencias: `SPEC-reporting-contracts.md` aprobada; Fases 1–6 implementadas y verificadas localmente.

## Objetivo

Permitir que un Admin descargue en un único CSV auditable el resultado actualmente filtrado y autorizado del módulo de Reportes, conservando periodo, filtros, significado, unidad, calidad del dato y referencias técnicas; después ejecutar la regresión integral que cierre el módulo sin ampliar lecturas ni exponer datos excluidos.

## Supuestos explícitos

1. El formato será CSV UTF-8 con BOM, columnas estables, separador coma, escape RFC 4180 y saltos CRLF para interoperar con hojas de cálculo sin añadir dependencias.
2. Se descargará un solo archivo con tipos de registro (`metadata`, `metric`, `detail`) y un esquema común; no se generarán PDF, XLSX, ZIP ni varios archivos simultáneos.
3. El archivo representa exactamente los filtros de la URL y únicamente fuentes cargadas que el usuario ya puede ver. No consulta Firebase de nuevo ni incluye registros ocultos por filtro o permiso.
4. La exportación permanece Admin-only en esta fase porque incluye Finanzas, Inventario y Personal. El permiso general `reports` sin Admin no habilita el botón.
5. Se exportan identificadores, nombres operativos ya visibles, fechas, estados, categorías y cantidades financieras necesarias. Se mantienen fuera teléfono, salud/admisión, contacto, descripción/recibo/notas, actores de auditoría, secretos y cualquier campo no proyectado.
6. `null` se serializa vacío y conserva calidad `partial-history` o `unavailable`; no se convierte silenciosamente a cero.
7. Importes usan número decimal con punto y máximo dos decimales, sin símbolos ni separadores de miles. Fechas usan ISO; etiquetas permanecen en español.
8. Todo texto controlado por datos se neutraliza si empieza con `=`, `+`, `-` o `@` para evitar inyección de fórmulas al abrir el CSV.
9. La descarga ocurre sólo en el navegador mediante `Blob`/URL temporal, se revoca al terminar y no se persiste ni transmite el archivo.
10. No se agregan dependencias, reglas, esquema, índices, datos reales, telemetría ni despliegue.

## Alcance propuesto

- Botón accesible `Exportar CSV` en el encabezado de Reportes, visible sólo para Admin.
- Generador puro de filas y serializador CSV independiente del DOM.
- Metadatos: versión de esquema, fecha de generación, zona `America/Mexico_City`, periodo, filtros activos, fuentes incluidas y calidad global disponible.
- KPIs y detalles filtrados de las secciones cargadas: Atletas, Mensualidades, Inventario, Personal, Tienda, Finanzas y Conciliación.
- Esquema común mínimo: `schema_version`, `record_type`, `section`, `key`, `label`, `date`, `source_type`, `source_id`, `category`, `status`, `method`, `account`, `unit`, `value`, `secondary_value`, `quality` y `filters`.
- Nombre determinista `kronos-reportes_<desde>_<hasta>.csv`.
- Estados de interfaz: deshabilitado durante carga, filtros inválidos, error o falta de fuentes; mensaje claro cuando no existen filas exportables; confirmación accesible al crear el archivo.
- Regresión completa de cálculos, permisos, filtros, drill-down, privacidad, accesibilidad y responsive de las Fases 1–6.

## Fuera de alcance

- PDF, XLSX, impresión, envío por correo/WhatsApp, exportación programada o almacenamiento remoto.
- Exportar datos crudos, campos no visibles, fuentes con error o datos fuera de los filtros vigentes.
- Elegir columnas, reordenarlas o exportar secciones por separado.
- Cambiar permisos, reglas Firebase, esquema, consultas, agregados o límites de lectura.
- Migraciones, escrituras QA, datos reales o despliegue.

## Criterios de aceptación

1. El CSV contiene BOM, encabezado estable, comillas/escape correctos y puede reconstruirse en pruebas sin pérdida de comas, comillas, saltos o caracteres UTF-8.
2. Cada KPI exportado coincide con la UI y su detalle a $0.01 para los mismos filtros. Nulos o métricas no disponibles permanecen vacíos y llevan su calidad explícita.
3. Periodo, filtros activos, zona, fuentes incluidas y versión del esquema aparecen como registros `metadata`; el nombre del archivo refleja desde/hasta.
4. Sólo se incluyen secciones cargadas y autorizadas. Una fuente ausente o con error no se representa como completa y bloquea una exportación que pudiera parecer integral.
5. El contrato y el CSV no contienen teléfono, salud/admisión, contacto, descripción libre, recibo, notas, actor, token, cookie ni secreto.
6. Celdas textuales que comienzan con caracteres de fórmula se neutralizan; valores numéricos propios del contrato siguen siendo números decimales y no texto peligroso.
7. Producto, atleta, estados, método, cuenta, categoría y empleado respetan exactamente la semántica de filtros ya implementada; la exportación no recalcula con reglas distintas.
8. El botón sólo está habilitado para Admin cuando filtros y fuentes están listos. Carga, error, vacío y éxito se anuncian de forma accesible y no provocan navegación.
9. Descargar no escribe en Firebase, no hace una solicitud de red adicional, revoca la URL temporal y no registra el contenido exportado.
10. Pruebas unitarias cubren serialización, conciliación, filtros, calidad, privacidad e inyección de fórmulas. Suites reporting/finanzas, typecheck, lint focalizado y build pasan.
11. Chrome valida Reportes → aplicar filtros → exportar → inspeccionar nombre/contenido → continuar usando el módulo, con consola limpia y sin solicitud adicional de exportación.
12. Chrome y Playwright cubren `320`, `768`, `1024` y `1440` cuando el perfil QA aislado esté autenticado; un bloqueo por login se documenta sin copiar sesiones.
13. El reporte final incluye árbol, flujo completo, diagrama, evidencia, riesgos y rollback; no declara cerrado el módulo si existe una regresión nueva sin resolver.

## Contrato de exportación

```ts
type ReportingExportRecordType = 'metadata' | 'metric' | 'detail'

interface ReportingExportRow {
  schemaVersion: '1'
  recordType: ReportingExportRecordType
  section: string
  key: string
  label: string
  date: string
  sourceType: string
  sourceId: string
  category: string
  status: string
  method: string
  account: string
  unit: string
  value: number | null
  secondaryValue: number | null
  quality: ReportingDataQuality | ''
  filters: string
}
```

El orden de filas será determinista: metadata, sección, tipo, fecha, clave e identificador. El serializador no acepta objetos arbitrarios; sólo este contrato allowlisted.

## Archivos probables

- `app/src/types/reporting.ts`
- `app/src/utils/reporting-export.ts` (nuevo)
- `app/src/components/kronos/reports/ReportExportButton.vue` (nuevo)
- `app/src/pages/reportes.vue`
- `app/tests/reporting-export.test.ts` (nuevo)
- `app/tests/reporting-ui.test.ts`
- `app/e2e/responsive/reporting-responsive.spec.ts`
- `Docs/implementation-reports/2026-09-25-reporting-phase-7-export-closeout.md`
- `tasks/plan.md`, `tasks/todo.md` y esta spec

## Estrategia de implementación y pruebas

- RP12.1: contrato de filas, allowlist, orden y serializador CSV con TDD.
- RP12.2: proyección de los reportes ya calculados al contrato común, con pruebas de conciliación, filtros, calidad y privacidad.
- RP12.3: botón/descarga accesible y estados, sin nuevas consultas ni dependencias.
- RP13: regresión integral, Chrome, Playwright complementario y reporte de cierre.
- Comandos desde `app/`: `node --require ./scripts/node-userinfo-preload.cjs --import tsx --test tests/reporting-*.test.ts`; `npm run test:finance`; `npm run typecheck`; `npx eslint <archivos focalizados>`; `npm run build`; `npx playwright test e2e/responsive/reporting-responsive.spec.ts --project=responsive`.

## Límites

- Siempre: derivar del resultado ya filtrado, mantener allowlist, calidad y conciliación a centavos; probar privacidad e inyección de fórmulas.
- Preguntar antes: cambiar formato, agregar dependencia, permitir exportación no Admin, exportar datos adicionales, modificar reglas/esquema, usar datos reales o desplegar.
- Nunca: exportar datos crudos o secretos, inventar valores para nulos, registrar el contenido, conservar URLs temporales o eludir autenticación.

## Resultado de implementación

- RP12.1–RP13 completadas: contrato allowlisted, serializador CSV, proyección de siete dominios, descarga Admin-only y regresión integral.
- La suite reporting/finanzas pasó 61/61; la revalidación focal posterior pasó 23/23; `npm run test:finance` pasó 5/5 con el preload estable ya usado por el repositorio. Typecheck, lint focalizado y build de 1226 módulos pasaron.
- Chrome descargó `kronos-reportes_2026-12-01_2026-12-31.csv`: BOM UTF-8, 67 líneas, 66 registros auditables, cifras de venta/flujo/variación conciliadas y ninguna coincidencia con los campos sensibles prohibidos.
- Chrome confirmó botón habilitado, anuncio accesible, consola limpia y ausencia de overflow en `320`, `768`, `1024` y `1440` px.
- Playwright volvió a ser redirigido al login en sus cuatro primeros casos de 320 px; el quinto se interrumpió para evitar repetir el mismo bloqueo. No se reutilizó ni inspeccionó la sesión manual.

## Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Fórmulas maliciosas al abrir el CSV | Alto | Neutralización de prefijos y pruebas con `=`, `+`, `-`, `@` |
| Archivo aparenta ser completo con fuente fallida | Alto | Bloquear exportación integral ante error y enumerar fuentes en metadata |
| PII o texto libre se filtra por serialización genérica | Alto | Contrato allowlisted, sin objetos arbitrarios y aserciones negativas sobre el archivo final |
| KPI y detalle divergen | Alto | Proyectar los mismos resultados calculados por la UI y conciliar a $0.01 |
| Locale altera números o fechas | Medio | Decimal con punto, sin formato visual, fechas ISO y prueba de round-trip |
| Archivo grande bloquea el navegador | Medio | Generación síncrona acotada al dataset ya cargado; documentar límite y no ampliar lecturas |
| Descarga deja recursos temporales | Bajo | Revocar `URL.createObjectURL` tras disparar la descarga |

Rollback: retirar el botón, la proyección y el serializador de exportación. Los cálculos, fuentes, filtros y datos de las Fases 1–6 permanecen intactos; no existe migración que revertir.

## Preguntas abiertas

Ninguna si se acepta CSV único con el contrato anterior. Cambiar a PDF/XLSX, exportaciones por sección o acceso no Admin modifica alcance, privacidad y verificación, por lo que requeriría revisar esta spec antes de implementar.
