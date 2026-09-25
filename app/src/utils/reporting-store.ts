import type { SalePayment } from '@/types/domain'
import type { ReportingDataQuality, ReportingFilters, ReportingSaleSource } from '@/types/reporting'
import { dateForBusinessTimeZone } from './reporting-periods'
import { allocateCentsProportionally, currency } from './reporting-metrics'
import { effectiveSaleStatus, resolveSalePaymentStates, type SalePaymentStateSource } from './store-payment-adjustments'

export type StoreMetricKey = 'unitsSold' | 'recognizedRevenue' | 'historicalCost' | 'grossProfit' | 'grossMargin' | 'collected' | 'recovered' | 'receivable' | 'cancellations'

export interface StoreReportPayment {
  paymentId: string
  appliedAt: string
  method: SalePayment['method']
  amount: number
  recovered: boolean
}

export interface StoreReportRow {
  saleId: string
  productId: string
  productName: string
  saleDate: string
  cancellationDate: string | null
  quantity: number
  recognizedUnits: number
  recognizedRevenue: number
  historicalCost: number | null
  collected: number
  recovered: number
  receivable: number
  cancellationAmount: number
  quality: ReportingDataQuality
  payments: StoreReportPayment[]
}

export interface StoreReport {
  summary: {
    unitsSold: number
    recognizedRevenue: number
    historicalCost: number | null
    grossProfit: number | null
    grossMargin: number | null
    collected: number
    recovered: number
    receivable: number
    cancellations: number
    quality: ReportingDataQuality
    qualityByMetric: Record<StoreMetricKey, ReportingDataQuality>
  }
  rows: StoreReportRow[]
}

const between = (value: string, filters: ReportingFilters) => value >= filters.from && value <= filters.through
function effectivePaymentsAt(sale: ReportingSaleSource & SalePaymentStateSource, through: string): SalePayment[] {
  return resolveSalePaymentStates(sale).flatMap(state => {
    let method = state.original.method
    let reversed = false
    for (const adjustment of state.adjustments) {
      if (dateForBusinessTimeZone(adjustment.createdAt) > through)
        continue
      if (adjustment.kind === 'reversal') {
        reversed = true
        continue
      }
      if (!reversed && adjustment.fromMethod === method && adjustment.toMethod)
        method = adjustment.toMethod
    }

    return reversed ? [] : [{ ...state.original, method }]
  })
}

function lineWeights(sale: ReportingSaleSource) {
  const items = Object.values(sale.items ?? {})
  const valueWeights = items.map(item => ({ id: item.productId, weight: Math.max(0, Number(item.quantity || 0) * Number(item.unitPrice || 0)) }))
  if (valueWeights.reduce((sum, item) => sum + item.weight, 0) > 0)
    return valueWeights

  return items.map(item => ({ id: item.productId, weight: Math.max(0, Number(item.quantity || 0)) }))
}

