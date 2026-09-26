# Spec: Recibo de liquidación de empleado

Estado: autorizada por el usuario el 2026-09-25 para implementación local.
Módulo: `payroll-settlement-receipts`.
Dependencia: `workforce-payroll`.

## Objetivo

Generar y mostrar un recibo al completar una liquidación de trabajo de un empleado, y permitir recuperarlo después desde el historial sin duplicar la liquidación ni el egreso.

## Alcance

- Construir el recibo desde el snapshot inmutable de `PayrollSettlement` y sus líneas relacionadas.
- Abrir automáticamente la vista previa después de una liquidación exitosa.
- Añadir historial paginado de liquidaciones con acción `Ver recibo`.
- Incluir folio, empleado, periodo, fecha, método, referencia opcional, líneas/unidades e importe total.
- Permitir descargar e imprimir con la infraestructura de recibos existente.
- Mantener fuera del recibo teléfono, notas internas, UID y datos bancarios.

## Fuera de alcance

- Timbrado fiscal, nómina legal, firma electrónica o envío automático.
- Editar una liquidación desde el recibo.
- Revertir liquidaciones; esa capacidad requiere una spec separada.

## Contrato propuesto

```ts
interface PayrollReceiptSnapshot {
  settlementId: string
  employeeId: string
  employeeName: string
  periodFrom: string
  periodThrough: string
  paidAt: string
  method: string
  amount: number
  lines: Array<{ date: string; unit: string; quantity: number; amount: number }>
}
```

El PDF se deriva de datos ya persistidos; no crea una segunda entidad financiera.

## Criterios de aceptación

1. Tras `Pagar y crear egreso`, una única operación genera liquidación/egreso y abre su recibo.
2. El importe y las líneas del recibo concilian a $0.01 con la liquidación.
3. Reabrir el recibo histórico produce el mismo folio y contenido financiero.
4. Reintentos de descarga/impresión no escriben ni duplican egresos.
5. El recibo no expone contacto, notas internas, actores ni datos bancarios.
6. Un registro legado sin detalle suficiente muestra calidad parcial y no inventa líneas.
7. Typecheck, pruebas, build y Chrome cubren liquidación → recibo → historial → reimpresión.

## Tech stack, archivos y estilo

- Stack existente y jsPDF ya instalado; sin dependencias.
- `app/src/types/workforce.ts`, `app/src/utils/receipts.ts`, `app/src/pages/empleados.vue`, `app/src/components/kronos/ReceiptDialog.vue`, `app/tests/payroll-settlement-receipts.test.ts`.

```ts
const receipt = buildPayrollSettlementReceipt(settlement, relatedEntries)
```

## Verificación y límites

- `npx tsx --test tests/payroll-settlement-receipts.test.ts`
- `npm run test:finance`; `npm run typecheck`; lint focalizado; `npm run build`.
- Chrome y Playwright 320/768/1024/1440.
- Siempre: derivación determinista, folio estable e importe a centavos.
- Preguntar antes: persistir un snapshot adicional, reglas, esquema o envío externo.
- Nunca: presentar el recibo como comprobante fiscal.
- Riesgo principal: liquidaciones legadas sin líneas disponibles; se debe degradar explícitamente.
