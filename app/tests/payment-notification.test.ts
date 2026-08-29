import assert from 'node:assert/strict'
import test from 'node:test'
import type { Athlete, Payment, Sale } from '../src/types/domain'
import {
  buildPaymentNotificationKey,
  buildPaymentReceiptDocument,
  buildPaymentReminderDocument,
  buildNotificationConsentMutation,
  buildReminderNotificationKey,
  calculateDebtSnapshot,
  getScheduledReminderKinds,
  isNotificationStatusAdvance,
  normalizePhoneE164,
  resolveWhatsAppEligibility,
  sanitizeProviderError,
  type NotificationConsent,
} from '../src/utils/payment-notification'

const athlete: Athlete = {
  id: 'athlete-1',
  profile: { name: 'Atleta QA', phone: '5512345678' },
  membership: {
    schedule: 'Matutino',
    planId: 'plan-1',
    agreedAmount: 500,
    paymentDay: 5,
    registrationDate: '2026-01-01',
  },
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
}

const payment: Payment = {
  athleteId: athlete.id,
  period: '2026-09',
  status: 'pending',
  amount: 200,
  totalAmount: 500,
  balance: 300,
  createdAt: 1,
  updatedAt: 2,
}

const storeSale = (id: string, status: Sale['status'], total: number, amountApplied: number): Sale => {
  const paymentId = 'payment-' + id

  return {
    id,
    athleteId: athlete.id,
    customerName: athlete.profile.name,
    items: {},
    total,
    status,
    payments: amountApplied
      ? { [paymentId]: { id: paymentId, amountApplied, method: 'cash', appliedAt: 2 } }
      : {},
    createdAt: 1,
    updatedAt: 2,
  }
}

const optedInConsent: NotificationConsent = {
  athleteId: athlete.id,
  createdAt: 1,
  receiptStatus: 'opted-in',
  reminderStatus: 'opted-in',
  consentedPhoneE164: '525512345678',
  consentedAt: 2,
  consentSource: 'athlete',
  recordedBy: 'admin-1',
  updatedAt: 2,
  updatedBy: 'admin-1',
}

test('calcula mensualidad, tienda y total sólo con saldos positivos canónicos', () => {
  const result = calculateDebtSnapshot(athlete, payment, [
    storeSale('open', 'credit', 250, 50),
    storeSale('settled', 'paid', 100, 100),
    storeSale('cancelled', 'cancelled', 900, 0),
  ])

  assert.deepEqual(result, {
    monthly: 300,
    store: 200,
    total: 500,
  })
})

test('calcula la mensualidad completa cuando aún no existe registro del periodo', () => {
  assert.deepEqual(calculateDebtSnapshot(athlete, null, []), {
    monthly: 500,
    store: 0,
    total: 500,
  })
})

test('normaliza teléfonos mexicanos de diez dígitos a E.164 y rechaza entradas ambiguas', () => {
  assert.equal(normalizePhoneE164('55 1234 5678'), '525512345678')
  assert.equal(normalizePhoneE164('+52 55 1234 5678'), '525512345678')
  assert.equal(normalizePhoneE164('551234567'), null)
  assert.equal(normalizePhoneE164('55123456789'), null)
})

test('la elegibilidad exige atleta activo, opt-in y coincidencia del teléfono consentido', () => {
  assert.deepEqual(resolveWhatsAppEligibility({ athlete, consent: optedInConsent, purpose: 'receipt' }), {
    eligible: true,
    recipient: '525512345678',
    reason: 'eligible',
  })

  assert.equal(resolveWhatsAppEligibility({
    athlete,
    consent: { ...optedInConsent, consentedPhoneE164: '525511111111' },
    purpose: 'receipt',
  }).reason, 'phone-changed')

  assert.equal(resolveWhatsAppEligibility({
    athlete,
    consent: { ...optedInConsent, athleteId: 'athlete-2' },
    purpose: 'receipt',
  }).reason, 'consent-mismatch')

  assert.equal(resolveWhatsAppEligibility({
    athlete,
    consent: { ...optedInConsent, reminderStatus: 'opted-out' },
    purpose: 'reminder',
  }).reason, 'opted-out')

  assert.equal(resolveWhatsAppEligibility({
    athlete: { ...athlete, status: 'inactive' },
    consent: optedInConsent,
    purpose: 'receipt',
  }).reason, 'athlete-inactive')
})

