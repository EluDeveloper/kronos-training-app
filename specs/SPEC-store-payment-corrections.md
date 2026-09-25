# Spec: Correcciones y reversos de cobros de tienda

Estado: implementada, validada y desplegada el 2026-09-24; sin migración ni modificación manual de datos reales.
Módulo: `store-payment-corrections`.
Dependencias: `store-inventory`, permisos y sesión de `foundation`.
Capability map: `specs/CAPABILITY-MAP.md`.

## Objetivo

Permitir que un Admin corrija el método efectivo de un cobro o reverse uno o varios cobros de tienda para reactivar el saldo correspondiente, sin borrar ni sobrescribir los movimientos originales. Toda corrección debe conservar actor, fecha, motivo, relación con cobros agrupados y efecto sobre saldo a favor.

## Hallazgos actuales

- `SalePayment` es inmutable en reglas y `saleAppliedAmount` suma todos los pagos.
- Un cobro agrupado crea un pago por venta con el mismo `groupPaymentId`.
- Un cobro puede generar saldo a favor y una mensualidad puede liquidar adeudos de tienda mediante `membershipInstallmentId`.
- No existe reverso, corrección de método ni comprobante de ajuste.

## Alcance

- Añadir ajustes append-only `reversal` y `method-change` relacionados con el pago original.
- Revertir un pago individual, varios pagos seleccionados o un grupo lógico completo.
- Cambiar el método efectivo entre efectivo, transferencia, tarjeta u otro sin alterar importe ni fecha originales.
- Exigir motivo y permiso `storeCorrectPayments`; Admin lo recibe por rol.
- Derivar pagos efectivos, saldo y estado de venta considerando ajustes.
- Restituir saldo a favor cuando corresponda; fallar cerrado si ya fue consumido y no puede conciliarse.
- Generar comprobante de reverso/corrección y conservar recibos históricos.
- Actualizar consumidores: Tienda, dashboard/reportes financieros, recibos y notificaciones que calculen deuda.

## Fuera de alcance

- Borrar pagos o reescribir sus campos originales.
- Corregir mensualidades o visitas.
- Crear devoluciones bancarias automáticas.
- Corregir datos reales o ejecutar migraciones sin autorización separada.

## Contrato funcional

```ts
type SalePaymentAdjustmentKind = 'reversal' | 'method-change'

interface SalePaymentAdjustment {
  id: string
  saleId: string
  paymentId: string
  groupPaymentId?: string | null
  kind: SalePaymentAdjustmentKind
  amount?: number
  fromMethod?: PaymentMethod
  toMethod?: PaymentMethod
  reason: string
  createdBy: string
  createdAt: ISOTimestamp
}
```

Un pago revertido aporta cero al saldo aplicado. Un cambio de método conserva el importe y usa el método corregido para reportes posteriores. Sólo puede existir un reverso efectivo por pago; varios cambios de método se resuelven por orden temporal determinista.

## Criterios de aceptación

1. Revertir un pago liquidado devuelve la venta a `credit` por el importe correcto.
2. Revertir varias asignaciones agrupadas actualiza todas en una operación atómica o ninguna.
3. Cambiar efectivo a transferencia no cambia total pagado ni saldo, pero sí el método efectivo en recibos y reportes.
4. Pago, importe, método y fecha originales permanecen intactos.
5. Cada ajuste registra motivo no vacío, UID y fecha de servidor.
6. Un segundo reverso del mismo pago se rechaza.
7. Si el pago creó saldo a favor consumido, el reverso se rechaza con explicación y sin escrituras parciales.
8. Los cálculos existentes de deuda, cobro conjunto y recibos usan pagos efectivos.
9. Sólo Admin o `storeCorrectPayments` puede crear ajustes; nadie puede editarlos o eliminarlos desde cliente.
10. Reglas, contratos, typecheck, build y flujo completo en Chrome pasan sin datos productivos.

## Tech stack y estructura probable

- Vue 3, TypeScript, Vuetify, Pinia y Firebase Realtime Database existentes; sin dependencias nuevas.
- `app/src/types/domain.ts`
- `app/src/utils/store-payment-adjustments.ts`
- `app/src/services/sales.service.ts`
- `app/src/pages/tienda.vue`
- `app/src/components/kronos/StorePaymentCorrectionDialog.vue`
- `app/src/utils/receipts.ts`
- `app/database.rules.json`
- `app/tests/store-payment-corrections.test.ts`
- `app/tests/database.rules.test.mjs`

## Convención de código

```ts
const effectivePayments = resolveSalePayments(sale.payments, sale.paymentAdjustments)
const balance = saleBalanceFromPayments(sale.total, effectivePayments)
```

Las funciones de dominio serán puras, deterministas y sin acceso directo a Firebase.

## Comandos y pruebas

- Prueba enfocada: `npx tsx --test tests/store-payment-corrections.test.ts`
- Reglas: `npm run test:rules`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Lint focalizado antes del gate global.
- Chrome: cobro individual y agrupado → corrección/reverso → deuda reactivada → comprobante → consola/red limpias.
- Playwright complementario en `320/768/1024/1440`.

## Límites

- Siempre: usar transacciones o actualizaciones multipath, centavos deterministas, motivo obligatorio y fail-closed.
- Preguntar antes: reglas, esquema, writes QA, migraciones o despliegue.
- Nunca: borrar evidencia, mutar el pago original, exponer PII o ejecutar devoluciones externas.

## Riesgos

- Saldo a favor consumido y correlación con cobros combinados.
- Consumidores antiguos que sigan sumando pagos sin ajustes.
- Reintentos o concurrencia que intenten duplicar reversos.

## Preguntas abiertas

Ninguna para planificación. La implementación remota y cualquier migración conservan gates separados.
