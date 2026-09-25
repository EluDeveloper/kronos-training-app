import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildInventoryReconciliation, buildInventoryResolution } from '../src/utils/inventory-reconciliation'

const products = [
  { id: 'product-1', name: 'Playera', category: 'Ropa', stock: 10, unitCost: 100 },
  { id: 'product-2', name: 'Agua', category: 'Bebida', stock: 5, unitCost: 10 },
]

test('el conteo físico se convierte en el nuevo stock y conserva el ajuste', () => {
  const result = buildInventoryReconciliation(products, { 'product-1': 8, 'product-2': 5 }, 'closure-1', 'admin', 1000)

  assert.equal(result.items['product-1']?.variance, -2)
  assert.equal(result.adjustments['product-1']?.stockBefore, 10)
  assert.equal(result.adjustments['product-1']?.countedStock, 8)
  assert.deepEqual(result.stockUpdates, { 'product-1': 8, 'product-2': 5 })
})

test('dos cierres consecutivos calculan -2 y -2, no acumulan -4', () => {
  const first = buildInventoryReconciliation(products, { 'product-1': 8, 'product-2': 5 }, 'closure-1', 'admin', 1000)
  const nextProducts = products.map(product => ({ ...product, stock: first.stockUpdates[product.id]! }))
  const second = buildInventoryReconciliation(nextProducts, { 'product-1': 6, 'product-2': 5 }, 'closure-2', 'admin', 2000)

  assert.equal(first.items['product-1']?.variance, -2)
  assert.equal(second.items['product-1']?.variance, -2)
})

test('una resolución parcial nunca supera las unidades pendientes', () => {
  const reconciliation = buildInventoryReconciliation(products, { 'product-1': 8, 'product-2': 5 }, 'closure-1', 'admin', 1000)
  const adjustment = reconciliation.adjustments['product-1']!
  const resolution = buildInventoryResolution(adjustment, [], { id: 'resolution-1', kind: 'found', units: 1, reason: 'Se encontró en almacén' }, 'admin', 2000)

  assert.equal(resolution.units, 1)
  assert.equal(resolution.amount, 100)
  assert.throws(() => buildInventoryResolution(adjustment, [resolution], { id: 'resolution-2', kind: 'written-off', units: 2, reason: 'Pérdida' }, 'admin', 3000), /excede/i)
})

test('un faltante cubierto exige método y monto positivo', () => {
  const adjustment = buildInventoryReconciliation(products, { 'product-1': 8, 'product-2': 5 }, 'closure-1', 'admin', 1000).adjustments['product-1']!

  assert.throws(() => buildInventoryResolution(adjustment, [], { id: 'resolution-1', kind: 'covered', units: 1, reason: 'Lo cubrió el responsable' }, 'admin', 2000), /método/i)
  assert.throws(() => buildInventoryResolution(adjustment, [], { id: 'resolution-2', kind: 'covered', units: 1, amount: 0, method: 'cash', reason: 'Lo cubrió el responsable' }, 'admin', 2000), /monto/i)
})