test('las claves de pago y recordatorio son deterministas por operación', () => {
  assert.equal(buildPaymentNotificationKey({
    kind: 'membership',
    athleteId: 'athlete-1',
    period: '2026-09',
    installmentId: 'installment-1',
  }), 'membership:athlete-1:2026-09:installment-1')

  assert.equal(buildPaymentNotificationKey({ kind: 'sale-group', groupPaymentId: 'group-1' }), 'sale-group:group-1')
  assert.equal(buildPaymentNotificationKey({
    kind: 'combined',
    athleteId: 'athlete-1',
    period: '2026-09',
    membershipInstallmentId: 'installment-1',
  }), 'combined:athlete-1:2026-09:installment-1')
  assert.equal(buildReminderNotificationKey({
    athleteId: 'athlete-1',
    localDate: '2026-09-05',
    reminderKind: 'combined',
    period: '2026-09',
  }), 'reminder:athlete-1:2026-09-05:combined:2026-09')
})

test('resuelve recordatorios previos, del día, vencidos y de tienda semanal', () => {
  assert.deepEqual(getScheduledReminderKinds({
    localDate: '2026-09-02',
    dueDate: '2026-09-05',
    monthlyDebt: 300,
    storeDebt: 0,
  }), ['pre-due'])
  assert.deepEqual(getScheduledReminderKinds({
    localDate: '2026-09-05',
    dueDate: '2026-09-05',
    monthlyDebt: 300,
    storeDebt: 0,
  }), ['due'])
  assert.deepEqual(getScheduledReminderKinds({
    localDate: '2026-09-12',
    dueDate: '2026-09-05',
    monthlyDebt: 300,
    storeDebt: 0,
  }), ['overdue'])
  assert.deepEqual(getScheduledReminderKinds({
    localDate: '2026-09-07',
    dueDate: '2026-09-05',
    monthlyDebt: 0,
    storeDebt: 200,
  }), ['store'])
  assert.deepEqual(getScheduledReminderKinds({
    localDate: '2026-09-07',
    dueDate: '2026-09-05',
    monthlyDebt: 300,
    storeDebt: 200,
  }), ['combined'])
})

test('los estados de proveedor sólo avanzan y los errores se sanitizan', () => {
  assert.equal(isNotificationStatusAdvance('sent', 'delivered'), true)
  assert.equal(isNotificationStatusAdvance('read', 'delivered'), false)
  assert.equal(isNotificationStatusAdvance('queued', 'retryable-failed'), true)
  assert.deepEqual(sanitizeProviderError({
    code: '131047',
    message: 'Authorization Bearer secret-token failed for phone 525512345678',
  }), {
    code: '131047',
    message: 'Authorization Bearer [REDACTED] failed for phone [REDACTED]',
  })
})

test('construye un recibo de pago aplicado sin datos fuera de la operación financiera', () => {
  const document = buildPaymentReceiptDocument({
    folio: 'MEM-202609-ABC123',
    customerName: athlete.profile.name,
    issuedAt: 3,
    concept: 'Mensualidad 2026-09',
    lines: [{ description: 'Abono a mensualidad', amount: 200 }],
    total: 500,
    amountPaid: 200,
    balance: 300,
  })

  assert.deepEqual(document, {
    kind: 'receipt',
    title: 'RECIBO',
    folio: 'MEM-202609-ABC123',
    customerName: 'Atleta QA',
    issuedAt: 3,
    concept: 'Mensualidad 2026-09',
    lines: [{ description: 'Abono a mensualidad', amount: 200 }],
    total: 500,
    amountPaid: 200,
    balance: 300,
    isProofOfPayment: true,
  })
  assert.equal('healthHistory' in document, false)
  assert.equal('emergencyContact' in document, false)
  assert.equal('kioskCode' in document, false)
})

