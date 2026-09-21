/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  createPaymentNotificationPdf,
  type BackendPaymentNotificationDocument,
} from '../src/pdf/payment-receipts.ts'

const receipt: BackendPaymentNotificationDocument = {
  kind: 'receipt',
  title: 'RECIBO',
  folio: 'MEM-202605-123456',
  customerName: 'Ana López',
  issuedAt: '2026-05-28T15:00:00.000Z',
  concept: 'Mensualidad 2026-05',
  lines: [{ description: 'Mensualidad 2026-05', amount: 500 }],
  total: 500,
  amountPaid: 500,
  balance: 0,
  isProofOfPayment: true,
}

const reminder: BackendPaymentNotificationDocument = {
  kind: 'reminder',
  title: 'AVISO DE PAGO',
  folio: 'COB-202605-123456',
  customerName: 'Ana López',
  issuedAt: '2026-05-25T15:00:00.000Z',
  concept: 'Estado de cuenta 2026-05',
  dueDate: '2026-05-28',
  lines: [
    { description: 'Mensualidad 2026-05', amount: 500 },
    { description: 'Tienda', amount: 125.5 },
  ],
  total: 625.5,
  amountPaid: 0,
  balance: 625.5,
  isProofOfPayment: false,
  disclaimer: 'Documento informativo - no es comprobante de pago',
}

test('backend receipt PDF is deterministic, A5, hashed, and safe to name', () => {
  const first = createPaymentNotificationPdf(receipt)
  const second = createPaymentNotificationPdf(receipt)

  assert.deepEqual(first.bytes, second.bytes)
  assert.equal(first.sha256, createHash('sha256').update(first.bytes).digest('hex'))
  assert.equal(first.filename, 'payment-receipt-MEM-202605-123456.pdf')
  assert.equal(new TextDecoder().decode(first.bytes).startsWith('%PDF-1.7'), true)
  assert.match(new TextDecoder().decode(first.bytes), /\/MediaBox \[0 0 419\.53 595\.28\]/)
})

test('reminder PDF is visibly informational and excludes sensitive fields', () => {
  const result = createPaymentNotificationPdf(reminder)
  const text = new TextDecoder().decode(result.bytes)

  assert.equal(result.filename, 'payment-reminder-COB-202605-123456.pdf')
  assert.match(text, /AVISO DE PAGO/)
  assert.match(text, /Documento informativo - no es comprobante de pago/)
  for (const forbidden of ['healthHistory', 'athleteIntake', 'emergencyContact', 'kioskCode', 'accessToken'])
    assert.equal(text.includes(forbidden), false, `PDF must not contain ${forbidden}`)
})

test('long payment details paginate and retain every line, totals and page numbers', () => {
  const document = { ...receipt,
    customerName: 'Atleta de prueba con un nombre largo '.repeat(5).trim(),
    lines: Array.from({ length: 20 }, (_, index) => ({
      description: `Concepto ${String(index).padStart(2, '0')} ` + 'detalle extenso '.repeat(14),
      amount: 25,
    })),
  }

  const pdf = Buffer.from(createPaymentNotificationPdf(document).bytes).toString('latin1')
  const pages = [...pdf.matchAll(/\/Type \/Page\b/g)].length

  assert.ok(pages > 1)
  assert.match(pdf, /Saldo/)
  for (let index = 0; index < 20; index += 1)
    assert.ok(pdf.includes(`Concepto ${String(index).padStart(2, '0')}`))
  for (let page = 1; page <= pages; page += 1)
    assert.ok(pdf.includes(`Página ${page} / ${pages}`))
  assert.deepEqual(createPaymentNotificationPdf(document).bytes, createPaymentNotificationPdf(document).bytes)
})

test('each reminder page identifies the document as informational', () => {
  const document = { ...reminder,
    lines: Array.from({ length: 20 }, () => ({ description: 'Detalle de adeudo '.repeat(14), amount: 10 })),
  }

  const pdf = Buffer.from(createPaymentNotificationPdf(document).bytes).toString('ascii')
  const pages = [...pdf.matchAll(/\/Type \/Page\b/g)].length

  assert.ok(pages > 1)
  assert.equal([...pdf.matchAll(/AVISO DE PAGO/g)].length, pages)
  assert.equal([...pdf.matchAll(/Documento informativo - no es comprobante de pago/g)].length, pages)
})

