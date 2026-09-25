import type {
  ISOTimestamp,
  PaymentMethod,
  Sale,
  SalePayment,
  SalePaymentAdjustment,
  SalePaymentAdjustmentKind,
  SaleStatus,
  StoreCreditAccount,
  StoreCreditEntry,
} from '@/types/domain'

const timestampValue = (value?: ISOTimestamp | null) => {
  if (!value)
    return 0

  return typeof value === 'number' ? value : new Date(value).getTime()
}

export interface ResolvedSalePaymentState {
  original: SalePayment
  effectiveMethod: PaymentMethod
  reversed: boolean
  adjustments: SalePaymentAdjustment[]
}

type AdjustmentCommand = {
  id: string
  paymentId: string
  kind: SalePaymentAdjustmentKind
  toMethod?: PaymentMethod
  reason: string
  createdBy: string
  createdAt: ISOTimestamp
}

const currency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export interface StoreCreditReversalTarget {
  sale: Sale
  paymentId: string
}

export interface StoreCreditReversalPlan {
  athleteId: string
  balance: number
  entries: StoreCreditEntry[]
}

const adjustmentsForPayment = (sale: Sale, paymentId: string) => Object.values(sale.paymentAdjustments ?? {})
  .filter(adjustment => adjustment.paymentId === paymentId)
  .sort((left, right) => timestampValue(left.createdAt) - timestampValue(right.createdAt) || left.id.localeCompare(right.id))

export function resolveSalePaymentStates(sale: Sale): ResolvedSalePaymentState[] {
  return Object.values(sale.payments ?? {})
    .sort((left, right) => timestampValue(left.appliedAt) - timestampValue(right.appliedAt) || left.id.localeCompare(right.id))
    .map(original => {
      const adjustments = adjustmentsForPayment(sale, original.id)
      let effectiveMethod = original.method
      let reversed = false

      for (const adjustment of adjustments) {
        if (adjustment.kind === 'reversal') {
          reversed = true
          continue
        }

        if (!reversed && adjustment.fromMethod === effectiveMethod && adjustment.toMethod)
          effectiveMethod = adjustment.toMethod
      }

      return { original, effectiveMethod, reversed, adjustments }
    })
}

export function effectiveSalePayments(sale: Sale): SalePayment[] {
  return resolveSalePaymentStates(sale)
    .filter(state => !state.reversed)
    .map(state => ({ ...state.original, method: state.effectiveMethod }))
}

export const effectiveSaleAppliedAmount = (sale: Sale) => currency(effectiveSalePayments(sale)
  .reduce((total, payment) => total + Number(payment.amountApplied || 0), 0))

export const effectiveSaleBalance = (sale: Sale) => currency(Math.max(0, Number(sale.total || 0) - effectiveSaleAppliedAmount(sale)))

export const effectiveSaleStatus = (sale: Sale): SaleStatus => {
  if (sale.status === 'cancelled')
    return 'cancelled'

  return effectiveSaleBalance(sale) <= 0.01 ? 'paid' : 'credit'
}

export function buildSalePaymentAdjustment(sale: Sale, command: AdjustmentCommand): SalePaymentAdjustment {
  const payment = sale.payments?.[command.paymentId]
  if (!payment)
    throw new Error('El pago que intentas corregir no existe.')

  const reason = command.reason.trim()
  if (!reason)
    throw new Error('El motivo de la corrección es obligatorio.')
  if (!command.id || !command.createdBy || !timestampValue(command.createdAt))
    throw new Error('No fue posible auditar la corrección del pago.')

  const state = resolveSalePaymentStates(sale).find(item => item.original.id === payment.id)
  if (!state)
    throw new Error('No fue posible resolver el estado actual del pago.')
  if (state.reversed)
    throw new Error('El pago ya fue revertido.')

  const base = {
    id: command.id,
    saleId: sale.id,
    paymentId: payment.id,
    ...(payment.groupPaymentId ? { groupPaymentId: payment.groupPaymentId } : {}),
    kind: command.kind,
    reason,
    createdBy: command.createdBy,
    createdAt: command.createdAt,
  }

  if (command.kind === 'reversal')
    return { ...base, amount: currency(payment.amountApplied) }

  if (!command.toMethod || command.toMethod === 'store-credit' || state.effectiveMethod === 'store-credit')
    throw new Error('Selecciona un método de pago corregible.')
  if (command.toMethod === state.effectiveMethod)
    throw new Error('El método corregido debe ser distinto al método efectivo actual.')

  return {
    ...base,
    fromMethod: state.effectiveMethod,
    toMethod: command.toMethod,
  }
}

