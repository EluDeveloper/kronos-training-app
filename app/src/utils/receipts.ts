import { jsPDF } from 'jspdf'
import type { Athlete, ISOTimestamp, MembershipPaymentInstallment, Payment, PaymentMethod, Sale, SalePayment, Visit, VisitPayment, VisitorContact } from '@/types/domain'
import { formatCurrency, membershipBalance, membershipPaidAmount, membershipTotalAmount, saleAppliedAmount, saleBalance, timestampValue } from '@/utils/kronos'

export type ReceiptKind = 'membership' | 'sale' | 'sale-payment' | 'collection'

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
  creditBalance?: number
}

type ReceiptCustomer = Athlete | VisitorContact
const customerName = (customer: ReceiptCustomer) => 'profile' in customer ? customer.profile.name : customer.name
const customerPhone = (customer: ReceiptCustomer) => 'profile' in customer ? customer.profile.phone : customer.phone

const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
  'store-credit': 'Saldo a favor',
}

const folioSuffix = (value: string) => value.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase().padStart(6, '0')

export const paymentMethodLabel = (method?: PaymentMethod | null) => method ? methodLabels[method] : 'No especificado'

export function buildMembershipReceipt(payment: Payment, athlete: Athlete, planName?: string, installment?: MembershipPaymentInstallment): ReceiptData {
  const total = membershipTotalAmount(payment, athlete.membership.agreedAmount)
  const amountPaid = installment?.amountApplied ?? membershipPaidAmount(payment)
  const balance = installment?.balanceAfter ?? membershipBalance(payment, athlete.membership.agreedAmount)
  const description = payment.concept?.trim() || `${installment ? 'Abono a mensualidad' : 'Membresía'} ${payment.period}`

  return {
    kind: 'membership',
    folio: `MEM-${payment.period.replace('-', '')}-${folioSuffix(installment?.id ?? athlete.id)}`,
    issuedAt: installment?.appliedAt ?? payment.appliedAt ?? payment.updatedAt,
    customerName: athlete.profile.name,
    phone: athlete.profile.phone,
    concept: payment.concept?.trim() || `Mensualidad ${payment.period}${planName ? ` - ${planName}` : ''}`,
    lines: [{ description, ...(payment.visitCount ? { quantity: payment.visitCount, unitPrice: amountPaid / payment.visitCount } : {}), amount: amountPaid }],
    method: installment?.method ?? payment.method,
    total,
    amountPaid,
    balance,
  }
}

export function buildVisitorVisitReceipt(payment: Payment, visitor: VisitorContact): ReceiptData {
  const amount = Number(payment.amount ?? 0)
  const description = payment.visitCount ? `Visitas acumuladas ${payment.period}` : payment.concept?.trim() || `Pago de visitas ${payment.period}`

  return {
    kind: 'membership',
    folio: `VIS-${payment.period.replace('-', '')}-${folioSuffix(visitor.id)}`,
    issuedAt: payment.appliedAt ?? payment.updatedAt,
    customerName: visitor.name,
    phone: visitor.phone,
    concept: `Pago de visitas ${payment.period}`,
    lines: [{ description, ...(payment.visitCount ? { quantity: payment.visitCount, unitPrice: amount / payment.visitCount } : {}), amount }],
    method: payment.method,
    total: amount,
    amountPaid: amount,
    balance: 0,
  }
}

const groupedVisitLines = (visits: Visit[]): ReceiptLine[] => {
  const groups = new Map<string, { period: string; unitPrice: number; quantity: number }>()

  for (const visit of visits) {
    const unitPrice = Number(visit.unitPrice || 0)
    const key = `${visit.period}:${unitPrice}`
    const group = groups.get(key) ?? { period: visit.period, unitPrice, quantity: 0 }

    group.quantity += 1
    groups.set(key, group)
  }

  return [...groups.values()]
    .sort((a, b) => a.period.localeCompare(b.period) || a.unitPrice - b.unitPrice)
    .map(group => ({
      description: `Visitas acumuladas ${group.period}`,
      quantity: group.quantity,
      unitPrice: group.unitPrice,
      amount: group.quantity * group.unitPrice,
    }))
}

