# Spec: Volver una venta liquidada a adeudo

Estado: autorizada por el usuario el 2026-09-25 para implementación local; dominio Tienda confirmado.
Módulo: `store-sale-debt-reopening`.
Dependencia: `store-payment-corrections`.

## Objetivo

Permitir que un Admin corrija una liquidación accidental desde la propia venta y la vuelva a mostrar como adeudo, sin cancelar la venta, borrar el cobro ni alterar los movimientos originales.

## Suposición funcional

“Restaurar la venta” significa revertir uno o más cobros efectivos mediante el mecanismo append-only ya existente. La venta conserva productos, total e identidad; su estado efectivo vuelve a `credit` por el saldo reactivado. Si se pretendía otro dominio distinto de Tienda, esta spec debe corregirse antes de autorizarse.

## Alcance

- Añadir en ventas pagadas/parcialmente pagadas una acción visible `Marcar nuevamente como adeudo`.
- Mostrar los cobros efectivos que pueden revertirse y el saldo resultante antes de confirmar.
- Exigir motivo y confirmación explícita; reutilizar permiso `storeCorrectPayments`.
- Crear ajustes `reversal` existentes; no mutar `sale.status` ni cancelar la venta.
- Reabrir adeudo total o parcial según los cobros seleccionados.
- Generar comprobante de reverso y dejar acceso a los recibos originales.
- Explicar y bloquear casos con saldo a favor consumido o conciliación imposible.

## Fuera de alcance

- Cancelar la venta, devolver inventario o hacer devolución bancaria.
- Revertir mensualidades, visitas o liquidaciones de empleados.
- Editar/borrar el cobro original.

## Criterios de aceptación

1. Desde la fila de una venta liquidada se puede iniciar la corrección sin buscar el cobro en otra pestaña.
2. Revertir el único cobro cambia el estado efectivo de `paid` a `credit` por el total correcto; `sale.status` original no se fuerza a `cancelled`.
3. Revertir uno de varios cobros reactiva sólo su importe.
4. Motivo, actor, fecha, pago y grupo quedan auditados; un segundo reverso se rechaza.
5. Cobros agrupados muestran alcance y se aplican atómicamente conforme al contrato existente.
6. Un saldo a favor ya consumido falla cerrado, sin escrituras parciales y con explicación visible.
7. Recibos/reportes/deuda usan pagos efectivos y concilian a $0.01.
8. Chrome cubre venta pagada → marcar adeudo → confirmación → deuda visible → comprobante, sin usar `Cancelar venta`.

## Archivos, comandos y límites

- Archivos probables: `app/src/pages/tienda.vue`, `app/src/components/kronos/StorePaymentCorrectionDialog.vue`, `app/src/utils/store-payment-adjustments.ts`, pruebas existentes y `app/tests/store-sale-debt-reopening.test.ts`.
- `npx tsx --test tests/store-payment-corrections.test.ts tests/store-sale-debt-reopening.test.ts`
- `npm run test:rules`; `npm run test:finance`; `npm run typecheck`; `npm run build`; Chrome y responsive.
- Siempre: append-only, motivo obligatorio, centavos deterministas y operación atómica.
- Preguntar antes: reglas/esquema, datos reales o devolución externa.
- Nunca: borrar evidencia, alterar inventario o usar cancelación como sustituto.

## Riesgos

La función base ya existe en `Cobros recientes`; el riesgo es duplicar lógica o producir acciones con semántica distinta. La nueva entrada debe delegar al mismo contrato y sólo mejorar descubribilidad/contexto.
