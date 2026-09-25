import type { InventoryAdjustment, InventoryClosureItem, InventoryResolution, InventoryResolutionKind, PaymentMethod } from '@/types/domain'

type InventoryProduct = { id: string; name: string; category: string; stock: number; unitCost: number }
type ResolutionCommand = { id: string; kind: InventoryResolutionKind; units: number; amount?: number; method?: PaymentMethod; reference?: string; reason: string }

const currency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export function buildInventoryReconciliation(
  products: InventoryProduct[],
  counts: Record<string, number>,
  closureId: string,
  actorUid: string,
  createdAt: number,
) {
  const items: Record<string, InventoryClosureItem> = {}
  const adjustments: Record<string, InventoryAdjustment> = {}
  const stockUpdates: Record<string, number> = {}

  for (const product of products) {
    const countedStock = Number(counts[product.id])
    if (!Number.isInteger(countedStock) || countedStock < 0)
      throw new Error(`Captura un conteo válido para ${product.name}.`)
    const stockBefore = Number(product.stock || 0)
    const variance = countedStock - stockBefore

    items[product.id] = {
      productId: product.id,
      name: product.name,
      category: product.category,
      systemStock: stockBefore,
      countedStock,
      variance,
      unitCost: currency(product.unitCost),
      varianceValue: currency(variance * product.unitCost),
    }
    adjustments[product.id] = {
      id: `${closureId}-${product.id}`,
      productId: product.id,
      closureId,
      stockBefore,
      countedStock,
      varianceUnits: variance,
      unitCostSnapshot: currency(product.unitCost),
      createdBy: actorUid,
      createdAt,
    }
    stockUpdates[product.id] = countedStock
  }

  return { items, adjustments, stockUpdates }
}

export function buildInventoryResolution(
  adjustment: InventoryAdjustment,
  existing: InventoryResolution[],
  command: ResolutionCommand,
  actorUid: string,
  createdAt: number,
): InventoryResolution {
  const lossUnits = Math.max(0, -adjustment.varianceUnits)
  const resolvedUnits = existing.reduce((sum, resolution) => sum + Number(resolution.units || 0), 0)
  const units = Number(command.units)
  if (!Number.isInteger(units) || units <= 0 || resolvedUnits + units > lossUnits)
    throw new Error('La resolución excede las unidades pendientes del ajuste.')
  const reason = command.reason.trim()
  if (reason.length < 3)
    throw new Error('El motivo de la resolución es obligatorio.')
  if (command.kind === 'covered' && !command.method)
    throw new Error('Selecciona el método con el que se cubrió el faltante.')
  const amount = currency(command.amount ?? units * adjustment.unitCostSnapshot)
  if (command.kind === 'covered' && amount <= 0)
    throw new Error('El monto cubierto debe ser mayor que cero.')

  return {
    id: command.id,
    adjustmentId: adjustment.id,
    closureId: adjustment.closureId,
    productId: adjustment.productId,
    kind: command.kind,
    units,
    amount,
    ...(command.kind === 'covered' && command.method ? { method: command.method } : {}),
    ...(command.reference?.trim() ? { reference: command.reference.trim() } : {}),
    reason,
    createdBy: actorUid,
    createdAt,
  }
}
