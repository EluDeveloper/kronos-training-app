# Spec: Reconciliación y resolución de inventario

Estado: implementada y validada localmente el 2026-09-24; sin datos reales ni despliegue.
Módulo: `inventory-reconciliation`.
Dependencia: `store-inventory`.

## Objetivo

Evitar que un faltante vuelva a acumularse en cierres posteriores, fijando el conteo físico finalizado como nuevo stock canónico y conservando un historial de ajustes y resoluciones: encontrado, cubierto, pérdida o corrección.

## Hallazgos actuales

- El cierre guarda `systemStock`, `countedStock` y variación.
- Guardar el cierre no modifica `products/{id}/stock`.
- La siguiente semana vuelve a comparar contra el stock anterior y repite el faltante.
- Los cierres pueden sobrescribirse por semana y no existe estado borrador/finalizado.

## Alcance

### Cierre

- Estados `draft` y `finalized`.
- En finalización atómica: guardar stock anterior y conteo, crear ajustes y actualizar cada producto a `countedStock`.
- Una vez finalizado, no editar conteos; corregir con movimientos posteriores.
- Conservar costo unitario, actor, fechas y cierre de origen.

### Resolución

- Estados por faltante: `pending`, `found`, `covered`, `written-off`, `corrected`.
- Permitir resolución parcial hasta agotar unidades/valor pendiente.
- `found`: reintegrar unidades al stock con ajuste.
- `covered`: registrar importe, método, fecha y referencia opcional; crear ingreso de recuperación auditable.
- `written-off`: registrar merma no recuperada sin inventar una salida de efectivo.
- `corrected`: ajuste administrativo con motivo obligatorio.

## Fuera de alcance

- Contabilidad fiscal de inventarios.
- Cobros automáticos a empleados.
- Eliminar cierres finalizados.
- Migrar o resolver faltantes históricos automáticamente.

## Contratos funcionales

```ts
type InventoryClosureStatus = 'draft' | 'finalized'
type InventoryResolutionKind = 'found' | 'covered' | 'written-off' | 'corrected'

interface InventoryAdjustment {
  id: string
  productId: string
  closureId: string
  stockBefore: number
  countedStock: number
  varianceUnits: number
  unitCostSnapshot: number
  createdBy: string
  createdAt: ISOTimestamp
}
```

El valor cubierto sugerido usa costo unitario del cierre; una excepción requiere importe explícito y motivo. La suma resuelta nunca supera unidades/valor pendientes.

## Criterios de aceptación

1. Sistema 10 y conteo 8 finaliza con stock canónico 8 y ajuste -2.
2. El siguiente cierre inicia en 8; si cuenta 6 registra -2, no -4.
3. Si una escritura del producto falla, no se finaliza ninguna parte del cierre.
4. Un cierre finalizado no puede sobrescribirse desde cliente.
5. Marcar una unidad `found` aumenta stock exactamente una vez.
6. `covered` registra recuperación real sin modificar unidades físicas.
7. `written-off` cierra la pérdida pendiente sin crear un `Expense` pagado.
8. Resoluciones parciales muestran pendiente restante y no exceden el ajuste.
9. Toda resolución tiene actor, fecha, motivo y referencia al ajuste.
10. Cierres históricos permanecen visibles como legado no reconciliado.
11. Reglas, emulador, concurrencia, build y Chrome validan el flujo completo.

## Tech stack y archivos probables

- Stack existente, sin dependencias.
- `app/src/types/domain.ts`
- `app/src/utils/inventory-reconciliation.ts`
- `app/src/services/closures.service.ts`
- `app/src/services/inventory-resolutions.service.ts`
- `app/src/stores/closures.ts`
- `app/src/pages/cierres.vue`
- `app/database.rules.json`
- `app/tests/inventory-reconciliation.test.ts`
- `app/tests/database.rules.test.mjs`

## Estilo

```ts
const reconciliation = buildInventoryReconciliation(products, counts, actor, now)
await applyAtomicReconciliation(reconciliation)
```

La función pura produce el mapa completo de escrituras; el servicio no recalcula reglas de negocio.

## Comandos y pruebas

- `npx tsx --test tests/inventory-reconciliation.test.ts`
- `npm run test:rules`; `npm run test:finance`.
- `npm run typecheck`; `npm run build`.
- Chrome: borrador → conteo → finalización → nuevo stock → resolución.
- Playwright `320/768/1024/1440`.

## Límites y riesgos

- Siempre: actualización multipath atómica, idempotencia y cierre finalizado inmutable.
- Preguntar antes: reglas, esquema, backfill, writes QA o despliegue.
- Nunca: sumar otra vez una pérdida resuelta ni crear gasto de caja ficticio.
- Riesgos: concurrencia con ventas durante el conteo, reintentos y tratamiento financiero de recuperaciones.

## Preguntas abiertas

Ninguna para planificación. La política de bloquear ventas durante el instante de finalización se resolverá con verificación optimista de stock y rechazo si cambió.
