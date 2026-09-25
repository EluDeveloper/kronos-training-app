# Spec: Empleados, asistencias y liquidaciones

Estado: implementada, validada y desplegada el 2026-09-24; sin migración ni modificación manual de datos reales.
Módulo: `workforce-payroll`.
Dependencias: `foundation`, `operations` y egresos administrativos.

## Objetivo

Crear un módulo para administrar coaches, limpieza y otros empleados, registrar clases o días trabajados, calcular lo devengado, liquidar pendientes y reflejar pagos realizados como egresos sin duplicación.

## Alcance

### Empleados

- Nombre, contacto, tipo, fecha de ingreso, estado y notas.
- Esquema `per-class`, `per-day` o `fixed-period`.
- Tarifa con vigencia e historial; vínculo opcional con `AppUser`.

### Trabajo y asistencia

- Registrar fecha, unidad, cantidad, tarifa congelada, importe, nota y actor.
- Permitir varias clases por día y máximo una asistencia diaria de limpieza salvo corrección justificada.
- Estados `pending`, `approved`, `paid`.

### Liquidaciones

- Seleccionar registros pendientes/aprobados del mismo empleado.
- Calcular total, método, fecha y folio.
- Marcar líneas como pagadas en una operación atómica.
- Crear un `Expense` categoría `Nómina` ligado por `payrollSettlementId`.
- Ser idempotente: una liquidación produce como máximo un egreso.
- Mostrar devengado, pagado y pendiente por empleado y periodo.

## Fuera de alcance

- Cálculo fiscal, impuestos, timbrado, prestaciones o nómina legal.
- Portal de autocaptura para empleados.
- Asignación automática desde programación de WODs.

## Contratos funcionales

```ts
type CompensationUnit = 'class' | 'day' | 'fixed-period'
type WorkEntryStatus = 'pending' | 'approved' | 'paid'

interface WorkEntry {
  id: string
  employeeId: string
  date: ISODate
  unit: CompensationUnit
  quantity: number
  rateSnapshot: number
  amount: number
  status: WorkEntryStatus
  createdBy: string
  createdAt: ISOTimestamp
}
```

`amount = quantity × rateSnapshot`, redondeado a centavos. El egreso se reconoce al pagar, no al devengar.

## Criterios de aceptación

1. Admin puede crear empleados activos con uno de los tres esquemas.
2. Cambiar una tarifa no modifica asistencias anteriores.
3. Un coach puede registrar varias clases el mismo día y cada una conserva su tarifa.
4. Limpieza rechaza duplicado diario salvo corrección autorizada y auditada.
5. La liquidación incluye sólo líneas del mismo empleado no pagadas.
6. Guardar o reintentar una liquidación no duplica el egreso.
7. El egreso contiene vínculo, empleado, periodo, importe y método sin copiar teléfono.
8. Revertir una liquidación queda fuera de esta primera fase; no se permite eliminar una pagada.
9. Sólo Admin accede inicialmente al módulo y sus reglas.
10. Los totales de devengado, pagado y pendiente reconcilian a $0.01.
11. Chrome cubre empleado → asistencia → aprobación → liquidación → egreso.

## Tech stack y estructura probable

- Vue 3, TypeScript, Vuetify, Pinia y RTDB existentes; sin dependencias.
- `app/src/types/workforce.ts`
- `app/src/utils/workforce-payroll.ts`
- `app/src/services/employees.service.ts`
- `app/src/services/work-entries.service.ts`
- `app/src/services/payroll-settlements.service.ts`
- `app/src/stores/workforce.ts`
- `app/src/pages/empleados.vue`
- `app/src/components/kronos/WorkEntryDialog.vue`
- `app/src/components/kronos/PayrollSettlementDialog.vue`
- `app/src/types/access.ts`, rutas y navegación.
- `app/database.rules.json` y pruebas.

## Estilo

```ts
const accruedAmount = currency(entry.quantity * entry.rateSnapshot)
```

La lógica monetaria y selección de líneas será pura; servicios sólo persistirán contratos validados.

## Comandos y pruebas

- `npx tsx --test tests/workforce-payroll.test.ts`
- `npm run test:rules`
- `npm run test:finance`
- `npm run typecheck`; `npm run build`.
- Chrome y Playwright `320/768/1024/1440`.

## Seguridad, límites y riesgos

- Siempre: mínimo privilegio, idempotencia, snapshots de tarifa y no exponer contacto en egresos/reportes.
- Preguntar antes: esquema, reglas, migraciones, permisos no Admin o datos reales.
- Nunca: presentar el módulo como nómina fiscal ni guardar información bancaria sensible.
- Riesgos: doble egreso, edición posterior a pago y mezcla de devengo con flujo de efectivo.

## Preguntas abiertas

Ninguna para la primera fase; impuestos, nómina fiscal y autocaptura quedan explícitamente fuera.