test('receipt rejects invalid applied amounts', () => {
  for (const amountPaid of [-1, NaN, Infinity])
    assert.throws(() => createPaymentNotificationPdf({ ...receipt, amountPaid }))
})

test('PDF preserves Spanish accents and escapes literal-string delimiters', () => {
  const document = { ...receipt, customerName: 'Jose\u0301 Muñoz (QA) \\ Peña', concept: 'Inscripción y nutrición',
    lines: [{ description: 'Artículo: proteína y pingüino', amount: 500 }] }

  const pdf = Buffer.from(createPaymentNotificationPdf(document).bytes).toString('latin1')

  assert.ok(pdf.includes('José Muñoz \\(QA\\) \\\\ Peña'))
  assert.ok(pdf.includes('Inscripción y nutrición'))
  assert.ok(pdf.includes('Artículo: proteína y pingüino'))
  assert.ok(pdf.includes('Página 1 / 1'))
  assert.ok(pdf.includes('/Encoding /WinAnsiEncoding'))
})

test('PDF dates use Mexico City calendar and clock rather than UTC or host time', () => {
  for (const issuedAt of ['2026-09-09T02:30:00.000Z', Date.parse('2026-09-09T02:30:00.000Z')]) {
    const pdf = Buffer.from(createPaymentNotificationPdf({ ...receipt, issuedAt }).bytes).toString('latin1')

    assert.ok(pdf.includes('Fecha: 08/09/2026 20:30'))
    assert.ok(pdf.includes('America/Mexico_City'))
    assert.equal(pdf.includes('2026-09-09T02:30:00.000Z'), false)
  }
})

test('accented PDF retains correct byte offsets and stream lengths', () => {
  const bytes = Buffer.from(createPaymentNotificationPdf({ ...receipt,
    customerName: 'ÁÉÍÓÚ áéíóú Ññ Üü',
    lines: Array.from({ length: 20 }, () => ({ description: 'Inscripción y proteína '.repeat(10), amount: 25 })),
  }).bytes)

  const pdf = bytes.toString('latin1')
  const xrefOffset = Number(/startxref\n(\d+)/.exec(pdf)![1])

  assert.equal(bytes.subarray(xrefOffset, xrefOffset + 4).toString(), 'xref')

  const entries = pdf.slice(xrefOffset).split('\n').slice(3).filter(line => /^\d{10} 00000 n /.test(line))

  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10))

    assert.ok(bytes.subarray(offset).toString('latin1').startsWith(`${index + 1} 0 obj\n`))
  })
  for (const match of pdf.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const contentStart = match.index + match[0].length

    assert.equal(pdf.slice(contentStart + Number(match[1]), contentStart + Number(match[1]) + 9), 'endstream')
  }
  assert.ok(pdf.includes('Inscripción y proteína'))
})

test('receipts show canonical method labels without inventing unspecified methods', () => {
  const cases = [
    ['cash', 'Efectivo'],
    ['transfer', 'Transferencia'],
    ['card', 'Tarjeta'],
    ['other', 'Otro'],
    ['store-credit', 'Saldo a favor'],
    [null, 'No especificado'],
  ] as const

  for (const [method, label] of cases) {
    const pdf = Buffer.from(createPaymentNotificationPdf({ ...receipt, method }).bytes).toString('latin1')

    assert.ok(pdf.includes(`Método: ${label}`))
  }
  const pdf = Buffer.from(createPaymentNotificationPdf(receipt).bytes).toString('latin1')

  assert.ok(pdf.includes('Método: No especificado'))

  const notice = Buffer.from(createPaymentNotificationPdf(reminder).bytes).toString('latin1')

  assert.equal(notice.includes('Método:'), false)
})

test('unknown payment methods are rejected and unsupported glyphs cannot inject PDF commands', () => {
  for (const method of ['raw-private-value', '__proto__', 'constructor'])
    assert.throws(() => createPaymentNotificationPdf({ ...receipt, method: method as never }))
  const pdf = Buffer.from(createPaymentNotificationPdf({ ...receipt, customerName: 'José\u202e🙂 (QA)' }).bytes).toString('latin1')

  assert.ok(pdf.includes('José?? \\(QA\\)'))
})

test('canonical receipt folio fits one header line without an orphan character', () => {
  const folio = `REC-${'A'.repeat(32)}`
  const pdf = Buffer.from(createPaymentNotificationPdf({ ...receipt, folio }).bytes).toString('latin1')

  assert.ok(pdf.includes(`(${folio}) Tj`))
})
