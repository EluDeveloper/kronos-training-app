import assert from 'node:assert/strict'
import test from 'node:test'
import { paginateItems } from '../src/utils/table-pagination'

test('pagina el conjunto y corrige páginas fuera de rango', () => {
  const items = Array.from({ length: 31 }, (_, index) => index + 1)

  assert.deepEqual(paginateItems(items, 2, 15), { items: items.slice(15, 30), page: 2, pageSize: 15, pageCount: 3, from: 16, through: 30, total: 31 })
  assert.equal(paginateItems(items, 99, 15).page, 3)
})

test('limita el tamaño a 15, 30 o 50 y describe el estado vacío', () => {
  assert.equal(paginateItems([1, 2], 1, 40).pageSize, 15)
  assert.deepEqual(paginateItems([], 4, 30), { items: [], page: 1, pageSize: 30, pageCount: 1, from: 0, through: 0, total: 0 })
})
