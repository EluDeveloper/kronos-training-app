import type { Athlete, ISOTimestamp, Payment, PaymentMethod, Sale, SalePayment } from '@/types/domain'
import { formatCurrency, saleAppliedAmount, saleBalance, timestampValue } from '@/utils/kronos'

export type ReceiptKind = 'membership' | 'sale' | 'sale-payment'

export interface ReceiptLine {
  description: string
  quantity?: number
  unitPrice?: number
  amount: number
}

export interface ReceiptData {
  kind: ReceiptKind
  folio: string
  issuedAt: ISOTimestamp
  customerName: string
  phone?: string | null
  concept: string
  lines: ReceiptLine[]
  method?: PaymentMethod | null
  total: number
  amountPaid: number
  balance: number
}

const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
}

const folioSuffix = (value: string) => value.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase().padStart(6, '0')

export const paymentMethodLabel = (method?: PaymentMethod | null) => method ? methodLabels[method] : 'No especificado'

export function buildMembershipReceipt(payment: Payment, athlete: Athlete, planName?: string): ReceiptData {
  const amount = Number(payment.amount ?? athlete.membership.agreedAmount ?? 0)

  return {
    kind: 'membership',
    folio: `MEM-${payment.period.replace('-', '')}-${folioSuffix(athlete.id)}`,
    issuedAt: payment.appliedAt ?? payment.updatedAt,
    customerName: athlete.profile.name,
    phone: athlete.profile.phone,
    concept: `Mensualidad ${payment.period}${planName ? ` - ${planName}` : ''}`,
    lines: [{ description: `Membresía ${payment.period}`, amount }],
    method: payment.method,
    total: amount,
    amountPaid: amount,
    balance: 0,
  }
}

export function buildSaleReceipt(sale: Sale, athlete?: Athlete): ReceiptData {
  const paid = saleAppliedAmount(sale)
  const payments = Object.values(sale.payments ?? {}).sort((a, b) => timestampValue(a.appliedAt) - timestampValue(b.appliedAt))
  const uniqueMethods = [...new Set(payments.map(payment => payment.method))]

  return {
    kind: 'sale',
    folio: `VEN-${folioSuffix(sale.id)}`,
    issuedAt: sale.createdAt,
    customerName: athlete?.profile.name ?? sale.customerName,
    phone: athlete?.profile.phone,
    concept: sale.status === 'cancelled' ? 'Venta cancelada' : 'Venta de tienda',
    lines: Object.values(sale.items ?? {}).map(item => ({
      description: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.quantity * item.unitPrice,
    })),
    method: uniqueMethods.length === 1 ? uniqueMethods[0] : null,
    total: Number(sale.total || 0),
    amountPaid: paid,
    balance: saleBalance(sale),
  }
}

export function buildSalePaymentReceipt(sale: Sale, targetPayment: SalePayment, athlete?: Athlete): ReceiptData {
  const orderedPayments = Object.values(sale.payments ?? {}).sort((a, b) => {
    const difference = timestampValue(a.appliedAt) - timestampValue(b.appliedAt)

    return difference || a.id.localeCompare(b.id)
  })
  let appliedThroughReceipt = 0

  for (const payment of orderedPayments) {
    appliedThroughReceipt += Number(payment.amountApplied || 0)
    if (payment.id === targetPayment.id)
      break
  }

  return {
    kind: 'sale-payment',
    folio: `ABO-${folioSuffix(targetPayment.id)}`,
    issuedAt: targetPayment.appliedAt,
    customerName: athlete?.profile.name ?? sale.customerName,
    phone: athlete?.profile.phone,
    concept: `Abono a venta ${`VEN-${folioSuffix(sale.id)}`}`,
    lines: [{ description: 'Abono aplicado', amount: Number(targetPayment.amountApplied || 0) }],
    method: targetPayment.method,
    total: Number(sale.total || 0),
    amountPaid: Number(targetPayment.amountApplied || 0),
    balance: Math.max(0, Number(sale.total || 0) - appliedThroughReceipt),
  }
}

const receiptFilename = (receipt: ReceiptData) => `recibo-${receipt.folio.toLowerCase()}.pdf`

