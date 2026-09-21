/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOptOutPatch, recognizeOptOutKeyword } from '../src/whatsapp/opt-out.ts'

const keywords = ['BAJA', 'STOP', 'CANCELAR', 'NO RECIBIR'] as const
const receivedAt = 1_788_955_200_000

test('recognizes only the four authorized opt-out keywords', () => {
  for (const keyword of keywords)
    assert.equal(recognizeOptOutKeyword(keyword), keyword)
})

test('normalizes ASCII letter case and ordinary spaces only', () => {
  const examples = [
    ['  baja  ', 'BAJA'],
    ['sToP', 'STOP'],
    [' cancelar ', 'CANCELAR'],
    ['   No   ReCiBiR   ', 'NO RECIBIR'],
  ]

  for (const [input, expected] of examples)
    assert.equal(recognizeOptOutKeyword(input), expected)
})

test('enforces the 128-character limit before trimming or collapsing spaces', () => {
  assert.equal(recognizeOptOutKeyword(' '.repeat(124) + 'BAJA'), 'BAJA')
  assert.equal(recognizeOptOutKeyword('NO' + ' '.repeat(119) + 'RECIBIR'), 'NO RECIBIR')
  assert.equal(recognizeOptOutKeyword(' '.repeat(125) + 'BAJA'), null)
  assert.equal(recognizeOptOutKeyword('NO' + ' '.repeat(120) + 'RECIBIR'), null)
  assert.equal(recognizeOptOutKeyword(' '.repeat(10_000) + 'STOP'), null)
})

test('rejects negated, partial, punctuated and unrelated commands', () => {
  const rejected = [
    '',
    '   ',
    'NO QUIERO DARME DE BAJA',
    'BAJA AHORA',
    'BAJAS',
    'STOP!',
    'NO RECIBIR.',
    'CANCELAR?',
    'ALTA',
    'NORECIBIR',
    'NO-RECIBIR',
    'BAJA STOP',
    'BAJA\nSTOP',
    'por favor cancelar',
  ]

  for (const input of rejected) {
    assert.equal(recognizeOptOutKeyword(input), null)
    assert.equal(buildOptOutPatch(input, receivedAt), null)
  }
})

test('rejects controls, invisible characters and Unicode lookalikes without folding them', () => {
  const rejected = [
    '\tBAJA',
    'BAJA\n',
    'BAJA\r',
    'NO\tRECIBIR',
    '\0BAJA',
    '\u00A0BAJA',
    'STOP\u00A0',
    'NO\u2003RECIBIR',
    '\uFEFFBAJA',
    'BA\u200BJA',
    '\u017Ftop',
    'ＳＴＯＰ',
    'BÁJA',
    'BAJA🙂',
    'BAJA\uD800',
  ]

  for (const input of rejected) {
    assert.equal(recognizeOptOutKeyword(input), null)
    assert.equal(buildOptOutPatch(input, receivedAt), null)
  }
})

test('rejects non-string input without invoking coercion or accessing its fields', () => {
  const hostile = new Proxy({}, {
    get() { throw new Error('Untrusted property must not be read') },
  })

  const rejected: unknown[] = [
    null,
    undefined,
    true,
    0,
    1n,
    Symbol('synthetic'),
    ['BAJA'],
    { body: 'BAJA' },
    Object('BAJA'),
    () => 'BAJA',
    hostile,
  ]

  for (const input of rejected) {
    assert.equal(recognizeOptOutKeyword(input), null)
    assert.equal(buildOptOutPatch(input, receivedAt), null)
  }
})

test('builds only the four opt-out fields for both purposes from recognized text', () => {
  for (const keyword of keywords) {
    assert.deepEqual(buildOptOutPatch('  ' + keyword.toLowerCase() + '  ', receivedAt), {
      receiptStatus: 'opted-out',
      reminderStatus: 'opted-out',
      optedOutAt: receivedAt,
      optOutSource: 'webhook',
    })
  }
})

test('accepts non-negative safe integer reception times, including the boundaries', () => {
  for (const timestamp of [0, 1, receivedAt, Number.MAX_SAFE_INTEGER])
    assert.equal(buildOptOutPatch('BAJA', timestamp)?.optedOutAt, timestamp)
})

test('rejects invalid timestamps without coercing them', () => {
  const hostile = new Proxy({}, {
    get() { throw new Error('Timestamp must not be coerced') },
  })

  const rejected: unknown[] = [
    NaN,
    Infinity,
    -Infinity,
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    String(receivedAt),
    null,
    undefined,
    true,
    1n,
    Symbol('timestamp'),
    new Date(receivedAt),
    [receivedAt],
    hostile,
  ]

  for (const timestamp of rejected)
    assert.equal(buildOptOutPatch('BAJA', timestamp), null)
})

test('returns deterministic independent patches without retaining mutable state', () => {
  const first = buildOptOutPatch('baja', receivedAt)
  const second = buildOptOutPatch('  BAJA  ', receivedAt)

  assert.ok(first)
  assert.ok(second)
  assert.deepEqual(first, second)
  assert.notEqual(first, second)
  first.optedOutAt = 0
  assert.equal(second.optedOutAt, receivedAt)
  assert.deepEqual(buildOptOutPatch('BAJA', receivedAt), second)
})
