# Spec: Promociones configurables para planes

Estado: autorizada por el usuario el 2026-09-25 para implementación local; ampliación de mensualidad gratis y constancia autorizada el 2026-09-26.
Módulo: `plan-promotions`.
Dependencia: `athletes-payments`.

## Objetivo

Configurar promociones con vigencia que apliquen a determinados planes y a todos o algunos horarios, y congelar la promoción realmente aplicada al abrir/cobrar una mensualidad.

## Alcance

- CRUD Admin de promociones activas/inactivas con nombre, tipo de descuento, valor, inicio y fin inclusivos.
- Tipos propuestos: porcentaje o monto fijo; el total nunca puede ser negativo. Si el descuento iguala o supera el importe acordado, el periodo queda gratis ($0).
- Seleccionar uno o varios planes elegibles.
- Configurar horarios: todos, `Matutino`, `Vespertino` o ambos explícitamente.
- Determinar elegibilidad por fecha de negocio, plan y horario del atleta.
- Mostrar precio base, descuento y precio final antes de confirmar el pago.
- Guardar snapshot de promoción en el periodo/pago para que cambios posteriores no alteren históricos, recibos ni reportes.
- Si coinciden varias promociones, no acumular: elegir la de mayor descuento y mostrar cuál se aplicó. Admin puede optar por no aplicar una promoción antes de cobrar, dejando razón de omisión fuera de esta primera fase.
- Recibo e historial muestran promoción y ahorro. Para un periodo gratis se genera una constancia de mensualidad gratis, no un recibo de pago.

## Fuera de alcance

- Cupones personales, referidos, paquetes, promociones de tienda o saldo a favor.
- Combinación de promociones, segmentación por atleta o actualización retroactiva.
- Cambiar periodos ya abiertos o pagos históricos.

## Contrato propuesto

```ts
interface PlanPromotion {
  id: string
  name: string
  discountType: 'percentage' | 'fixed-amount'
  discountValue: number
  validFrom: ISODate
  validThrough: ISODate
  planIds: Record<string, true>
  schedules: 'all' | Array<'Matutino' | 'Vespertino'>
  status: 'active' | 'inactive'
}

interface AppliedPromotionSnapshot {
  promotionId: string
  name: string
  discountType: 'percentage' | 'fixed-amount'
  discountValue: number
  baseAmount: number
  finalAmount: number
}
```

## Criterios de aceptación

1. Admin crea una promoción con nombre, descuento válido, vigencia coherente, al menos un plan y horario elegible.
2. Fuera de vigencia, plan u horario la promoción no aparece ni modifica el importe.
3. Dentro de vigencia se muestra base, descuento, precio final y promoción antes del cobro.
4. Si coinciden varias, se aplica sólo la de mayor ahorro; empates se resuelven de forma determinista por `validFrom` y luego ID.
5. Un descuento fijo puede igualar o superar el importe acordado del atleta; se limita al importe base para producir $0. El porcentaje está entre 0 y 100 exclusivo.
6. El snapshot aplicado no cambia al editar/desactivar la promoción o cambiar el plan del atleta.
7. Abonos parciales y anticipados usan el importe final congelado del periodo.
8. Recibo, deuda, dashboard y reportes concilian a $0.01 y muestran el ahorro sin contarlo como pago.
9. Sólo Admin administra promociones; no se amplían permisos sin autorización.
10. Pruebas, reglas, finanzas, build y Chrome cubren creación → elegibilidad → abono → recibo → edición posterior sin efecto histórico.
11. Si el precio final es $0, Admin confirma explícitamente el periodo gratis; queda liquidado sin abono, sin saldo a favor y sin movimiento de efectivo. Su constancia dice «Mensualidad gratis · $0 cobrado».
12. Antes del primer abono, Admin puede omitir una promoción elegible y cobrar el importe acordado sin descuento; la elección queda congelada al abrir el periodo.

## Tech stack, archivos y estilo

- Stack existente, sin dependencias nuevas.
- Archivos probables: `app/src/types/domain.ts`, `app/src/utils/plan-promotions.ts`, servicio/store de promociones, `app/src/pages/planes.vue`, `MembershipPaymentDialog.vue`, `receipts.ts`, reglas y pruebas; dividir en rebanadas de máximo cinco archivos.

```ts
const quote = resolvePlanPromotion({ plan, schedule, businessDate, promotions })
```

La resolución será pura, determinista, con fecha local `America/Mexico_City` y dinero redondeado a centavos.

## Comandos y pruebas

- `npx tsx --test tests/plan-promotions.test.ts tests/membership-advance-payments.test.ts`
- `npm run test:finance`; `npm run test:rules`; `npm run typecheck`; lint focalizado; `npm run build`.
- Chrome: promoción → plan/horario elegible y no elegible → abono anticipado/parcial → recibo → edición de promoción.
- Playwright complementario en 320/768/1024/1440.

## Límites, riesgos y preguntas abiertas

- Siempre: snapshot, mayor descuento único, centavos deterministas y sin retroactividad.
- Preguntar antes: esquema/reglas, migración, permisos, datos reales o despliegue.
- Nunca: recalcular históricos con la promoción vigente ni acumular descuentos implícitamente.
- Riesgos: concurrencia al editar durante un cobro, horarios libres/legados y confundir descuento con entrada de efectivo.
- Para autorización: confirmar que se aceptan ambos tipos de descuento y la regla “mayor ahorro, sin acumulación”. Si se prefiere precio promocional fijo o prioridad manual, esta spec vuelve a `propuesta` con ese cambio.
