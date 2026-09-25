# Spec: Adelantos de mensualidad

Estado: implementada, validada y desplegada el 2026-09-24; sin migración ni modificación manual de datos reales.
Módulo: `membership-advance-payments`.
Dependencia: `athletes-payments`.

## Objetivo

Hacer explícito y trazable el abono de mensualidades antes del día de corte, incluyendo periodos futuros, sin convertir un adelanto parcial en vencido antes de tiempo y conservando el precio acordado al abrir cada periodo.

## Hallazgos actuales

- El diálogo acepta texto `YYYY-MM`, pero el flujo no explica ni etiqueta adelantos.
- `Payment` se identifica por atleta y periodo y ya soporta parcialidades.
- El monto total se conserva al crear el primer abono del periodo.

## Alcance

- Elegir el periodo actual o hasta 12 meses futuros.
- Aplicar un adelanto parcial o liquidación completa a un solo periodo por operación.
- Calcular vencimiento con el día de pago; para 29–31 usar el último día válido del mes.
- Congelar plan, importe acordado y día de pago al abrir el periodo.
- Clasificar visualmente `advance`, `pending`, `overdue` o `paid` sin romper `PaymentStatus` persistido.
- Mostrar fecha de corte y leyenda de adelanto en historial y recibo.
- Excluir adelantos no vencidos de alertas de morosidad.

## Fuera de alcance

- Pagar varios meses en una sola operación.
- Descuentos o precios escalonados por prepago.
- Reversos de mensualidad.

## Contrato funcional

```ts
interface MembershipPeriodSnapshot {
  planId: string
  agreedAmount: number
  paymentDay: number
  dueDate: ISODate
}

type MembershipCollectionState = 'advance' | 'pending' | 'overdue' | 'paid'
```

La clasificación depende de la fecha efectiva del abono, la fecha de corte y el saldo. El reloj debe ser inyectable en pruebas.

## Criterios de aceptación

1. Antes del corte se puede abonar al periodo vigente y se etiqueta `Adelantado`.
2. Se puede seleccionar cualquiera de los 12 periodos siguientes, pero no uno posterior.
3. Un adelanto parcial conserva saldo sin aparecer vencido antes de `dueDate`.
4. Un adelanto completo queda liquidado y no reaparece en cobranza.
5. Cambiar después el plan o precio del atleta no altera el periodo ya abierto.
6. El 31 se normaliza al último día de febrero, abril, junio, septiembre o noviembre.
7. El recibo muestra atleta, periodo, fecha de corte, importe y método.
8. Dashboard, recordatorios y WhatsApp no tratan como vencido un periodo futuro.
9. Typecheck, pruebas, build y Chrome cubren adelanto parcial y total.

## Tech stack y archivos probables

- Stack existente, sin dependencias.
- `app/src/types/domain.ts`
- `app/src/utils/membership-periods.ts`
- `app/src/services/payments.service.ts`
- `app/src/components/kronos/MembershipPaymentDialog.vue`
- `app/src/pages/pagos.vue`
- `app/src/utils/receipts.ts`
- `app/tests/membership-advance-payments.test.ts`

## Estilo

```ts
const state = membershipCollectionState({ dueDate, balance, paidAt, today })
```

Las fechas se calculan con fecha local de negocio y no mediante UTC implícito.

## Comandos y pruebas

- `npx tsx --test tests/membership-advance-payments.test.ts`
- Regresión: `npm run test:finance` y pruebas de notificaciones.
- `npm run typecheck`; `npm run build`.
- Chrome y Playwright en `320/768/1024/1440`.

## Límites y riesgos

- Siempre: snapshot inmutable, reloj inyectable y zona `America/Mexico_City`.
- Preguntar antes: reglas, esquema o backfill.
- Nunca: recategorizar adelantos históricos sin evidencia.
- Riesgos: fechas de corte 29–31 y recordatorios existentes que infieran deuda sólo por periodo.

## Preguntas abiertas

Ninguna para planificación.
