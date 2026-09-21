import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectMembershipPaymentEvents,
  detectSalePaymentEvents,
  type PaymentAppliedEvent,
} from '../src/notifications/payment-events.ts'

test('membership event requires a new applied installment and ignores updatedAt-only writes', () => {
  const before = {
    updatedAt: 100,
    installments: {
      'installment-1': { status: 'pending', amountApplied: 0 },
    },
  }
  const after = {
    updatedAt: 200,
    installments: {
      'installment-1': { status: 'paid', amountApplied: 500, appliedAt: 200 },
    },
  }

  const events = detectMembershipPaymentEvents({
    athleteId: 'athlete-1',
    period: '2026-09',
    before,
    after,
  })

  assert.deepEqual(events[0], {
    kind: 'membership',
    correlationKey: 'membership:athlete-1:2026-09:installment-1',
    athleteId: 'athlete-1',
    referenceId: 'installment-1',
    period: '2026-09',
    amountApplied: 500,
    occurredAt: 200,
  } satisfies PaymentAppliedEvent)
  assert.deepEqual(detectMembershipPaymentEvents({
    athleteId: 'athlete-1',
    period: '2026-09',
    before: after,
    after: { ...after, updatedAt: 300 },
  }), [])
})

test('legacy membership records without installment identity are skipped as ambiguous', () => {
  assert.deepEqual(detectMembershipPaymentEvents({
    athleteId: 'athlete-1',
    period: '2026-09',
    before: { status: 'pending', amountApplied: 0 },
    after: { status: 'paid', amountApplied: 500 },
  }), [])
})

test('paid sale with multiple technical payments creates one sale-initial event', () => {
  const events = detectSalePaymentEvents({
    saleId: 'sale-1',
    before: null,
    after: {
      athleteId: 'athlete-1',
      status: 'paid',
      total: 800,
      payments: {
        'payment-1': { amountApplied: 500 },
        'payment-2': { amountApplied: 300 },
      },
    },
  })

  assert.equal(events.length, 1)
  assert.equal(events[0]?.kind, 'sale-initial')
  assert.equal(events[0]?.correlationKey, 'sale-initial:sale-1')
})

test('group payment and combined payment references converge to one key', () => {
  const groupEvents = detectSalePaymentEvents({
    saleId: 'sale-1',
    before: { status: 'credit', payments: {} },
    after: {
      athleteId: 'athlete-1',
      status: 'credit',
      payments: {
        'payment-1': { amountApplied: 200, groupPaymentId: 'group-1' },
        'payment-2': { amountApplied: 100, groupPaymentId: 'group-1' },
      },
    },
  })
  assert.equal(groupEvents.length, 1)
  assert.equal(groupEvents[0]?.correlationKey, 'sale-group:group-1')

  const combinedEvents = detectSalePaymentEvents({
    saleId: 'sale-2',
    before: { status: 'credit', payments: {} },
    after: {
      athleteId: 'athlete-1',
      status: 'credit',
      payments: {
        'payment-3': {
          amountApplied: 250,
          membershipPeriod: '2026-09',
          membershipInstallmentId: 'installment-1',
        },
      },
    },
  })
  assert.equal(combinedEvents[0]?.correlationKey, 'combined:athlete-1:2026-09:installment-1')
})

test('settling a credit sale keeps its combined correlation after status becomes paid', () => {
  const events = detectSalePaymentEvents({
    saleId: 'sale-3',
    before: { status: 'credit', payments: {} },
    after: {
      athleteId: 'athlete-1',
      status: 'paid',
      payments: {
        'payment-4': {
          amountApplied: 250,
          membershipPeriod: '2026-09',
          membershipInstallmentId: 'installment-1',
        },
      },
    },
  })

  assert.equal(events.length, 1)
  assert.equal(events[0]?.kind, 'combined')
  assert.equal(events[0]?.correlationKey, 'combined:athlete-1:2026-09:installment-1')
})

test('sale updates without an applied payment transition do not create events', () => {
  assert.deepEqual(detectSalePaymentEvents({
    saleId: 'sale-1',
    before: { status: 'credit', updatedAt: 100, payments: { 'payment-1': { amountApplied: 200 } } },
    after: { status: 'credit', updatedAt: 200, payments: { 'payment-1': { amountApplied: 200 } } },
  }), [])
})
