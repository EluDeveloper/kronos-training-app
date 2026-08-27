import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Athlete, EmergencyContact } from '../src/types/domain'
import {
  buildEnrollmentSheet,
  enrollmentSheetFilename,
  formatEnrollmentDate,
  paymentScheduleText,
} from '../src/utils/enrollment-sheet'
import {
  createEnrollmentSheetPdf,
  enrollmentWhatsAppMessage,
  enrollmentWhatsAppUrl,
} from '../src/utils/enrollment-sheet-pdf'
import { createReceiptPdf, type ReceiptData } from '../src/utils/receipts'

const athlete: Athlete = {
  id: 'athlete-12345678',
  profile: {
    name: '  Atleta de prueba  ',
    phone: '5512345678',
    birthDate: '1992-03-14',
  },
  membership: {
    schedule: '06:00 AM',
    planId: 'plan-1',
    agreedAmount: 550,
    paymentDay: 26,
    registrationDate: '2026-08-26',
  },
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
}

const emergencyContact: EmergencyContact = {
  name: '  Ana Pérez  ',
  phone: ' 5587654321 ',
  relationship: '  Madre ',
}

test('construye una ficha estable con fecha recurrente y sólo el contacto proyectado', () => {
  const issuedAt = Date.UTC(2026, 7, 26, 18, 0, 0)
  const sheet = buildEnrollmentSheet(athlete, emergencyContact, issuedAt)

  assert.equal(sheet.kind, 'enrollment')
  assert.equal(sheet.issuedAt, issuedAt)
  assert.equal(sheet.athleteName, 'Atleta de prueba')
  assert.equal(sheet.birthDate, '1992-03-14')
  assert.equal(sheet.registrationDate, '2026-08-26')
  assert.equal(sheet.paymentDay, 26)
  assert.deepEqual(sheet.emergencyContact, {
    name: 'Ana Pérez',
    phone: '5587654321',
    relationship: 'Madre',
  })
  assert.match(sheet.folio, /^INS-20260826-[A-Z0-9]{8}$/)
  assert.equal(buildEnrollmentSheet(athlete, emergencyContact, issuedAt).folio, sheet.folio)
  assert.equal('healthHistory' in sheet, false)
  assert.equal('payments' in sheet, false)
})

test('comunica el día mensual y no crea un listado de pagos', () => {
  assert.equal(paymentScheduleText(26), 'Tu fecha de pago será el 26 de cada mes.')
  assert.equal(paymentScheduleText(0), 'Sin capturar')
  assert.equal(paymentScheduleText(32), 'Sin capturar')
  assert.equal(paymentScheduleText(15.5), 'Sin capturar')
})

test('formatea fechas de calendario sin desplazamiento de zona horaria', () => {
  assert.equal(formatEnrollmentDate('2026-08-26'), '26/08/2026')
  assert.equal(formatEnrollmentDate('2026-02-29'), 'Sin capturar')
  assert.equal(formatEnrollmentDate(null), 'Sin capturar')
})

test('mantiene visibles los datos ausentes sin inventar valores', () => {
  const sheet = buildEnrollmentSheet({
    ...athlete,
    profile: { ...athlete.profile, birthDate: null },
    membership: { ...athlete.membership, paymentDay: 0, registrationDate: '' },
  }, null, 1)

  assert.equal(sheet.birthDate, null)
  assert.equal(sheet.registrationDate, null)
  assert.equal(sheet.paymentDay, null)
  assert.equal(sheet.emergencyContact, null)
  assert.equal(paymentScheduleText(sheet.paymentDay), 'Sin capturar')
})

test('genera un nombre de archivo determinista', () => {
  const sheet = buildEnrollmentSheet(athlete, emergencyContact, 1)

  assert.equal(enrollmentSheetFilename(sheet), `ficha-inscripcion-${sheet.folio.toLowerCase()}.pdf`)
})

test('genera un PDF A5 y conserva la generación de recibos', async () => {
  const sheet = buildEnrollmentSheet(athlete, emergencyContact, 1)
  const enrollmentPdf = await createEnrollmentSheetPdf(sheet)

  const receipt: ReceiptData = {
    kind: 'membership',
    folio: 'MEM-TEST-000001',
    issuedAt: 1,
    customerName: 'Atleta de prueba',
    concept: 'Mensualidad de prueba',
    lines: [{ description: 'Mensualidad', amount: 550 }],
    method: 'cash',
    total: 550,
    amountPaid: 550,
    balance: 0,
  }

  const receiptPdf = await createReceiptPdf(receipt)

  assert.equal(enrollmentPdf.internal.pageSize.getWidth().toFixed(1), '148.0')
  assert.equal(enrollmentPdf.internal.pageSize.getHeight().toFixed(1), '210.0')
  assert.equal(enrollmentPdf.getNumberOfPages(), 1)
  assert.ok(enrollmentPdf.output('arraybuffer').byteLength > 1_000)
  assert.ok(receiptPdf.output('arraybuffer').byteLength > 1_000)
})

test('pagina contactos largos para conservar el encabezado y el pie', async () => {
  const sheet = buildEnrollmentSheet(athlete, {
    ...emergencyContact,
    name: 'Contacto de emergencia con nombre extenso '.repeat(80),
  }, 1)

  const pdf = await createEnrollmentSheetPdf(sheet)

  assert.ok(pdf.getNumberOfPages() > 1)
})

test('prepara WhatsApp sin exponer nacimiento ni contacto de emergencia en el mensaje', () => {
  const sheet = buildEnrollmentSheet(athlete, emergencyContact, 1)
  const message = enrollmentWhatsAppMessage(sheet)
  const url = enrollmentWhatsAppUrl(sheet, athlete.profile.phone)

  assert.match(message, /Hola Atleta de prueba/)
  assert.match(message, /adjuntarlo manualmente/)
  assert.doesNotMatch(message, /1992-03-14|Ana Pérez|5587654321|Madre/)
  assert.match(url, /^https:\/\/web\.whatsapp\.com\/send\?phone=525512345678&text=/)
  assert.equal(decodeURIComponent(url.split('text=')[1]), message)
})
