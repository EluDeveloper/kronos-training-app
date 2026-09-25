import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Sale, SalePaymentAdjustment, StoreCreditAccount } from '../src/types/domain'
import {
  buildSalePaymentAdjustment,
  buildStoreCreditReversalPlan,
  effectiveSaleAppliedAmount,
  effectiveSaleBalance,
  effectiveSalePayments,
  effectiveSaleStatus,
  resolveSalePaymentStates,
} from '../src/utils/store-payment-adjustments'

const timestamp = new Date('2026-09-24T12:00:00-06:00').getTime()

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'sale-1',
    athleteId: 'athlete-1',
    customerName: 'Atleta de prueba',
    items: {
      item: { productId: 'product-1', name: 'Playera', quantity: 1, unitPrice: 120, unitCost: 60 },
    },
    total: 120,
    status: 'paid',
    payments: {
      payment: {
        id: 'payment',
        amountApplied: 120,
        method: 'cash',
        receivedAmount: 120,
        changeGiven: 0,
        groupPaymentId: 'group-1',
        appliedAt: timestamp,
      },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function withAdjustment(current: Sale, adjustment: SalePaymentAdjustment): Sale {
  return {
    ...current,
    paymentAdjustments: {
      ...(current.paymentAdjustments ?? {}),
      [adjustment.id]: adjustment,
    },
  }
}

test('un cambio de método conserva importe y expone el método efectivo', () => {
  const original = sale()

  const adjustment = buildSalePaymentAdjustment(original, {
    id: 'adjustment-1',
    paymentId: 'payment',
    kind: 'method-change',
    toMethod: 'transfer',
    reason: 'Se confirmó la transferencia bancaria',
    createdBy: 'admin-1',
    createdAt: timestamp + 1,
  })

  const corrected = withAdjustment(original, adjustment)

  assert.equal(adjustment.fromMethod, 'cash')
  assert.equal(adjustment.toMethod, 'transfer')
  assert.equal(adjustment.groupPaymentId, 'group-1')
  assert.equal(effectiveSalePayments(corrected)[0]?.method, 'transfer')
  assert.equal(effectiveSaleAppliedAmount(corrected), 120)
  assert.equal(effectiveSaleBalance(corrected), 0)
  assert.equal(effectiveSaleStatus(corrected), 'paid')
})

test('los cambios de método se aplican en orden determinista', () => {
  const first = buildSalePaymentAdjustment(sale(), {
    id: 'b-adjustment',
    paymentId: 'payment',
    kind: 'method-change',
    toMethod: 'transfer',
    reason: 'Primera corrección autorizada',
    createdBy: 'admin-1',
    createdAt: timestamp + 1,
  })

  const afterFirst = withAdjustment(sale(), first)

  const second = buildSalePaymentAdjustment(afterFirst, {
    id: 'a-adjustment',
    paymentId: 'payment',
    kind: 'method-change',
    toMethod: 'card',
    reason: 'Segunda corrección autorizada',
    createdBy: 'admin-1',
    createdAt: timestamp + 2,
  })

  const corrected = withAdjustment(afterFirst, second)

  assert.equal(resolveSalePaymentStates(corrected)[0]?.effectiveMethod, 'card')
})

test('un reverso reactiva exactamente el saldo del pago original', () => {
  const original = sale()

  const reversal = buildSalePaymentAdjustment(original, {
    id: 'reversal-1',
    paymentId: 'payment',
    kind: 'reversal',
    reason: 'Cobro aplicado al atleta equivocado',
    createdBy: 'admin-1',
    createdAt: timestamp + 1,
  })

  const reversed = withAdjustment(original, reversal)

  assert.equal(reversal.amount, 120)
  assert.equal(effectiveSalePayments(reversed).length, 0)
  assert.equal(effectiveSaleAppliedAmount(reversed), 0)
  assert.equal(effectiveSaleBalance(reversed), 120)
  assert.equal(effectiveSaleStatus(reversed), 'credit')
  assert.equal(resolveSalePaymentStates(reversed)[0]?.reversed, true)
})

test('rechaza doble reverso, pago desconocido, motivo vacío y cambio sin efecto', () => {
  const original = sale()

  const reversal = buildSalePaymentAdjustment(original, {
    id: 'reversal-1',
    paymentId: 'payment',
    kind: 'reversal',
    reason: 'Corrección administrativa',
    createdBy: 'admin-1',
    createdAt: timestamp + 1,
  })

  const reversed = withAdjustment(original, reversal)

  assert.throws(() => buildSalePaymentAdjustment(reversed, {
    id: 'reversal-2', paymentId: 'payment', kind: 'reversal', reason: 'Otro reverso', createdBy: 'admin-1', createdAt: timestamp + 2,
  }), /ya fue revertido/i)
  assert.throws(() => buildSalePaymentAdjustment(original, {
    id: 'unknown', paymentId: 'missing', kind: 'reversal', reason: 'Corrección', createdBy: 'admin-1', createdAt: timestamp + 2,
  }), /no existe/i)
  assert.throws(() => buildSalePaymentAdjustment(original, {
    id: 'empty', paymentId: 'payment', kind: 'reversal', reason: '  ', createdBy: 'admin-1', createdAt: timestamp + 2,
  }), /motivo/i)
  assert.throws(() => buildSalePaymentAdjustment(original, {
    id: 'same', paymentId: 'payment', kind: 'method-change', toMethod: 'cash', reason: 'Sin cambio', createdBy: 'admin-1', createdAt: timestamp + 2,
  }), /método/i)
})

test('una venta cancelada conserva su estado aunque sus pagos sean efectivos', () => {
  const cancelled = sale({ status: 'cancelled', cancelledAt: timestamp })

  assert.equal(effectiveSaleStatus(cancelled), 'cancelled')
})

test('un reverso descuenta el excedente original del saldo a favor y deja un movimiento auditable', () => {
  const original = sale({
    payments: {
      payment: {
        id: 'payment', amountApplied: 120, method: 'cash', creditBalance: 50, appliedAt: timestamp,
      },
    },
  })

  const account: StoreCreditAccount = {
    athleteId: 'athlete-1', balance: 70,
    entries: {
      'deposit-payment': {
        id: 'deposit-payment', type: 'deposit', amount: 50, saleId: original.id,
        description: 'Excedente', occurredAt: timestamp, balanceAfter: 50,
      },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const plan = buildStoreCreditReversalPlan([{ sale: original, paymentId: 'payment' }], account, timestamp + 1, 'operation-1', 'admin-1')

  assert.equal(plan?.balance, 20)
  assert.deepEqual(plan?.entries.map(entry => [entry.type, entry.amount, entry.balanceAfter]), [['reversal', 50, 20]])
})

test('un reverso falla cerrado si el excedente ya fue consumido', () => {
  const original = sale({
    payments: {
      payment: {
        id: 'payment', amountApplied: 120, method: 'cash', creditBalance: 50, appliedAt: timestamp,
      },
    },
  })

  const account: StoreCreditAccount = {
    athleteId: 'athlete-1', balance: 25,
    entries: {
      'deposit-payment': {
        id: 'deposit-payment', type: 'deposit', amount: 50, saleId: original.id,
        description: 'Excedente', occurredAt: timestamp, balanceAfter: 50,
      },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  assert.throws(
    () => buildStoreCreditReversalPlan([{ sale: original, paymentId: 'payment' }], account, timestamp + 1, 'operation-1', 'admin-1'),
    /saldo a favor.*consumido/i,
  )
})
