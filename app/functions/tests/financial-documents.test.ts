/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryNotificationJobStore } from '../src/notifications/jobs.ts'
import { buildCanonicalNotificationDocument } from '../src/notifications/financial-documents.ts'

const now = Date.parse('2026-09-09T15:00:00Z')

const snapshot = {
  name: 'Atleta QA', membership: { agreedAmount: 500, paymentDay: 9 },
  payments: { '2026-09': { totalAmount: 500, balance: 0, status: 'paid', installments: {
    one: { amountApplied: 200, balanceAfter: 300, appliedAt: '2026-09-08T15:00:00Z' },
    two: { amountApplied: 300, balanceAfter: 0, appliedAt: '2026-09-09T15:00:00Z' },
  } } },
  sales: { sale: { athleteId: 'qa', status: 'paid', total: 100, payments: {
    combined: { amountApplied: 100, membershipPeriod: '2026-09', membershipInstallmentId: 'one', appliedAt: '2026-09-08T15:00:00Z' },
  } } },
}

async function receiptJob(key: string) {
  return (await new InMemoryNotificationJobStore().createIfAbsent({
    idempotencyKey: key, type: 'payment-receipt', athleteId: 'qa', reference: 'one',
  }, now)).job
}

test('combined receipt reconstructs every source and preserves the historical installment balance', async () => {
  const job = await receiptJob('membership:qa:2026-09:one')
  const result = buildCanonicalNotificationDocument(job, snapshot, now)

  assert.equal(result?.kind, 'receipt')
  assert.equal(result?.amountPaid, 300)
  assert.equal(result?.balance, 300)
  assert.equal(result?.lines.length, 2)
  assert.equal(result?.issuedAt, '2026-09-08T15:00:00.000Z')
  assert.deepEqual(result, buildCanonicalNotificationDocument({ ...job, idempotencyKey: 'combined:qa:2026-09:one' }, snapshot, now))
})

test('a grouped collection includes payments across sales without duplicating their balances', async () => {
  const job = await receiptJob('sale-group:group-one')

  const result = buildCanonicalNotificationDocument(job, { ...snapshot, sales: {
    a: { athleteId: 'qa', status: 'credit', total: 100, payments: {
      p: { amountApplied: 20, appliedAt: '2026-09-07T15:00:00Z' },
      q: { amountApplied: 30, appliedAt: '2026-09-08T15:00:00Z', groupPaymentId: 'group-one' },
    } },
    b: { athleteId: 'qa', status: 'paid', total: 40, payments: {
      r: { amountApplied: 40, appliedAt: '2026-09-08T15:00:00Z', groupPaymentId: 'group-one' },
    } },
  } }, now)

  assert.equal(result?.amountPaid, 70)
  assert.equal(result?.balance, 50)
  assert.equal(result?.lines.length, 2)
})

test('a sale installment receipt ignores payments applied later', async () => {
  const job = await receiptJob('sale-payment:sale:one')

  const result = buildCanonicalNotificationDocument(job, { ...snapshot, sales: {
    sale: { athleteId: 'qa', status: 'paid', total: 100, payments: {
      one: { amountApplied: 25, appliedAt: '2026-09-08T15:00:00Z' },
      two: { amountApplied: 75, appliedAt: '2026-09-09T15:00:00Z' },
    } },
  } }, now)

  assert.equal(result?.amountPaid, 25)
  assert.equal(result?.balance, 75)
})

test('missing, cancelled or foreign operations do not produce receipts', async () => {
  const job = await receiptJob('sale-payment:sale:combined')

  assert.equal(buildCanonicalNotificationDocument(job, { ...snapshot, sales: {} }, now), null)
  for (const changed of [{ ...snapshot.sales.sale, status: 'cancelled' }, { ...snapshot.sales.sale, athleteId: 'other' }])
    assert.equal(buildCanonicalNotificationDocument(job, { ...snapshot, sales: { sale: changed } }, now), null)
})