export async function createReceiptPdf(receipt: ReceiptData) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
  const width = pdf.internal.pageSize.getWidth()
  const margin = 14
  const contentWidth = width - margin * 2
  let y = 0

  const drawHeader = () => {
    pdf.setFillColor(27, 29, 26)
    pdf.rect(0, 0, width, 42, 'F')
    pdf.setTextColor(151, 213, 222)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(18)
    pdf.text('KRONOS', margin, 17)
    pdf.setTextColor(235, 235, 235)
    pdf.setFontSize(8)
    pdf.text('TRAINING CENTER', margin, 23)
    pdf.setTextColor(255, 64, 27)
    pdf.setFontSize(10)
    pdf.text('RECIBO', width - margin, 17, { align: 'right' })
    pdf.setTextColor(235, 235, 235)
    pdf.setFontSize(8)
    pdf.text(receipt.folio, width - margin, 24, { align: 'right' })
    y = 52
  }

  const ensureSpace = (required: number) => {
    if (y + required <= pdf.internal.pageSize.getHeight() - 16)
      return
    pdf.addPage()
    drawHeader()
  }

  drawHeader()
  pdf.setTextColor(35, 38, 34)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text(receipt.customerName, margin, y)
  y += 6
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(90, 94, 88)
  pdf.text(`Fecha: ${new Date(receipt.issuedAt).toLocaleString('es-MX')}`, margin, y)
  y += 5
  pdf.text(`Concepto: ${receipt.concept}`, margin, y)
  y += 5
  pdf.text(`Método: ${paymentMethodLabel(receipt.method)}`, margin, y)
  y += 9

  pdf.setFillColor(240, 247, 247)
  pdf.roundedRect(margin, y - 5, contentWidth, 9, 2, 2, 'F')
  pdf.setTextColor(68, 121, 127)
  pdf.setFont('helvetica', 'bold')
  pdf.text('CONCEPTO', margin + 3, y)
  pdf.text('IMPORTE', width - margin - 3, y, { align: 'right' })
  y += 9

  for (const line of receipt.lines) {
    ensureSpace(16)
    pdf.setTextColor(35, 38, 34)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    const description = line.quantity && line.unitPrice != null
      ? `${line.quantity} x ${line.description}`
      : line.description
    const descriptionLines = pdf.splitTextToSize(description, contentWidth - 38)
    pdf.text(descriptionLines, margin + 2, y)
    pdf.text(formatCurrency(line.amount), width - margin - 2, y, { align: 'right' })
    if (line.quantity && line.unitPrice != null) {
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(110, 112, 108)
      pdf.setFontSize(7.5)
      pdf.text(`${formatCurrency(line.unitPrice)} por unidad`, margin + 2, y + 4)
    }
    y += Math.max(11, descriptionLines.length * 4 + 5)
    pdf.setDrawColor(225, 228, 224)
    pdf.line(margin, y - 3, width - margin, y - 3)
  }

  ensureSpace(38)
  y += 3
  pdf.setFontSize(9)
  pdf.setTextColor(70, 72, 68)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Total', width - margin - 45, y)
  pdf.text(formatCurrency(receipt.total), width - margin, y, { align: 'right' })
  y += 6
  pdf.text(receipt.kind === 'sale-payment' ? 'Abono recibido' : 'Pagado', width - margin - 45, y)
  pdf.text(formatCurrency(receipt.amountPaid), width - margin, y, { align: 'right' })
  y += 8
  pdf.setFillColor(255, 64, 27)
  pdf.roundedRect(width - margin - 66, y - 5, 66, 11, 2, 2, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.text(receipt.balance > 0 ? 'SALDO' : 'LIQUIDADO', width - margin - 62, y + 1)
  pdf.text(formatCurrency(receipt.balance), width - margin - 4, y + 1, { align: 'right' })

  const pageHeight = pdf.internal.pageSize.getHeight()
  pdf.setTextColor(120, 122, 118)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.text('Gracias por entrenar con nosotros.', width / 2, pageHeight - 10, { align: 'center' })

  return pdf
}

export async function downloadReceipt(receipt: ReceiptData) {
  const pdf = await createReceiptPdf(receipt)

  pdf.save(receiptFilename(receipt))
}

export async function printReceipt(receipt: ReceiptData) {
  const pdf = await createReceiptPdf(receipt)
  const url = URL.createObjectURL(pdf.output('blob'))
  const printWindow = window.open(url, '_blank')

  if (!printWindow)
    throw new Error('El navegador bloqueó la ventana de impresión.')

  printWindow.opener = null
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const normalizedWhatsAppPhone = (phone?: string | null) => {
  const digits = (phone ?? '').replace(/\D/g, '')

  if (digits.length === 10)
    return `52${digits}`

  return digits.startsWith('52') ? digits : ''
}

const receiptMessage = (receipt: ReceiptData) => [
  `Hola ${receipt.customerName}, compartimos tu recibo de Kronos Training.`,
  `Folio: ${receipt.folio}`,
  `Concepto: ${receipt.concept}`,
  `Pago: ${formatCurrency(receipt.amountPaid)}`,
  receipt.balance > 0 ? `Saldo pendiente: ${formatCurrency(receipt.balance)}` : 'Saldo: liquidado',
].join('\n')

export async function shareReceipt(receipt: ReceiptData) {
  const pdf = await createReceiptPdf(receipt)
  const blob = pdf.output('blob')
  const file = new File([blob], receiptFilename(receipt), { type: 'application/pdf' })
  const sharePayload = { title: `Recibo ${receipt.folio}`, text: receiptMessage(receipt), files: [file] }

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share(sharePayload)

    return 'shared' as const
  }

  pdf.save(receiptFilename(receipt))
  const phone = normalizedWhatsAppPhone(receipt.phone)
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(`${receiptMessage(receipt)}\n\nEl PDF fue descargado para adjuntarlo en este chat.`)}`
  window.open(whatsappUrl, '_blank', 'noopener,noreferrer')

  return 'downloaded' as const
}
