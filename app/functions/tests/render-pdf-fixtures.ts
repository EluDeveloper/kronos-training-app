/* eslint-disable import/extensions */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createPaymentNotificationPdf, type BackendPaymentNotificationDocument } from '../src/pdf/payment-receipts.ts'
import { InMemoryNotificationJobStore } from '../src/notifications/jobs.ts'
import { buildCanonicalNotificationDocument } from '../src/notifications/financial-documents.ts'

const directory = new URL('../../test-results/pdf-e8/', import.meta.url)

mkdirSync(directory, { recursive: true })

const base = {
  folio: 'QA-PAGINACION-20260908', customerName: 'José Muñoz - Atleta sintético QA',
  issuedAt: '2026-09-09T02:30:00.000Z', concept: 'Mensualidad y artículos de tienda',
  total: 500, balance: 500,
  lines: Array.from({ length: 20 }, (_, index) => ({
    description: `Concepto ${String(index + 1).padStart(2, '0')}: ` + 'detalle de artículo y período '.repeat(6), amount: 25,
  })),
}

const fixtures: Array<[string, BackendPaymentNotificationDocument]> = [
  ['receipt', { ...base, kind: 'receipt' as const, title: 'RECIBO' as const,
    lines: [{ description: 'Inscripción y mensualidad de septiembre', amount: 500 }],
    method: 'transfer', amountPaid: 500, balance: 0, isProofOfPayment: true as const }],
  ['reminder-long', { ...base, kind: 'reminder' as const, title: 'AVISO DE PAGO' as const,
    amountPaid: 0 as const, dueDate: '2026-09-09', isProofOfPayment: false as const,
    disclaimer: 'Documento informativo - no es comprobante de pago' as const }],
]

const issuedAt = Date.parse(base.issuedAt)

const { job } = await new InMemoryNotificationJobStore().createIfAbsent({
  idempotencyKey: 'combined:qa:2026-09:one', type: 'payment-receipt', athleteId: 'qa', reference: 'one',
}, issuedAt)

const combined = buildCanonicalNotificationDocument(job, {
  name: base.customerName, membership: { agreedAmount: 500, paymentDay: 9 },
  payments: { '2026-09': { totalAmount: 500, balance: 300, status: 'pending', installments: {
    one: { amountApplied: 200, balanceAfter: 300, method: 'cash', appliedAt: issuedAt },
  } } },
  sales: { 'qa-articulos': { athleteId: 'qa', status: 'paid', total: 100, payments: {
    one: { amountApplied: 100, method: 'cash', appliedAt: issuedAt, membershipPeriod: '2026-09', membershipInstallmentId: 'one' },
  } } },
}, issuedAt)

if (!combined)
  throw new Error('Synthetic combined receipt is missing')
fixtures.push(['receipt-combined', combined])

for (const [filename, document] of fixtures) {
  writeFileSync(new URL(`${filename}.pdf`, directory), createPaymentNotificationPdf(document).bytes)
}