export function buildVisitPaymentReceipt(payment: VisitPayment, visitor: VisitorContact): ReceiptData {
  const visits = Object.values(payment.visitRefs).map(reference => ({
    ...reference,
    visitorId: payment.visitorId,
    accessType: 'pay-per-visit' as const,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  }))

  return {
    kind: 'membership',
    folio: `VIS-${folioSuffix(payment.id)}`,
    issuedAt: payment.appliedAt,
    customerName: payment.customerName || visitor.name,
    phone: payment.phone || visitor.phone,
    concept: `Pago de visitas pendientes hasta ${payment.throughPeriod}`,
    lines: groupedVisitLines(visits),
    method: payment.method,
    total: payment.amount,
    amountPaid: payment.amount,
    balance: 0,
  }
}

const storeDebtLines = (openSales: Sale[]): ReceiptLine[] => openSales
  .filter(sale => sale.status === 'credit' && saleBalance(sale) > 0)
  .map(sale => {
    const products = Object.values(sale.items ?? {})
      .map(item => `${item.quantity} x ${item.name}`)
      .join(', ')

    return {
      description: `Tienda: ${products || `venta VEN-${folioSuffix(sale.id)}`}`,
      amount: saleBalance(sale),
    }
  })

export function buildSaleReceipt(sale: Sale, customer?: ReceiptCustomer): ReceiptData {
  const paid = saleAppliedAmount(sale)
  const payments = Object.values(sale.payments ?? {}).sort((a, b) => timestampValue(a.appliedAt) - timestampValue(b.appliedAt))
  const uniqueMethods = [...new Set(payments.map(payment => payment.method))]

  return {
    kind: 'sale',
    folio: `VEN-${folioSuffix(sale.id)}`,
    issuedAt: sale.createdAt,
    customerName: customer ? customerName(customer) : sale.customerName,
    phone: customer ? customerPhone(customer) : null,
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
    ...(payments.at(-1)?.creditBalance != null ? { creditBalance: payments.at(-1)?.creditBalance } : {}),
  }
}

export function buildSalePaymentReceipt(sale: Sale, targetPayment: SalePayment, customer?: ReceiptCustomer): ReceiptData {
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
    customerName: customer ? customerName(customer) : sale.customerName,
    phone: customer ? customerPhone(customer) : null,
    concept: `Abono a venta ${`VEN-${folioSuffix(sale.id)}`}`,
    lines: [{ description: 'Abono aplicado', amount: Number(targetPayment.amountApplied || 0) }],
    method: targetPayment.method,
    total: Number(sale.total || 0),
    amountPaid: Number(targetPayment.amountApplied || 0),
    balance: Math.max(0, Number(sale.total || 0) - appliedThroughReceipt),
    ...(targetPayment.creditBalance != null ? { creditBalance: targetPayment.creditBalance } : {}),
  }
}

export function buildCollectionTicket(athlete: Athlete, period: string, openSales: Sale[]): ReceiptData {
  const membershipAmount = Number(athlete.membership.agreedAmount || 0)

  const lines: ReceiptLine[] = [
    { description: `Mensualidad ${period}`, amount: membershipAmount },
    ...storeDebtLines(openSales),
  ]

  const total = lines.reduce((sum, line) => sum + line.amount, 0)

  return {
    kind: 'collection',
    folio: `COB-${period.replace('-', '')}-${folioSuffix(athlete.id)}`,
    issuedAt: Date.now(),
    customerName: athlete.profile.name,
    phone: athlete.profile.phone,
    concept: `Estado de cuenta ${period}`,
    lines,
    method: null,
    total,
    amountPaid: 0,
    balance: total,
  }
}

export function buildVisitStatement(customer: ReceiptCustomer, period: string, visitCount: number, unitPrice: number, openSales: Sale[]): ReceiptData {
  const visitsAmount = visitCount * unitPrice

  const lines: ReceiptLine[] = [
    { description: `Visitas acumuladas ${period}`, quantity: visitCount, unitPrice, amount: visitsAmount },
    ...storeDebtLines(openSales),
  ]

  const total = lines.reduce((sum, line) => sum + line.amount, 0)

  return {
    kind: 'collection',
    folio: `VIS-${period.replace('-', '')}-${folioSuffix(customer.id)}`,
    issuedAt: Date.now(),
    customerName: customerName(customer),
    phone: customerPhone(customer),
    concept: `Estado de cuenta por visitas ${period}`,
    lines,
    method: null,
    total,
    amountPaid: 0,
    balance: total,
  }
}

