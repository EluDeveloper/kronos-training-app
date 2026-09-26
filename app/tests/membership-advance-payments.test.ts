import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  allowedMembershipPeriods,
  buildMembershipPeriodSnapshot,
  membershipCollectionState,
  membershipDueDate,
  validateAdvancePeriod,
} from '../src/utils/membership-periods'
import { buildMembershipReceipt } from '../src/utils/receipts'
import { membershipTotalAmount } from '../src/utils/kronos'
import type { Athlete, MembershipPaymentInstallment, Payment } from '../src/types/domain'

test('normaliza el día de corte al último día válido del mes', () => {
  assert.equal(membershipDueDate('2028-02', 31), '2028-02-29')
  assert.equal(membershipDueDate('2027-02', 31), '2027-02-28')
  assert.equal(membershipDueDate('2026-04', 31), '2026-04-30')
  assert.equal(membershipDueDate('2026-09', 15), '2026-09-15')
})

test('permite el periodo vigente y exactamente doce meses futuros', () => {
  const periods = allowedMembershipPeriods(new Date(2026, 8, 24, 12))

  assert.equal(periods.length, 13)
  assert.equal(periods[0], '2026-09')
  assert.equal(periods.at(-1), '2027-09')
  assert.doesNotThrow(() => validateAdvancePeriod('2027-09', new Date(2026, 8, 24, 12)))
  assert.throws(() => validateAdvancePeriod('2027-10', new Date(2026, 8, 24, 12)), /doce meses/i)
})

test('clasifica adelanto parcial sin volverlo vencido antes del corte', () => {
  assert.equal(membershipCollectionState({ dueDate: '2026-10-31', balance: 300, paidAt: new Date(2026, 8, 24, 12).getTime(), today: new Date(2026, 8, 24, 12) }), 'advance')
  assert.equal(membershipCollectionState({ dueDate: '2026-09-30', balance: 300, today: new Date(2026, 8, 24, 12) }), 'pending')
  assert.equal(membershipCollectionState({ dueDate: '2026-09-20', balance: 300, today: new Date(2026, 8, 24, 12) }), 'overdue')
  assert.equal(membershipCollectionState({ dueDate: '2026-09-20', balance: 0, today: new Date(2026, 8, 24, 12) }), 'paid')
})

test('crea un snapshot estable de plan, importe, día y vencimiento', () => {
  assert.deepEqual(buildMembershipPeriodSnapshot({ planId: 'plan-1', agreedAmount: 750, paymentDay: 31 }, '2026-02'), {
    planId: 'plan-1', agreedAmount: 750, paymentDay: 31, dueDate: '2026-02-28',
  })
})

test('el recibo de un adelanto incluye el corte futuro sin fallar', () => {
  const athlete = {
    id: 'athlete-1',
    profile: { name: 'Atleta QA', phone: '5550000000' },
    membership: { planId: 'plan-1', agreedAmount: 500, paymentDay: 25 },
  } as Athlete

  const installment = {
    id: 'installment-1',
    amountApplied: 500,
    balanceAfter: 0,
    method: 'cash',
    appliedAt: new Date(2026, 8, 24, 12).getTime(),
  } as MembershipPaymentInstallment

  const payment = {
    id: 'payment-1',
    athleteId: athlete.id,
    period: '2026-10',
    amount: 500,
    method: 'cash',
    snapshot: { planId: 'plan-1', agreedAmount: 500, paymentDay: 25, dueDate: '2026-10-25' },
    installments: { [installment.id]: installment },
    appliedAt: installment.appliedAt,
    updatedAt: installment.appliedAt,
  } as Payment

  const receipt = buildMembershipReceipt(payment, athlete, 'Plan QA Mensual', installment)

  assert.match(receipt.concept, /Adelanto de mensualidad 2026-10/)
  assert.match(receipt.concept, /corte 25\/10\/2026/)
})

test('el recibo conserva la promoción aplicada y el ahorro del snapshot', () => {
  const athlete = {
    id: 'athlete-1',
    profile: { name: 'Atleta QA', phone: '5550000000' },
    membership: { planId: 'plan-1', agreedAmount: 500, paymentDay: 25 },
  } as Athlete

  const installment = {
    id: 'installment-promo', amountApplied: 400, balanceAfter: 0, method: 'cash', appliedAt: 1,
  } as MembershipPaymentInstallment

  const payment = {
    id: 'payment-promo', athleteId: athlete.id, period: '2026-10', amount: 400, method: 'cash',
    snapshot: {
      planId: 'plan-1', agreedAmount: 400, paymentDay: 25, dueDate: '2026-10-25',
      promotion: {
        promotionId: 'promo-1', name: 'Regreso a clases', discountType: 'percentage',
        discountValue: 20, baseAmount: 500, discountAmount: 100, finalAmount: 400,
      },
    },
    installments: { [installment.id]: installment }, appliedAt: 1, updatedAt: 1,
  } as Payment

  const receipt = buildMembershipReceipt(payment, athlete, 'Plan QA Mensual', installment)

  assert.match(receipt.concept, /Regreso a clases/)
  assert.match(receipt.concept, /ahorro \$100/i)
})

test('el recibo de la última parcialidad distingue el abono actual del pagado previamente', () => {
  const athlete = {
    id: 'athlete-1', profile: { name: 'Atleta QA' },
    membership: { planId: 'plan-1', agreedAmount: 400, paymentDay: 1 },
  } as Athlete

  const first = { id: 'first', amountApplied: 100, balanceAfter: 300, method: 'cash', appliedAt: 1 } as MembershipPaymentInstallment
  const second = { id: 'second', amountApplied: 300, balanceAfter: 0, method: 'cash', appliedAt: 2 } as MembershipPaymentInstallment

  const payment = {
    id: 'payment-1', athleteId: athlete.id, period: '2026-10', status: 'paid',
    amount: 400, totalAmount: 400, balance: 0,
    installments: { first, second }, appliedAt: 2, updatedAt: 2,
  } as Payment

  const receipt = buildMembershipReceipt(payment, athlete, 'Plan QA Mensual', second)

  assert.equal(receipt.total, 400)
  assert.equal(receipt.amountPaid, 300)
  assert.equal(receipt.previousPaid, 100)
  assert.equal(receipt.balance, 0)
})

test('un periodo gratuito conserva total cero y emite constancia sin cobro', () => {
  const athlete = { id: 'athlete-1', profile: { name: 'Atleta QA' }, membership: { planId: 'plan-1', agreedAmount: 500, paymentDay: 1 } } as Athlete

  const payment = {
    athleteId: athlete.id, period: '2026-10', status: 'paid', amount: 0, totalAmount: 0, balance: 0,
    appliedAt: 1, updatedAt: 1,
    snapshot: { planId: 'plan-1', agreedAmount: 0, paymentDay: 1, dueDate: '2026-10-01', promotion: {
      promotionId: 'promo-1', name: 'Mes gratis', discountType: 'fixed-amount', discountValue: 800,
      baseAmount: 500, discountAmount: 500, finalAmount: 0,
    } },
  } as Payment

  assert.equal(membershipTotalAmount(payment, athlete.membership.agreedAmount), 0)

  const receipt = buildMembershipReceipt(payment, athlete, 'Mensual')

  assert.equal(receipt.kind, 'membership-free')
  assert.match(receipt.concept, /Mensualidad gratis/)
  assert.equal(receipt.amountPaid, 0)
  assert.equal(receipt.balance, 0)
  assert.equal(receipt.method, undefined)
})
