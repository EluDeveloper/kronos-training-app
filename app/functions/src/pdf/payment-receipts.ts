import { createHash } from 'node:crypto'
import { formatMxn, safePdfText } from '../formatters.js'

// Same closed vocabulary and labels as the application's receipt contract.
export const backendPaymentMethodLabels = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro', 'store-credit': 'Saldo a favor',
} as const

export type BackendPaymentMethod = keyof typeof backendPaymentMethodLabels

export interface BackendPaymentNotificationLine {
  description: string
  amount: number
}

export type BackendPaymentNotificationDocument =
  | {
    kind: 'receipt'
    title: 'RECIBO'
    folio: string
    customerName: string
    issuedAt: number | string
    concept: string
    lines: BackendPaymentNotificationLine[]
    total: number
    amountPaid: number
    method?: BackendPaymentMethod | null
    balance: number
    isProofOfPayment: true
  }
  | {
    kind: 'reminder'
    title: 'AVISO DE PAGO'
    folio: string
    customerName: string
    issuedAt: number | string
    concept: string
    dueDate: string
    dueDateLabel?: 'Fecha de corte'
    lines: BackendPaymentNotificationLine[]
    total: number
    amountPaid: 0
    balance: number
    isProofOfPayment: false
    disclaimer: 'Documento informativo - no es comprobante de pago'
  }

export interface PaymentNotificationPdf {
  bytes: Uint8Array
  filename: string
  sha256: string
}

const A5_WIDTH = '419.53'
const A5_HEIGHT = '595.28'
const MAX_LINES = 20

const mexicoDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function createPaymentNotificationPdf(
  document: BackendPaymentNotificationDocument,
): PaymentNotificationPdf {
  validateDocument(document)

  const bytes = serializePdf(layoutPages(document))

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const prefix = document.kind === 'receipt' ? 'payment-receipt' : 'payment-reminder'

  return {
    bytes,
    filename: `${prefix}-${document.folio}.pdf`,
    sha256,
  }
}

function layoutPages(document: BackendPaymentNotificationDocument): string[] {
  const pages: string[][] = []
  let page: string[] = []
  let y = 480

  const newPage = () => {
    page = [
      '0.106 0.114 0.102 rg 0 505 419.53 91 re f',
      '0.59 0.84 0.87 rg',
      pdfText('KRONOS', 38, 555, 23, 'F2'),
      pdfText('TRAINING CENTER', 39, 538, 8),
      '1 0.25 0.106 rg',
      pdfText(document.title, 218, 560, 10, 'F2'),
      '0.92 0.92 0.92 rg',
      ...wrapText(document.folio, 38).map((line, index) => pdfText(line, 218, 544 - index * 11, 7)),
      '0.59 0.84 0.87 rg 38 503 343.53 3 re f',
      '0.12 0.14 0.13 rg',
    ]
    pages.push(page)
    y = 480
    if (pages.length > 1) {
      page.push(pdfText('CONCEPTO', 38, y, 9), pdfText('IMPORTE', 343.73, y, 9))
      y -= 22
    }
  }

  const row = (text: string, size = 9) => {
    if (y < 85)
      newPage()
    page.push(pdfText(text, 38, y, size))
    y -= 14
  }

  newPage()
  for (const text of [
    `Cliente: ${document.customerName}`,
    `Fecha: ${formatIssueDate(document.issuedAt)} (America/Mexico_City)`,
    `Concepto: ${document.concept}`,
    ...(document.kind === 'receipt' ? [`Método: ${document.method ? backendPaymentMethodLabels[document.method] : 'No especificado'}`] : []),
    ...(document.kind === 'reminder' ? [`${document.dueDateLabel ?? 'Vencimiento'}: ${document.dueDate}`] : []),
  ]) {
    for (const line of wrapText(text, 63))
      row(line)
  }
  y -= 14
  row('CONCEPTO')
  page.push(pdfText('IMPORTE', 343.73, y + 14, 9))
  for (const line of document.lines) {
    const description = wrapText(line.description, 39)
    if (y - description.length * 14 < 85)
      newPage()
    for (const [index, part] of description.entries()) {
      row(part)
      if (index === 0) {
        const amount = formatMxn(line.amount)

        page.push(pdfText(amount, 381.53 - amount.length * 5.4, y + 14, 9))
      }
    }
    y -= 6
  }

  // Keep the summary together, on a fresh page when necessary.
  if (y < 155)
    newPage()
  y -= 16
  row(`Total: ${formatMxn(document.total)}`)
  if (document.kind === 'receipt')
    row(`Aplicado: ${formatMxn(document.amountPaid)}`)
  row(`${document.kind === 'receipt' ? 'Saldo' : 'Saldo pendiente'}: ${formatMxn(document.balance)}`)

  return pages.map((commands, index) => [
    ...commands,
    '0.4 0.43 0.42 rg',
    pdfText(document.kind === 'reminder' ? document.disclaimer : 'Recibo interno - no es factura fiscal', 38, 48, 7),
    pdfText(`Página ${index + 1} / ${pages.length}`, 38, 31, 8),
  ].join('\n') + '\n')
}

