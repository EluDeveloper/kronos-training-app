import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Sale } from '../src/types/domain'
import { buildStoreReport } from '../src/utils/reporting-store'

const timestamp = (value: string) => new Date(`${value}T12:00:00-06:00`).getTime()
const filters = { from: '2026-08-01', through: '2026-08-31', productIds: [] as string[] }

const sale: Sale = {
  id: 'sale-1', customerName: 'QA', athleteId: 'athlete-1', total: 100, status: 'credit',
  createdAt: timestamp('2026-08-02'), updatedAt: timestamp('2026-08-05'),
  items: {
    p1: { productId: 'p1', name: 'A', quantity: 1, unitPrice: 60, unitCost: 30 },
    p2: { productId: 'p2', name: 'B', quantity: 1, unitPrice: 40, unitCost: 20 },
  },
  payments: {
    paid: { id: 'paid', amountApplied: 30, method: 'cash', appliedAt: timestamp('2026-08-02') },
    recovered: { id: 'recovered', amountApplied: 20, method: 'transfer', appliedAt: timestamp('2026-08-10') },
  },
}

test('consolida productos seleccionados y asigna cobros grupales de forma proporcional', () => {
  const report = buildStoreReport([sale], { ...filters, productIds: ['p2'] })

  assert.equal(report.summary.unitsSold, 1)
  assert.equal(report.summary.recognizedRevenue, 40)
  assert.equal(report.summary.historicalCost, 20)
  assert.equal(report.summary.grossProfit, 20)
  assert.equal(report.summary.collected, 20)
  assert.equal(report.summary.recovered, 8)
  assert.equal(report.summary.receivable, 20)
  assert.equal(report.summary.quality, 'proportional')
})

test('producto vacío representa toda la tienda y revierte los cobros auditados', () => {
  const corrected: Sale = {
    ...sale,
    paymentAdjustments: {
      reversal: { id: 'reversal', saleId: sale.id, paymentId: 'paid', kind: 'reversal', amount: 30, reason: 'Captura incorrecta', createdBy: 'admin', createdAt: timestamp('2026-08-12') },
    },
  }

  const report = buildStoreReport([corrected], filters)

  assert.equal(report.summary.unitsSold, 2)
  assert.equal(report.summary.recognizedRevenue, 100)
  assert.equal(report.summary.collected, 20)
  assert.equal(report.summary.receivable, 80)
  assert.equal(report.rows.reduce((sum, row) => sum + row.recognizedRevenue, 0), report.summary.recognizedRevenue)
})

test('detalle de tienda expone los cobros auditables por fecha, método e importe proporcional', () => {
  const report = buildStoreReport([sale], { ...filters, productIds: ['p2'] })
  const row = report.rows[0]!

  assert.equal(row.payments.reduce((sum, payment) => sum + payment.amount, 0), report.summary.collected)
  assert.deepEqual(row.payments.map(payment => ({ method: payment.method, amount: payment.amount, recovered: payment.recovered })), [
    { method: 'cash', amount: 12, recovered: false },
    { method: 'transfer', amount: 8, recovered: true },
  ])
})

test('no inventa costo ni utilidad cuando falta el costo histórico en partidas legadas', () => {
  const legacy = {
    ...sale,
    items: { p1: { productId: 'p1', name: 'Sin costo histórico', quantity: 1, unitPrice: 60 } },
  } as unknown as Sale

  const report = buildStoreReport([legacy], filters)

  assert.equal(report.summary.historicalCost, null)
  assert.equal(report.summary.grossProfit, null)
  assert.equal(report.summary.grossMargin, null)
  assert.equal(report.summary.qualityByMetric.historicalCost, 'partial-history')
})

test('cancelaciones conservan un detalle por partida sin incluirse como venta o cartera activa', () => {
  const cancelled: Sale = {
    ...sale,
    status: 'cancelled',
    cancelledAt: timestamp('2026-08-20'),
  }

  const report = buildStoreReport([cancelled], { ...filters, productIds: ['p2'] })

  assert.equal(report.summary.cancellations, 40)
  assert.equal(report.summary.recognizedRevenue, 0)
  assert.equal(report.summary.unitsSold, 0)
  assert.equal(report.summary.receivable, 0)
  assert.equal(report.rows[0]?.cancellationAmount, 40)
})
