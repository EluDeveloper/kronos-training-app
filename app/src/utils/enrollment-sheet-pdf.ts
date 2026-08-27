import { jsPDF } from 'jspdf'
import type { EnrollmentSheetData } from '@/utils/enrollment-sheet'
import { enrollmentSheetFilename, formatEnrollmentDate, paymentScheduleText } from '@/utils/enrollment-sheet'
import { formatDate } from '@/utils/kronos'
import { drawKronosPdfHeader, loadKronosLogoDataUrl } from '@/utils/kronos-pdf'

const missingValue = 'Sin capturar'

const contactValue = (value?: string | null) => value || missingValue

const normalizedWhatsAppPhone = (phone?: string | null) => {
  const digits = (phone ?? '').replace(/\D/g, '')

  if (digits.length === 10)
    return `52${digits}`

  return digits.length === 12 && digits.startsWith('52') ? digits : ''
}

export const enrollmentSheetMissingFields = (sheet: EnrollmentSheetData) => {
  const missing: string[] = []

  if (!sheet.birthDate)
    missing.push('fecha de nacimiento')
  if (!sheet.registrationDate)
    missing.push('fecha de inscripción')
  if (!sheet.paymentDay)
    missing.push('día de pago')
  if (!sheet.emergencyContact?.name)
    missing.push('nombre del contacto de emergencia')
  if (!sheet.emergencyContact?.phone)
    missing.push('teléfono del contacto de emergencia')
  if (!sheet.emergencyContact?.relationship)
    missing.push('parentesco del contacto de emergencia')

  return missing
}

export async function createEnrollmentSheetPdf(sheet: EnrollmentSheetData, logoDataUrl?: string) {
  const officialLogo = logoDataUrl ?? await loadKronosLogoDataUrl()
  const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
  const width = pdf.internal.pageSize.getWidth()
  const height = pdf.internal.pageSize.getHeight()
  const margin = 14
  const contentWidth = width - margin * 2
  const footerText = 'Revisa que tus datos sean correctos. Gracias por ser parte de Kronos Training.'
  let y = 0

  const drawFooter = () => {
    pdf.setTextColor(120, 122, 118)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.text(footerText, width / 2, height - 10, { align: 'center' })
  }

  const drawHeader = () => {
    y = drawKronosPdfHeader(pdf, 'FICHA DE INSCRIPCIÓN', sheet.folio, officialLogo)
  }

  const ensureSpace = (required: number) => {
    if (y + required <= height - 14)
      return

    drawFooter()
    pdf.addPage()
    drawHeader()
  }

  const drawSectionTitle = (title: string, followingSpace: number) => {
    ensureSpace(12 + followingSpace)
    pdf.setFillColor(240, 247, 247)
    pdf.roundedRect(margin, y, contentWidth, 9, 2, 2, 'F')
    pdf.setTextColor(68, 121, 127)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.text(title.toUpperCase(), margin + 3, y + 5.8)
    y += 12
  }

  const drawField = (label: string, value: string) => {
    const lines = pdf.splitTextToSize(value, contentWidth) as string[]

    ensureSpace(11)
    pdf.setTextColor(110, 112, 108)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.text(label, margin, y)
    y += 5
    pdf.setTextColor(35, 38, 34)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9.5)
    for (const line of lines) {
      ensureSpace(5)
      pdf.text(line, margin, y)
      y += 4
    }
    y += 2
  }

  drawHeader()
  pdf.setTextColor(35, 38, 34)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  for (const line of pdf.splitTextToSize(sheet.athleteName, contentWidth) as string[]) {
    ensureSpace(6)
    pdf.text(line, margin, y)
    y += 5.5
  }
  ensureSpace(10)
  pdf.setTextColor(90, 94, 88)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.text(`Fecha de emisión: ${formatDate(sheet.issuedAt)}`, margin, y + 1)
  y += 10

  drawSectionTitle('Datos de inscripción', 11)
  drawField('Fecha de nacimiento', formatEnrollmentDate(sheet.birthDate))
  drawField('Fecha de inscripción', formatEnrollmentDate(sheet.registrationDate))

  drawSectionTitle('Fecha de pago', 17)
  ensureSpace(17)
  pdf.setFillColor(255, 243, 224)
  pdf.roundedRect(margin, y - 1, contentWidth, 14, 2, 2, 'F')
  pdf.setTextColor(112, 69, 0)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9.5)
  pdf.text(paymentScheduleText(sheet.paymentDay), margin + 4, y + 7.5)
  y += 21

  drawSectionTitle('Contacto de emergencia', 11)
  drawField('Nombre', contactValue(sheet.emergencyContact?.name))
  drawField('Teléfono', contactValue(sheet.emergencyContact?.phone))
  drawField('Parentesco', contactValue(sheet.emergencyContact?.relationship))

  const missing = enrollmentSheetMissingFields(sheet)
  if (missing.length) {
    ensureSpace(15)
    pdf.setFillColor(255, 244, 229)
    pdf.roundedRect(margin, y - 2, contentWidth, 13, 2, 2, 'F')
    pdf.setTextColor(154, 71, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.text('Información pendiente de validar', margin + 4, y + 3)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.text('Revisa los campos marcados como Sin capturar antes de compartir.', margin + 4, y + 8)
  }

  drawFooter()

  return pdf
}

export const enrollmentWhatsAppMessage = (sheet: EnrollmentSheetData) => [
  `Hola ${sheet.athleteName}, te compartimos tu ficha de inscripción de Kronos Training.`,
  '',
  'El PDF fue descargado para adjuntarlo manualmente en este chat.',
].join('\n')

export const enrollmentWhatsAppUrl = (sheet: EnrollmentSheetData, phone?: string | null) => {
  const normalizedPhone = normalizedWhatsAppPhone(phone)
  const recipient = normalizedPhone ? `phone=${normalizedPhone}&` : ''

  return `https://web.whatsapp.com/send?${recipient}text=${encodeURIComponent(enrollmentWhatsAppMessage(sheet))}`
}

export async function downloadEnrollmentSheet(sheet: EnrollmentSheetData) {
  const pdf = await createEnrollmentSheetPdf(sheet)

  pdf.save(enrollmentSheetFilename(sheet))
}

export async function printEnrollmentSheet(sheet: EnrollmentSheetData) {
  const pdf = await createEnrollmentSheetPdf(sheet)
  const url = URL.createObjectURL(pdf.output('blob'))
  const printWindow = window.open(url, '_blank')

  if (!printWindow) {
    URL.revokeObjectURL(url)
    throw new Error('El navegador bloqueó la ventana de impresión.')
  }

  printWindow.opener = null
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function shareEnrollmentSheet(sheet: EnrollmentSheetData, phone?: string | null) {
  const pdfPromise = createEnrollmentSheetPdf(sheet)
  const shareWindow = window.open(enrollmentWhatsAppUrl(sheet, phone), '_blank')

  if (!shareWindow)
    throw new Error('El navegador bloqueó la ventana de WhatsApp Web.')

  shareWindow.opener = null

  const pdf = await pdfPromise

  pdf.save(enrollmentSheetFilename(sheet))

  return normalizedWhatsAppPhone(phone) ? 'whatsapp-web' as const : 'whatsapp-web-no-recipient' as const
}
