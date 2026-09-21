import type { NotificationJob } from './jobs.js'
import { buildReminderDebtCandidate, type ReminderConfiguration, type ReminderPayment } from './reminders.js'
import { backendPaymentMethodLabels, type BackendPaymentMethod, type BackendPaymentNotificationDocument, type BackendPaymentNotificationLine } from '../pdf/payment-receipts.js'

export interface CanonicalFinancialSnapshot {
  name: string
  membership: { agreedAmount: number; paymentDay: number }
  payments: unknown
  sales: unknown
}

type Row = Record<string, unknown>
interface AppliedSalePayment { saleId: string; paymentId: string; sale: Row; payment: Row }

export function buildCanonicalNotificationDocument(
  job: NotificationJob, snapshot: CanonicalFinancialSnapshot, now: number,
  configuration?: ReminderConfiguration,
): BackendPaymentNotificationDocument | null {
  const sales = Object.entries(record(snapshot.sales)).filter(([, sale]) =>
    record(sale).athleteId === job.athleteId && ['paid', 'credit'].includes(String(record(sale).status)))
    .map(([id, value]) => ({ id, value: record(value) }))

  const payments = record(snapshot.payments)
  const folio = `${job.type === 'payment-receipt' ? 'REC' : 'AVS'}-${job.jobId.slice(4).toUpperCase()}`
  if (job.type === 'payment-reminder') {
    const candidate = buildReminderDebtCandidate({ id: job.athleteId, membership: snapshot.membership },
      payments as Record<string, ReminderPayment>, sales.map(({ id, value }) => ({
        id, athleteId: job.athleteId, status: String(value.status), total: money(value.total),
        payments: Object.fromEntries(Object.entries(record(value.payments)).map(([key, payment]) =>
          [key, { amountApplied: money(record(payment).amountApplied) }])),
      })), now, configuration)

    if (!candidate || job.idempotencyKey !== `reminder:${job.athleteId}:${candidate.localDate}:daily`)
      return null

    return {
      kind: 'reminder', title: 'AVISO DE PAGO', folio, customerName: snapshot.name, issuedAt: now,
      concept: `Estado de cuenta ${candidate.period}`,
      dueDate: candidate.dueDate ?? candidate.localDate,
      ...(candidate.dueDate ? {} : { dueDateLabel: 'Fecha de corte' as const }),
      lines: [
        ...(candidate.monthlyDebt > 0 ? [{ description: 'Mensualidad pendiente', amount: cents(candidate.monthlyDebt) }] : []),
        ...(candidate.storeDebt > 0 ? [{ description: 'Tienda pendiente', amount: cents(candidate.storeDebt) }] : []),
      ],
      total: cents(candidate.totalDebt), balance: cents(candidate.totalDebt), amountPaid: 0,
      isProofOfPayment: false, disclaimer: 'Documento informativo - no es comprobante de pago',
    }
  }

  const [kind, first, second, third, ...extra] = job.idempotencyKey.split(':')
  if (extra.length)
    return null

  const linked = sales.flatMap(({ id, value }) => Object.entries(record(value.payments))
    .map(([paymentId, payment]) => ({ saleId: id, paymentId, sale: value, payment: record(payment) })))

  let selected: AppliedSalePayment[] = []
  let lines: BackendPaymentNotificationLine[] = []
  let methods: unknown[] = []
  let total = 0
  let amountPaid = 0
  let balance = 0
  let issuedAt: string
  let concept: string

  if (kind === 'membership' || kind === 'combined') {
    if (first !== job.athleteId || !second || !third)
      return null
    const payment = record(payments[second])
    const installment = record(record(payment.installments)[third])
    if (payment.status === 'cancelled' || installment.amountApplied === undefined || money(installment.amountApplied) <= 0)
      return null
    amountPaid = money(installment.amountApplied)
    balance = money(installment.balanceAfter)
    total = money(payment.totalAmount ?? snapshot.membership.agreedAmount)
    issuedAt = timestamp(installment.appliedAt)
    methods.push(installment.method)
    concept = `Mensualidad ${second}`
    lines = [{ description: concept, amount: amountPaid }]
    selected = linked.filter(entry => entry.payment.membershipPeriod === second && entry.payment.membershipInstallmentId === third)
    if (selected.length)
      concept += ' + tienda'
  } else if (kind === 'sale-initial' && first && !second) {
    const sale = sales.find(entry => entry.id === first)?.value
    if (!sale || sale.status !== 'paid')
      return null
    total = money(sale.total)
    amountPaid = total
    issuedAt = timestamp(sale.createdAt)
    concept = 'Compra en tienda'
    methods = Object.values(record(sale.payments)).map(payment => record(payment).method)
    lines = Object.values(record(sale.items)).map(item => {
      const row = record(item)

      return { description: `${money(row.quantity)} x ${String(row.name)}`, amount: cents(money(row.quantity) * money(row.unitPrice)) }
    })
    if (!lines.length || cents(lines.reduce((sum, line) => sum + line.amount, 0)) !== total)
      return null
  } else if ((kind === 'sale-payment' && first && second && !third) || (kind === 'sale-group' && first && !second)) {
    selected = linked.filter(entry => kind === 'sale-payment'
      ? entry.saleId === first && entry.paymentId === second : entry.payment.groupPaymentId === first)
    if (!selected.length)
      return null
    issuedAt = timestamp(selected[0].payment.appliedAt)
    concept = kind === 'sale-group' ? 'Cobro agrupado de tienda' : 'Abono de tienda'
  } else {
    return null
  }

  for (const entry of selected) {
    const applied = money(entry.payment.amountApplied)
    if (applied <= 0 || timestamp(entry.payment.appliedAt) !== issuedAt)
      return null
    lines.push({ description: `Tienda: venta ${entry.saleId}`, amount: applied })
    amountPaid += applied
    methods.push(entry.payment.method)
  }
  for (const saleId of new Set(selected.map(entry => entry.saleId))) {
    const entries = selected.filter(entry => entry.saleId === saleId)
    const last = entries.sort(comparePayment).at(-1)!

    balance += balanceAfter(last)
    total += (kind === 'membership' || kind === 'combined')
      ? entries.reduce((sum, entry) => sum + money(entry.payment.amountApplied), 0)
      : money(last.sale.total)
  }
  if (amountPaid <= 0)
    return null

  return {
    kind: 'receipt', title: 'RECIBO', folio, customerName: snapshot.name, issuedAt, concept, lines,
    method: commonPaymentMethod(methods),
    total: cents(total), amountPaid: cents(amountPaid), balance: cents(balance), isProofOfPayment: true,
  }
}

