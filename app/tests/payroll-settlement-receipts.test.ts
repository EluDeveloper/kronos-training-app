import assert from 'node:assert/strict'
import test from 'node:test'
import type { PayrollSettlement, WorkEntry } from '../src/types/workforce'
import { buildPayrollSettlementReceipt } from '../src/utils/receipts'

const settlement: PayrollSettlement = { id: 'settlement-1', employeeId: 'employee-1', employeeName: 'Coach QA', entryIds: { one: true, two: true }, periodFrom: '2026-09-01', periodThrough: '2026-09-02', amount: 300, method: 'transfer', reference: 'REF-1', paidAt: '2026-09-03', expenseId: 'payroll-settlement-1', createdBy: 'admin', createdAt: 1, updatedAt: 1 }

const entries: WorkEntry[] = [
  { id: 'one', employeeId: 'employee-1', employeeName: 'Coach QA', date: '2026-09-01', unit: 'class', quantity: 1, rateSnapshot: 100, amount: 100, status: 'paid', payrollSettlementId: 'settlement-1', createdBy: 'admin', createdAt: 1, updatedAt: 1 },
  { id: 'two', employeeId: 'employee-1', employeeName: 'Coach QA', date: '2026-09-02', unit: 'class', quantity: 2, rateSnapshot: 100, amount: 200, status: 'paid', payrollSettlementId: 'settlement-1', createdBy: 'admin', createdAt: 1, updatedAt: 1 },
]

test('construye recibo estable y conciliado desde la liquidación', () => {
  const receipt = buildPayrollSettlementReceipt(settlement, entries)

  assert.equal(receipt.kind, 'payroll')
  assert.equal(receipt.folio, 'NOM-TLEMENT1')
  assert.equal(receipt.amountPaid, 300)
  assert.equal(receipt.lines.reduce((sum, line) => sum + line.amount, 0), 300)
  assert.doesNotMatch(JSON.stringify(receipt), /createdBy|phone|note/i)
})

test('degrada un legado sin líneas sin inventar detalle', () => {
  const receipt = buildPayrollSettlementReceipt(settlement, [])

  assert.equal(receipt.lines.length, 1)
  assert.match(receipt.lines[0]!.description, /periodo/i)
  assert.equal(receipt.lines[0]!.amount, 300)
})
