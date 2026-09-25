import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Athlete, Sale } from '../src/types/domain'
import { buildStoreDebtStatement, eligibleStoreDebtSales } from '../src/utils/store-debt-statement'

const timestamp = new Date('2026-09-24T12:00:00-06:00').getTime()

const athlete = {
  id: 'athlete-1',
  status: 'active',
  profile: { name: 'Atleta Prueba', birthDate: '1990-01-01', phone: '5500000000', email: '', emergencyContact: { name: '', phone: '', relationship: '' } },
  membership: { planId: 'plan', agreedAmount: 500, paymentDay: 10, registrationDate: '2026-01-01' },
  createdAt: timestamp,
  updatedAt: timestamp,
} as Athlete

function sale(id: string, total: number, paid: number, status: Sale['status'] = 'credit'): Sale {
  return {
    id,
    athleteId: athlete.id,
    customerName: athlete.profile.name,
    items: { [`item-${id}`]: { productId: `product-${id}`, name: `Producto ${id}`, quantity: 1, unitPrice: total, unitCost: total / 2 } },
    total,
    status,
    payments: paid ? { [`payment-${id}`]: { id: `payment-${id}`, amountApplied: paid, method: 'cash', appliedAt: timestamp } } : {},
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

test('construye un estado exclusivo de tienda con totales reconciliados', () => {
  const statement = buildStoreDebtStatement({ athlete, sales: [sale('one', 120, 20), sale('two', 80, 30)], issuedAt: timestamp })

  assert.equal(statement.kind, 'store-statement')
  assert.equal(statement.total, 200)
  assert.equal(statement.amountPaid, 50)
  assert.equal(statement.balance, 150)
  assert.equal(statement.phone, undefined)
  assert.equal(statement.lines.length, 2)
  assert.equal(statement.lines.reduce((sum, line) => sum + line.amount, 0), 150)
  assert.doesNotMatch(JSON.stringify(statement), /mensualidad|visitas/i)
})

test('seleccionar todos excluye ventas canceladas, liquidadas y de otro atleta', () => {
  const open = sale('open', 100, 10)
  const reversed = sale('reversed', 50, 50, 'paid')

  reversed.paymentAdjustments = {
    'reversal-payment-reversed': {
      id: 'reversal-payment-reversed', saleId: reversed.id, paymentId: 'payment-reversed', kind: 'reversal', amount: 50,
      reason: 'Cobro incorrecto', createdBy: 'admin', createdAt: timestamp + 1,
    },
  }

  const other = { ...sale('other', 100, 0), athleteId: 'athlete-2' }

  assert.deepEqual(eligibleStoreDebtSales(athlete.id, [open, sale('paid', 100, 100, 'paid'), sale('cancelled', 100, 0, 'cancelled'), reversed, other]).map(item => item.id), ['open', 'reversed'])
})

test('rechaza selecciones vacías o mezcladas', () => {
  assert.throws(() => buildStoreDebtStatement({ athlete, sales: [], issuedAt: timestamp }), /selecciona/i)
  assert.throws(() => buildStoreDebtStatement({ athlete, sales: [{ ...sale('other', 100, 0), athleteId: 'athlete-2' }], issuedAt: timestamp }), /mismo atleta/i)
})