export function buildAccumulatedVisitStatement(customer: ReceiptCustomer, throughPeriod: string, visits: Visit[], openSales: Sale[]): ReceiptData {
  const lines: ReceiptLine[] = [
    ...groupedVisitLines(visits),
    ...storeDebtLines(openSales),
  ]

  const total = lines.reduce((sum, line) => sum + line.amount, 0)

  return {
    kind: 'collection',
    folio: `VIS-${throughPeriod.replace('-', '')}-${folioSuffix(customer.id)}`,
    issuedAt: Date.now(),
    customerName: customerName(customer),
    phone: customerPhone(customer),
    concept: `Visitas pendientes hasta ${throughPeriod}`,
    lines,
    method: null,
    total,
    amountPaid: 0,
    balance: total,
  }
}

export function buildRenewalReminder(athlete: Athlete, renewalPeriod: string, planName: string, visitLimit: number, amount: number, openSales: Sale[]): ReceiptData {
  const lines: ReceiptLine[] = [
    { description: `Renovación ${planName} - ${visitLimit} visitas`, amount },
    ...storeDebtLines(openSales),
  ]

  const total = lines.reduce((sum, line) => sum + line.amount, 0)

  return {
    kind: 'collection',
    folio: `REN-${renewalPeriod.replace('-', '')}-${folioSuffix(athlete.id)}`,
    issuedAt: Date.now(),
    customerName: athlete.profile.name,
    phone: athlete.profile.phone,
    concept: `Recordatorio de renovación ${renewalPeriod}`,
    lines,
    method: null,
    total,
    amountPaid: 0,
    balance: total,
  }
}

const receiptFilename = (receipt: ReceiptData) => `${receipt.kind === 'collection' ? 'aviso-cobranza' : 'recibo'}-${receipt.folio.toLowerCase()}.pdf`

let officialLogoPromise: Promise<string | null> | null = null

const loadOfficialLogo = () => {
  if (typeof window === 'undefined')
    return Promise.resolve(null)

  officialLogoPromise ??= fetch('/images/Kronos/V-16.png')
    .then(response => {
      if (!response.ok)
        throw new Error('No fue posible cargar el logo oficial.')

      return response.blob()
    })
    .then(blob => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    }))
    .catch(() => null)

  return officialLogoPromise
}

