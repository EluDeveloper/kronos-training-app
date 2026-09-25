import { get, push, ref, serverTimestamp, set, update } from 'firebase/database'
import type { CashClosure, InventoryAdjustment, InventoryClosure, InventoryResolution, InventoryResolutionKind, PaymentMethod, Product } from '@/types/domain'
import { businessPath, requireDatabase, subscribeCollection, type ErrorHandler } from './realtime.service'
import { buildInventoryResolution } from '@/utils/inventory-reconciliation'

export type CashClosureInput = Omit<CashClosure, 'id' | 'createdAt' | 'updatedAt'>
export type InventoryClosureInput = Omit<InventoryClosure, 'id' | 'createdAt' | 'updatedAt'>

async function saveDatedClosure(path: string, id: string, payload: Record<string, unknown>) {
  const entityRef = ref(requireDatabase(), businessPath(`${path}/${id}`))
  const snapshot = await get(entityRef)

  await set(entityRef, {
    ...payload,
    id,
    createdAt: snapshot.child('createdAt').val() ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return id
}

export const closuresService = {
  subscribeCash: (onChange: (items: CashClosure[]) => void, onError: ErrorHandler) => subscribeCollection<CashClosure>('cashClosures', onChange, onError),
  subscribeInventory: (onChange: (items: InventoryClosure[]) => void, onError: ErrorHandler) => subscribeCollection<InventoryClosure>('inventoryClosures', onChange, onError),
  saveCash: (closure: CashClosureInput) => saveDatedClosure('cashClosures', closure.date, closure as unknown as Record<string, unknown>),
  saveInventory: (closure: InventoryClosureInput) => saveDatedClosure('inventoryClosures', closure.weekStart, { ...closure, status: closure.status ?? 'draft' } as unknown as Record<string, unknown>),
  async getInventoryResolutions(closureId: string) {
    const snapshot = await get(ref(requireDatabase(), businessPath(`inventoryResolutions/${closureId}`)))

    return snapshot.exists() ? Object.values(snapshot.val() as Record<string, InventoryResolution>) : []
  },
  async finalizeInventory(closure: InventoryClosureInput) {
    const database = requireDatabase()
    const closureId = closure.weekStart
    const currentClosure = await get(ref(database, businessPath(`inventoryClosures/${closureId}`)))
    if (currentClosure.child('status').val() === 'finalized')
      throw new Error('Este cierre ya fue finalizado y no puede modificarse.')

    const productIds = Object.keys(closure.items)
    const productSnapshots = await Promise.all(productIds.map(id => get(ref(database, businessPath(`products/${id}`)))))
    const now = Date.now()
    const adjustments: Record<string, InventoryAdjustment> = {}
    const updates: Record<string, unknown> = {}

    for (const [index, productId] of productIds.entries()) {
      const productSnapshot = productSnapshots[index]!
      if (!productSnapshot.exists())
        throw new Error('Uno de los productos dejó de existir. Actualiza el conteo.')
      const product = productSnapshot.val() as Product
      const item = closure.items[productId]!
      if (Number(product.stock) !== Number(item.systemStock))
        throw new Error(`El stock de ${item.name} cambió durante el conteo. Actualiza antes de finalizar.`)

      adjustments[productId] = {
        id: `${closureId}-${productId}`,
        productId,
        closureId,
        stockBefore: item.systemStock,
        countedStock: item.countedStock,
        varianceUnits: item.variance,
        unitCostSnapshot: item.unitCost,
        createdBy: closure.closedBy,
        createdAt: now,
      }
      updates[`products/${productId}/stock`] = item.countedStock
      updates[`products/${productId}/inventoryReconciliations/${closureId}`] = now
      updates[`products/${productId}/updatedAt`] = now
    }

    updates[`inventoryClosures/${closureId}`] = {
      ...closure,
      id: closureId,
      status: 'finalized',
      adjustments,
      finalizedAt: now,
      createdAt: currentClosure.child('createdAt').val() ?? now,
      updatedAt: now,
    }
    await update(ref(database, businessPath('')), updates)

    return closureId
  },
  async resolveInventory(closureId: string, adjustmentId: string, command: { kind: InventoryResolutionKind; units: number; amount?: number; method?: PaymentMethod; reference?: string; reason: string }, actorUid: string) {
    const database = requireDatabase()
    const closureSnapshot = await get(ref(database, businessPath(`inventoryClosures/${closureId}`)))
    if (!closureSnapshot.exists() || closureSnapshot.child('status').val() !== 'finalized')
      throw new Error('Sólo se pueden resolver ajustes de un cierre finalizado.')
    const closure = closureSnapshot.val() as InventoryClosure
    const adjustment = Object.values(closure.adjustments ?? {}).find(item => item.id === adjustmentId)
    if (!adjustment)
      throw new Error('No se encontró el ajuste de inventario.')
    const resolutionId = push(ref(database, businessPath(`inventoryClosures/${closureId}/resolutions`))).key
    if (!resolutionId)
      throw new Error('No fue posible generar la resolución.')
    const resolutionsSnapshot = await get(ref(database, businessPath(`inventoryResolutions/${closureId}`)))
    const existing = resolutionsSnapshot.exists() ? Object.values(resolutionsSnapshot.val() as Record<string, ReturnType<typeof buildInventoryResolution>>).filter(item => item.adjustmentId === adjustmentId) : []
    const resolution = buildInventoryResolution(adjustment, existing, { ...command, id: resolutionId }, actorUid, Date.now())

    const updates: Record<string, unknown> = {
      [`inventoryResolutions/${closureId}/${resolutionId}`]: resolution,
    }

    if (resolution.kind === 'found') {
      const productSnapshot = await get(ref(database, businessPath(`products/${resolution.productId}`)))
      if (!productSnapshot.exists())
        throw new Error('El producto dejó de existir; no se aplicó la resolución.')
      updates[`products/${resolution.productId}/stock`] = Number(productSnapshot.child('stock').val() || 0) + resolution.units
      updates[`products/${resolution.productId}/updatedAt`] = resolution.createdAt
      updates[`products/${resolution.productId}/inventoryResolutions/${resolution.id}`] = resolution.createdAt
    }
    if (resolution.kind === 'covered')
      updates[`inventoryRecoveries/${resolution.id}`] = { ...resolution, occurredAt: resolution.createdAt }

    await update(ref(database, businessPath('')), updates)

    return resolution
  },
}
