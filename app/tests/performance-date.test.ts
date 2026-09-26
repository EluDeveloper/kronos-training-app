import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCalendarDate } from '../src/utils/kronos'

test('muestra la fecha calendario del PR sin desplazamiento por zona horaria', () => {
  assert.equal(formatCalendarDate('2026-09-26'), '26/9/2026')
})