function commonPaymentMethod(methods: unknown[]): BackendPaymentMethod | null {
  const first = methods[0]

  // Missing or mixed source methods cannot establish a single payment method.
  return typeof first === 'string' && Object.hasOwn(backendPaymentMethodLabels, first)
    && methods.every(method => method === first) ? first as BackendPaymentMethod : null
}

function balanceAfter(entry: AppliedSalePayment): number {
  const applied = Object.entries(record(entry.sale.payments))
    .map(([paymentId, payment]) => ({ ...entry, paymentId, payment: record(payment) }))
    .filter(payment => comparePayment(payment, entry) <= 0)
    .reduce((sum, payment) => sum + money(payment.payment.amountApplied), 0)

  return cents(Math.max(0, money(entry.sale.total) - applied))
}

function comparePayment(left: AppliedSalePayment, right: AppliedSalePayment): number {
  return timestamp(left.payment.appliedAt).localeCompare(timestamp(right.payment.appliedAt))
    || left.paymentId.localeCompare(right.paymentId)
}

function timestamp(value: unknown): string {
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new Error('Invalid financial timestamp')

  return new Date(value).toISOString()
}

function money(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(number) || number < 0)
    throw new Error('Invalid financial amount')

  return cents(number)
}

function cents(value: number): number {
  return Math.round(value * 100) / 100
}

function record(value: unknown): Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}