function formatIssueDate(value: number | string): string {
  const parts = Object.fromEntries(mexicoDateTime.formatToParts(new Date(value)).map(part => [part.type, part.value]))

  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
}

function pdfText(text: string, x: number, y: number, size: number, font = 'F1'): string {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`
}

function wrapText(text: string, characters: number): string[] {
  let remaining = safePdfText(text).trim()
  const lines: string[] = []
  while (remaining.length > characters) {
    const space = remaining.lastIndexOf(' ', characters)
    const end = space > 0 ? space : characters

    lines.push(remaining.slice(0, end))
    remaining = remaining.slice(end).trimStart()
  }
  lines.push(remaining)

  return lines
}

function serializePdf(pages: string[]): Uint8Array {
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]

  const pageReferences: string[] = []
  for (const content of pages) {
    const pageId = objects.length + 1

    pageReferences.push(`${pageId} 0 R`)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A5_WIDTH} ${A5_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
    )
  }
  objects[1] = `<< /Type /Pages /Kids [${pageReferences.join(' ')}] /Count ${pages.length} >>`

  const header = Buffer.from('%PDF-1.7\n%\xFF\xFF\xFF\xFF\n', 'binary')
  const chunks = [header]
  const offsets = [0]
  let offset = header.length

  for (const [index, object] of objects.entries()) {
    offsets.push(offset)

    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'latin1')

    chunks.push(chunk)

    offset += chunk.length
  }

  const xrefOffset = offset

  const xref = [
    `xref\n0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    '%%EOF\n',
  ].join('\n')

  chunks.push(Buffer.from(xref, 'ascii'))

  return Buffer.concat(chunks)
}

function validateDocument(document: BackendPaymentNotificationDocument): void {
  if (!document || (document.kind !== 'receipt' && document.kind !== 'reminder'))
    throw new Error('Invalid payment notification document')
  // eslint-disable-next-line regexp/prefer-w
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/i.test(document.folio))
    throw new Error('Invalid payment notification folio')
  if (typeof document.customerName !== 'string' || document.customerName.length > 200
    || !document.customerName.trim() || /[\r\n]/.test(document.customerName))
    throw new Error('Invalid payment notification customer')
  if (typeof document.concept !== 'string' || document.concept.length > 256 || /[\r\n]/.test(document.concept))
    throw new Error('Invalid payment notification concept')
  if (document.kind === 'receipt' && (document.title !== 'RECIBO' || document.isProofOfPayment !== true))
    throw new Error('Invalid payment receipt')
  if (document.kind === 'receipt' && document.method != null
    && (typeof document.method !== 'string' || !Object.hasOwn(backendPaymentMethodLabels, document.method)))
    throw new Error('Invalid payment receipt method')
  if (document.kind === 'reminder' && (document.title !== 'AVISO DE PAGO' || document.isProofOfPayment !== false
    || document.disclaimer !== 'Documento informativo - no es comprobante de pago'))
    throw new Error('Invalid payment reminder')
  if (!Number.isFinite(new Date(document.issuedAt).getTime()))
    throw new Error('Invalid payment notification date')
  if (!Number.isFinite(document.total) || !Number.isFinite(document.balance) || document.total < 0 || document.balance < 0)
    throw new Error('Invalid payment notification totals')
  if (!Array.isArray(document.lines) || document.lines.length > MAX_LINES)
    throw new Error('Too many payment notification lines')
  for (const line of document.lines) {
    if (typeof line.description !== 'string' || line.description.length > 256
      || !line.description.trim() || /[\r\n]/.test(line.description)
      || !Number.isFinite(line.amount) || line.amount < 0)
      throw new Error('Invalid payment notification line')
  }
  if (document.kind === 'reminder' && (typeof document.dueDate !== 'string'
    || !isCalendarDate(document.dueDate)
    || !document.dueDate.trim() || document.amountPaid !== 0))
    throw new Error('Invalid payment reminder')
  if (safePdfText(document.customerName).length === 0)
    throw new Error('Invalid payment notification customer')
}

function escapePdfText(value: string): string {
  return safePdfText(value).replace(/[\\()]/g, character => `\\${character}`)
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false

  const date = new Date(`${value}T00:00:00.000Z`)

  return date.toISOString().slice(0, 10) === value
}