export function buildStoreReport(sales: ReportingSaleSource[], filters: ReportingFilters): StoreReport {
  const rows: StoreReportRow[] = []
  let unitsSold = 0
  let recognizedRevenue = 0
  let historicalCost = 0
  let collected = 0
  let recovered = 0
  let receivable = 0
  let cancellations = 0
  let quality: ReportingDataQuality = 'exact'
  let hasMissingHistoricalCost = false

  for (const sale of sales) {
    if (filters.athleteId && sale.athleteId !== filters.athleteId)
      continue
    const saleDate = dateForBusinessTimeZone(sale.createdAt)
    if (saleDate > filters.through)
      continue

    const weights = lineWeights(sale)
    if (!weights.length)
      continue
    const selectedIds = new Set(filters.productIds)
    const selectedItems = Object.values(sale.items ?? {}).filter(item => !selectedIds.size || selectedIds.has(item.productId))
    if (!selectedItems.length)
      continue

    const allocationWeights = weights
    const saleAllocation = allocateCentsProportionally(Number(sale.total || 0), allocationWeights)
    const paymentsAtCutoff = effectivePaymentsAt(sale, filters.through)

    const appliedAtCutoff = paymentsAtCutoff
      .filter(payment => dateForBusinessTimeZone(payment.appliedAt) <= filters.through)
      .reduce((sum, payment) => sum + Number(payment.amountApplied || 0), 0)

    const balanceAtCutoff = currency(Math.max(0, Number(sale.total || 0) - appliedAtCutoff))
    const receivableAllocation = allocateCentsProportionally(balanceAtCutoff, allocationWeights)
    const saleInPeriod = between(saleDate, filters)
    const cancelDate = dateForBusinessTimeZone(sale.cancelledAt ?? sale.updatedAt)
    const cancelled = effectiveSaleStatus(sale) === 'cancelled' && cancelDate <= filters.through
    const statusAtCutoff = cancelled ? 'cancelled' : balanceAtCutoff <= 0.01 ? 'paid' : 'credit'
    if (filters.status && filters.status !== statusAtCutoff)
      continue

    for (const item of selectedItems) {
      const productId = item.productId
      const productQuantity = Number(item.quantity || 0)
      const lineRevenue = saleAllocation[productId] ?? 0
      const hasHistoricalCost = Number.isFinite(item.unitCost) && item.unitCost >= 0
      const recognizedInPeriod = saleInPeriod && !cancelled
      if (recognizedInPeriod && !hasHistoricalCost)
        hasMissingHistoricalCost = true
      const lineCost = hasHistoricalCost ? currency(productQuantity * item.unitCost) : null

      const lineAppliedPayments = paymentsAtCutoff.filter(payment => {
        const paymentDate = dateForBusinessTimeZone(payment.appliedAt)

        return between(paymentDate, filters) && (!filters.paymentMethod || payment.method === filters.paymentMethod)
      })

      const paymentDetails = lineAppliedPayments.map(payment => {
        const paymentDate = dateForBusinessTimeZone(payment.appliedAt)
        const paymentAllocation = allocateCentsProportionally(Number(payment.amountApplied || 0), allocationWeights)
        const amount = paymentAllocation[productId] ?? 0

        return {
          paymentId: payment.id,
          appliedAt: paymentDate,
          method: payment.method,
          amount,
          recovered: paymentDate > saleDate,
        }
      }).filter(payment => payment.amount > 0)

      const collectedForProduct = paymentDetails.reduce((sum, payment) => sum + payment.amount, 0)
      const recoveredForProduct = paymentDetails.filter(payment => payment.recovered).reduce((sum, payment) => sum + payment.amount, 0)

      const lineReceivable = cancelled ? 0 : receivableAllocation[productId] ?? 0
      const cancellationAmount = cancelled && between(cancelDate, filters) ? lineRevenue : 0
      if (recognizedInPeriod) {
        unitsSold += productQuantity
        recognizedRevenue += lineRevenue
        if (lineCost !== null)
          historicalCost += lineCost
      }
      collected += collectedForProduct
      recovered += recoveredForProduct
      receivable += lineReceivable
      cancellations += cancellationAmount

      const rowQuality: ReportingDataQuality = weights.length > 1 ? 'proportional' : 'exact'
      if (rowQuality === 'proportional') quality = 'proportional'
      rows.push({
        saleId: sale.id,
        productId,
        productName: item.name,
        saleDate,
        cancellationDate: cancelled ? cancelDate : null,
        quantity: productQuantity,
        recognizedUnits: recognizedInPeriod ? productQuantity : 0,
        recognizedRevenue: recognizedInPeriod ? lineRevenue : 0,
        historicalCost: recognizedInPeriod ? lineCost : 0,
        collected: collectedForProduct,
        recovered: recoveredForProduct,
        receivable: lineReceivable,
        cancellationAmount,
        quality: rowQuality,
        payments: paymentDetails,
      })
    }
  }

  recognizedRevenue = currency(recognizedRevenue)
  historicalCost = currency(historicalCost)

  const finalHistoricalCost = hasMissingHistoricalCost ? null : currency(historicalCost)
  const grossProfit = finalHistoricalCost === null ? null : currency(recognizedRevenue - finalHistoricalCost)
  const allocatedQuality: ReportingDataQuality = quality === 'proportional' ? 'proportional' : 'exact'
  const costQuality: ReportingDataQuality = hasMissingHistoricalCost ? 'partial-history' : 'exact'

  const metricQuality: Record<StoreMetricKey, ReportingDataQuality> = {
    unitsSold: 'exact',
    recognizedRevenue: allocatedQuality,
    historicalCost: costQuality,
    grossProfit: hasMissingHistoricalCost ? 'partial-history' : allocatedQuality,
    grossMargin: recognizedRevenue <= 0 ? 'unavailable' : hasMissingHistoricalCost ? 'partial-history' : allocatedQuality,
    collected: allocatedQuality,
    recovered: allocatedQuality,
    receivable: allocatedQuality,
    cancellations: allocatedQuality,
  }

  return {
    summary: {
      unitsSold,
      recognizedRevenue,
      historicalCost: finalHistoricalCost,
      grossProfit,
      grossMargin: recognizedRevenue > 0 && grossProfit !== null ? currency(grossProfit / recognizedRevenue * 100) : null,
      collected: currency(collected),
      recovered: currency(recovered),
      receivable: currency(receivable),
      cancellations: currency(cancellations),
      quality,
      qualityByMetric: metricQuality,
    },
    rows,
  }
}