export async function createReceiptPdf(receipt: ReceiptData, logoDataUrl?: string) {
  const officialLogo = logoDataUrl ?? await loadOfficialLogo()
  const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
  const width = pdf.internal.pageSize.getWidth()
  const margin = 14
  const contentWidth = width - margin * 2
  let y = 0
  const isCollection = receipt.kind === 'collection'

  const drawHeader = () => {
    pdf.setFillColor(27, 29, 26)
    pdf.rect(0, 0, width, 42, 'F')
    if (officialLogo)
      pdf.addImage(officialLogo, 'PNG', margin, 9, 54, 14.4)
    else {
      pdf.setTextColor(151, 213, 222)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(18)
      pdf.text('KRONOS', margin, 17)
      pdf.setTextColor(235, 235, 235)
      pdf.setFontSize(8)
      pdf.text('TRAINING CENTER', margin, 23)
    }
    pdf.setTextColor(255, 64, 27)
    pdf.setFontSize(10)
    pdf.text(isCollection ? 'AVISO DE PAGO' : 'RECIBO', width - margin, 17, { align: 'right' })
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
  if (receipt.phone) {
    pdf.text(`Celular: ${receipt.phone}`, margin, y)
    y += 5
  }
  pdf.text(`Fecha: ${new Date(receipt.issuedAt).toLocaleString('es-MX')}`, margin, y)
  y += 5
  pdf.text(`Concepto: ${receipt.concept}`, margin, y)
  y += 5
  if (!isCollection) {
    pdf.text(`Método: ${paymentMethodLabel(receipt.method)}`, margin, y)
    y += 9
  }
  else {
    pdf.text('Documento informativo - no es comprobante de pago', margin, y)
    y += 9
  }

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

  ensureSpace(isCollection ? 30 : 46)
  y += 3
  pdf.setFontSize(9)
  pdf.setTextColor(70, 72, 68)
  pdf.setFont('helvetica', 'normal')
  if (!isCollection) {
    pdf.text('Total', width - margin - 45, y)
    pdf.text(formatCurrency(receipt.total), width - margin, y, { align: 'right' })
    y += 6
    pdf.text(receipt.kind === 'sale-payment' || receipt.balance > 0 ? 'Abono recibido' : 'Pagado', width - margin - 45, y)
    pdf.text(formatCurrency(receipt.amountPaid), width - margin, y, { align: 'right' })
    y += 6
    pdf.text('Saldo', width - margin - 45, y)
    pdf.text(formatCurrency(receipt.balance), width - margin, y, { align: 'right' })
    y += 9
    if (receipt.creditBalance != null) {
      pdf.text('Saldo a favor', width - margin - 45, y)
      pdf.text(formatCurrency(receipt.creditBalance), width - margin, y, { align: 'right' })
      y += 9
    }
  }
  else {
    y += 4
  }

  if (isCollection || receipt.balance > 0)
    pdf.setFillColor(255, 64, 27)
  else
    pdf.setFillColor(68, 121, 127)
  pdf.roundedRect(width - margin - 66, y - 5, 66, 11, 2, 2, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  if (isCollection) {
    pdf.text('TOTAL A PAGAR', width - margin - 62, y + 1)
    pdf.text(formatCurrency(receipt.total), width - margin - 4, y + 1, { align: 'right' })
  }
  else if (receipt.balance > 0) {
    pdf.text('SALDO PENDIENTE', width - margin - 62, y + 1)
    pdf.text(formatCurrency(receipt.balance), width - margin - 4, y + 1, { align: 'right' })
  }
  else {
    pdf.text('PAGO COMPLETO', width - margin - 33, y + 1, { align: 'center' })
  }

  const pageHeight = pdf.internal.pageSize.getHeight()

  pdf.setTextColor(120, 122, 118)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.text(isCollection ? 'Si ya realizaste el pago, puedes ignorar este aviso.' : 'Gracias por entrenar con nosotros.', width / 2, pageHeight - 10, { align: 'center' })

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

const receiptMessage = (receipt: ReceiptData) => receipt.kind === 'collection'
  ? [
    `Hola ${receipt.customerName}, te compartimos tu recordatorio de pago de Kronos Training.`,
    ...receipt.lines.map(line => `- ${line.description}: ${formatCurrency(line.amount)}`),
    `Total a pagar: ${formatCurrency(receipt.total)}`,
    'Si ya realizaste el pago, puedes ignorar este mensaje.',
  ].join('\n')
  : [
    `Hola ${receipt.customerName}, compartimos tu recibo de Kronos Training.`,
    `Folio: ${receipt.folio}`,
    `Concepto: ${receipt.concept}`,
    `Pago: ${formatCurrency(receipt.amountPaid)}`,
    receipt.balance > 0 ? `Saldo pendiente: ${formatCurrency(receipt.balance)}` : 'Saldo: pagado',
  ].join('\n')

export async function shareReceipt(receipt: ReceiptData) {
  const phone = normalizedWhatsAppPhone(receipt.phone)
  const message = `${receiptMessage(receipt)}\n\nEl PDF fue descargado para adjuntarlo en este chat.`
  const whatsappUrl = `https://web.whatsapp.com/send?${phone ? `phone=${phone}&` : ''}text=${encodeURIComponent(message)}`
  const pdfPromise = createReceiptPdf(receipt)

  window.open(whatsappUrl, '_blank', 'noopener,noreferrer')

  const pdf = await pdfPromise

  pdf.save(receiptFilename(receipt))

  return 'whatsapp-web' as const
}
