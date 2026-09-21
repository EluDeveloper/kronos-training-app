/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPaymentReminderTemplateRequest,
  buildPaymentReceiptTemplateRequest,
  resolveApprovedTemplate,
} from '../src/whatsapp/templates.ts'

const document = {
  bytes: new Uint8Array([37, 80, 68, 70]),
  filename: 'receipt-MEM-202605-123456.pdf',
  sha256: 'a'.repeat(64),
}

test('receipt template uses the approved Utility definition and deterministic MXN parameters', () => {
  const request = buildPaymentReceiptTemplateRequest({
    to: '+5215512345678',
    customerName: 'Ana López',
    concept: 'Mensualidad 2026-05',
    amountPaid: 500,
    document,
  })

  assert.deepEqual(request, {
    to: '+5215512345678',
    templateName: 'payment_receipt_pdf_v1',
    locale: 'es_MX',
    parameters: ['Ana López', 'Mensualidad 2026-05', '$500.00 MXN'],
    document,
  })
})

test('reminder template carries only the due date and positive balance', () => {
  const request = buildPaymentReminderTemplateRequest({
    to: '+5215512345678',
    customerName: 'Ana López',
    dueDate: '2026-05-28',
    balance: 1234.5,
    document,
  })

  assert.deepEqual(request.parameters, ['Ana López', '2026-05-28', '$1,234.50 MXN'])
  assert.equal(request.templateName, 'payment_reminder_pdf_v1')
  assert.equal(request.locale, 'es_MX')
})

test('unknown, disabled, or non-Utility templates fail closed', () => {
  assert.deepEqual(resolveApprovedTemplate('unknown_template'), {
    status: 'suppressed-template',
    reason: 'template-not-approved',
  })
  assert.deepEqual(resolveApprovedTemplate('payment_receipt_pdf_v1', { enabled: false }), {
    status: 'suppressed-template',
    reason: 'template-disabled',
  })
  assert.deepEqual(resolveApprovedTemplate('payment_receipt_pdf_v1', { category: 'marketing' }), {
    status: 'suppressed-template',
    reason: 'template-category-invalid',
  })
})

test('template builders reject non-positive reminder balances', () => {
  assert.throws(
    () => buildPaymentReminderTemplateRequest({
      to: '+5215512345678',
      customerName: 'Ana',
      dueDate: '2026-05-28',
      balance: 0,
      document,
    }),
    /positive balance/,
  )
})

test('template builders require an ISO calendar due date', () => {
  assert.throws(
    () => buildPaymentReminderTemplateRequest({
      to: '+5215512345678',
      customerName: 'Ana',
      dueDate: 'mañana',
      balance: 100,
      document,
    }),
    /Invalid due date/,
  )
})

test('template builders reject impossible calendar dates', () => {
  assert.throws(
    () => buildPaymentReminderTemplateRequest({
      to: '+5215512345678',
      customerName: 'Ana',
      dueDate: '2026-02-31',
      balance: 100,
      document,
    }),
    /Invalid due date/,
  )
})