test('construye un aviso de pago consolidado y lo distingue de un comprobante', () => {
  const document = buildPaymentReminderDocument({
    folio: 'COB-202609-ABC123',
    customerName: athlete.profile.name,
    issuedAt: 3,
    period: '2026-09',
    dueDate: '2026-09-05',
    monthlyDebt: 300,
    storeDebt: 200,
  })

  assert.deepEqual(document, {
    kind: 'reminder',
    title: 'AVISO DE PAGO',
    folio: 'COB-202609-ABC123',
    customerName: 'Atleta QA',
    issuedAt: 3,
    concept: 'Estado de cuenta 2026-09',
    dueDate: '2026-09-05',
    lines: [
      { description: 'Mensualidad 2026-09', amount: 300 },
      { description: 'Tienda', amount: 200 },
    ],
    total: 500,
    amountPaid: 0,
    balance: 500,
    isProofOfPayment: false,
    disclaimer: 'Documento informativo - no es comprobante de pago',
  })
  assert.equal(buildPaymentReminderDocument({
    folio: 'COB-202609-ABC123',
    customerName: athlete.profile.name,
    issuedAt: 3,
    period: '2026-09',
    dueDate: '2026-09-05',
    monthlyDebt: 0,
    storeDebt: 0,
  }), null)
})

test('construye un opt-in explícito ligado al teléfono y audita al operador', () => {
  assert.deepEqual(buildNotificationConsentMutation({
    athleteId: athlete.id,
    phone: athlete.profile.phone,
    current: null,
    receiptOptIn: true,
    reminderOptIn: false,
    consentConfirmed: true,
    withdrawalConfirmed: false,
    recordedBy: 'admin-1',
    now: 10,
  }), {
    athleteId: athlete.id,
    createdAt: 10,
    receiptStatus: 'opted-in',
    reminderStatus: 'unknown',
    consentedPhoneE164: '525512345678',
    consentedAt: 10,
    consentSource: 'staff',
    recordedBy: 'admin-1',
    optedOutAt: null,
    optOutSource: null,
    updatedAt: 10,
    updatedBy: 'admin-1',
  })
})

test('un opt-out visible conserva el teléfono y registra la baja sin borrar el consentimiento', () => {
  assert.deepEqual(buildNotificationConsentMutation({
    athleteId: athlete.id,
    phone: athlete.profile.phone,
    current: optedInConsent,
    receiptOptIn: false,
    reminderOptIn: false,
    consentConfirmed: false,
    withdrawalConfirmed: true,
    recordedBy: 'reception-1',
    now: 20,
  }), {
    ...optedInConsent,
    receiptStatus: 'opted-out',
    reminderStatus: 'opted-out',
    optedOutAt: 20,
    optOutSource: 'staff',
    updatedAt: 20,
    updatedBy: 'reception-1',
  })
})

test('el consentimiento rechaza opt-in sin confirmación o sin teléfono válido', () => {
  assert.throws(() => buildNotificationConsentMutation({
    athleteId: athlete.id,
    phone: athlete.profile.phone,
    current: null,
    receiptOptIn: true,
    reminderOptIn: false,
    consentConfirmed: false,
    withdrawalConfirmed: false,
    recordedBy: 'admin-1',
    now: 10,
  }), /confirmación explícita/)

  assert.throws(() => buildNotificationConsentMutation({
    athleteId: athlete.id,
    phone: '551234567',
    current: null,
    receiptOptIn: true,
    reminderOptIn: false,
    consentConfirmed: true,
    withdrawalConfirmed: false,
    recordedBy: 'admin-1',
    now: 10,
  }), /teléfono válido/)
})
