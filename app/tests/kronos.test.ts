import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeSearchTerm } from '../src/utils/kronos'

test('normaliza una búsqueda nula como texto vacío', () => {
  assert.equal(normalizeSearchTerm(null), '')
})

test('normaliza el texto de búsqueda sin alterar el contenido', () => {
  assert.equal(normalizeSearchTerm('  AtLeTa  '), '  atleta  ')
})