test('a queued reminder rechecks the current balance and does not bill a settled debt', async () => {
  const job = (await new InMemoryNotificationJobStore().createIfAbsent({
    idempotencyKey: 'reminder:qa:2026-09-09:daily', type: 'payment-reminder', athleteId: 'qa',
    reference: 'reminder:2026-09-09:due:2026-09',
  }, now)).job

  assert.equal(buildCanonicalNotificationDocument(job, snapshot, now), null)

  const result = buildCanonicalNotificationDocument(job, { ...snapshot, payments: {
    '2026-09': { totalAmount: 500, balance: 150, status: 'pending' },
  } }, now)

  assert.equal(result?.kind, 'reminder')
  assert.equal(result?.balance, 150)
  assert.equal(result?.isProofOfPayment, false)
})

test('initial sale receipt contains only its own item details', async () => {
  const job = await receiptJob('sale-initial:sale')

  const result = buildCanonicalNotificationDocument(job, { ...snapshot, sales: {
    sale: { ...snapshot.sales.sale, createdAt: '2026-09-08T15:00:00Z', items: {
      item: { name: 'Articulo QA', quantity: 2, unitPrice: 50 },
    } },
  } }, now)

  assert.equal(result?.amountPaid, 100)
  assert.equal(result?.balance, 0)
  assert.deepEqual(result?.lines, [{ description: '2 x Articulo QA', amount: 100 }])
})

test('combined receipt uses applied installment methods rather than the latest payment method', async () => {
  const job = await receiptJob('membership:qa:2026-09:one')
  const financial = structuredClone(snapshot)

  const payment = { ...financial.payments['2026-09'], method: 'card', installments: {
    one: { ...financial.payments['2026-09'].installments.one, method: 'cash' },
    two: { ...financial.payments['2026-09'].installments.two, method: 'transfer' },
  } }

  const combined = { ...financial.sales.sale.payments.combined, method: 'cash' }

  const data = { ...financial, payments: { '2026-09': payment }, sales: {
    sale: { ...financial.sales.sale, payments: { combined } },
  } }

  const result = buildCanonicalNotificationDocument(job, data, now)

  assert.ok(result?.kind === 'receipt')
  assert.equal(result.method, 'cash')
  combined.method = 'transfer'

  const mixed = buildCanonicalNotificationDocument(job, data, now)

  assert.ok(mixed?.kind === 'receipt')
  assert.equal(mixed.method, null)

  const missing = buildCanonicalNotificationDocument(job, snapshot, now)

  assert.ok(missing?.kind === 'receipt')
  assert.equal(missing.method, null)
})

test('sale installment and grouped receipt methods exclude unrelated later payments', async () => {
  const data = { ...snapshot, sales: {
    a: { athleteId: 'qa', status: 'paid', total: 100, payments: {
      first: { amountApplied: 20, appliedAt: '2026-09-08T15:00:00Z', method: 'card', groupPaymentId: 'group' },
      later: { amountApplied: 80, appliedAt: '2026-09-09T15:00:00Z', method: 'cash' },
    } },
    b: { athleteId: 'qa', status: 'paid', total: 40, payments: {
      first: { amountApplied: 40, appliedAt: '2026-09-08T15:00:00Z', method: 'card', groupPaymentId: 'group' },
    } },
  } }

  for (const key of ['sale-payment:a:first', 'sale-group:group']) {
    const result = buildCanonicalNotificationDocument(await receiptJob(key), data, now)

    assert.ok(result?.kind === 'receipt')
    assert.equal(result.method, 'card')
  }
})

test('initial sale method is known only when all source payments agree', async () => {
  const job = await receiptJob('sale-initial:sale')
  for (const [methods, expected] of [
    [['cash', 'cash'], 'cash'], [['cash', 'card'], null], [['cash', undefined], null], [['constructor'], null],
  ] as const) {
    const result = buildCanonicalNotificationDocument(job, { ...snapshot, sales: {
      sale: { athleteId: 'qa', status: 'paid', total: 100, createdAt: '2026-09-08T15:00:00Z',
        items: { one: { name: 'Artículo QA', quantity: 1, unitPrice: 100 } },
        payments: Object.fromEntries(methods.map((method, index) => [String(index), { amountApplied: 100 / methods.length, method }])),
      },
    } }, now)

    assert.ok(result?.kind === 'receipt')
    assert.equal(result.method, expected)
  }
})