export function buildStoreCreditReversalPlan(
  targets: StoreCreditReversalTarget[],
  account: StoreCreditAccount | null,
  occurredAt: ISOTimestamp,
  operationId: string,
  actorUid: string,
): StoreCreditReversalPlan | null {
  const ordered = [...targets].sort((left, right) => left.sale.id.localeCompare(right.sale.id) || left.paymentId.localeCompare(right.paymentId))
  const effects: Array<{ type: 'refund' | 'reversal'; amount: number; saleId: string; sourceId: string }> = []
  const handledDeposits = new Set<string>()
  let athleteId: string | null = null

  for (const { sale, paymentId } of ordered) {
    const payment = sale.payments?.[paymentId]
    if (!payment)
      throw new Error('El pago que intentas conciliar no existe.')

    if (payment.method === 'store-credit') {
      if (!sale.athleteId)
        throw new Error('No es posible restituir saldo a favor sin un atleta asociado.')
      athleteId = athleteId ?? sale.athleteId
      if (athleteId !== sale.athleteId)
        throw new Error('Los reversos de saldo a favor deben pertenecer al mismo atleta.')
      effects.push({ type: 'refund', amount: currency(payment.amountApplied), saleId: sale.id, sourceId: payment.id })
      continue
    }

    if (!payment.creditBalance)
      continue

    if (!sale.athleteId)
      throw new Error('No es posible conciliar el excedente sin un atleta asociado.')
    athleteId = athleteId ?? sale.athleteId
    if (athleteId !== sale.athleteId)
      throw new Error('Los reversos de saldo a favor deben pertenecer al mismo atleta.')

    const depositIds = [
      payment.groupPaymentId ? `deposit-${payment.groupPaymentId}` : '',
      `deposit-${payment.id}`,
      `deposit-${sale.id}`,
    ].filter(Boolean)

    const deposit = depositIds
      .map(id => account?.entries?.[id])
      .find(entry => entry?.type === 'deposit')

    if (!deposit)
      throw new Error('No se encontró el movimiento original del saldo a favor; no se aplicó ningún cambio.')
    if (handledDeposits.has(deposit.id))
      continue

    handledDeposits.add(deposit.id)
    effects.push({ type: 'reversal', amount: currency(deposit.amount), saleId: sale.id, sourceId: deposit.id })
  }

  if (!effects.length)
    return null
  if (!athleteId || !account || account.athleteId !== athleteId)
    throw new Error('No se encontró la cuenta de saldo a favor requerida para conciliar el reverso.')

  const refunds = currency(effects.filter(effect => effect.type === 'refund').reduce((sum, effect) => sum + effect.amount, 0))
  const deductions = currency(effects.filter(effect => effect.type === 'reversal').reduce((sum, effect) => sum + effect.amount, 0))
  if (currency(account.balance + refunds) < deductions)
    throw new Error('El saldo a favor generado por el cobro ya fue consumido y no puede revertirse automáticamente.')

  const delta = currency(refunds - deductions)
  const balance = currency(account.balance + delta)
  if (Math.abs(delta) <= 0.001)
    return { athleteId, balance, entries: [] }

  const type: StoreCreditEntry['type'] = delta > 0 ? 'refund' : 'reversal'
  const id = `payment-adjustment-${operationId}`

  const entries: StoreCreditEntry[] = [{
    id,
    type,
    amount: Math.abs(delta),
    saleId: effects[0]?.saleId ?? ordered[0]!.sale.id,
    description: type === 'refund'
      ? 'Restitución neta de saldo por reverso de cobro'
      : 'Retiro neto de excedente por reverso de cobro',
    occurredAt,
    balanceAfter: balance,
    createdBy: actorUid,
  }]

  return { athleteId, balance, entries }
}
