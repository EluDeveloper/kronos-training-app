import type { ReportingDataQuality, ReportingDateRange, ReportingMetricDefinition } from '@/types/reporting'
import { metricDefinitions } from './reporting-metrics'
import type { StoreMetricKey, StoreReport } from './reporting-store'

export interface ExecutiveStoreMetric extends Omit<ReportingMetricDefinition, 'key'> {
  key: StoreMetricKey
  value: number | null
  quality: StoreReport['summary']['qualityByMetric'][StoreMetricKey]
}

export interface StoreTimelinePoint {
  bucket: string
  label: string
  recognizedRevenue: number
  collected: number
  recovered: number
}

export interface StoreDetailRecord {
  key: string
  saleId: string
  productId: string
  productName: string
  date: string
  amount: number | null
  quantity: number
  quality: ReportingDataQuality
  payment?: { id: string; method: string; recovered: boolean }
}

const executiveMetricKeys: StoreMetricKey[] = [
  'unitsSold',
  'recognizedRevenue',
  'historicalCost',
  'grossProfit',
  'grossMargin',
  'collected',
  'recovered',
  'receivable',
  'cancellations',
]

export function storeMetricFromQuery(value: unknown): StoreMetricKey | null {
  return typeof value === 'string' && executiveMetricKeys.includes(value as StoreMetricKey)
    ? value as StoreMetricKey
    : null
}

export function buildExecutiveStoreMetrics(summary: StoreReport['summary']): ExecutiveStoreMetric[] {
  const definitions = new Map(metricDefinitions.map(definition => [definition.key, definition]))

  return executiveMetricKeys.map(key => {
    const definition = definitions.get(key)
    if (!definition)
      throw new Error(`Falta la definición del indicador ${key}.`)

    return {
      ...definition,
      key,
      value: summary[key],
      quality: summary.qualityByMetric[key],
    }
  })
}

function bucketFor(date: string, monthly: boolean) {
  return monthly ? date.slice(0, 7) : date
}

function labelForBucket(bucket: string, monthly: boolean) {
  const date = new Date(`${monthly ? `${bucket}-01` : bucket}T00:00:00.000Z`)

  const options: Intl.DateTimeFormatOptions = monthly
    ? { timeZone: 'UTC', month: 'short', year: 'numeric' }
    : { timeZone: 'UTC', day: '2-digit', month: 'short' }

  return new Intl.DateTimeFormat('es-MX', options).format(date)
}

export function buildStoreTimeline(report: StoreReport, period: ReportingDateRange): StoreTimelinePoint[] {
  const spanDays = (new Date(`${period.through}T00:00:00.000Z`).getTime() - new Date(`${period.from}T00:00:00.000Z`).getTime()) / 86_400_000
  const monthly = spanDays > 90
  const points = new Map<string, StoreTimelinePoint>()

  const pointFor = (date: string) => {
    const bucket = bucketFor(date, monthly)
    let point = points.get(bucket)
    if (!point) {
      point = { bucket, label: labelForBucket(bucket, monthly), recognizedRevenue: 0, collected: 0, recovered: 0 }
      points.set(bucket, point)
    }

    return point
  }

  for (const row of report.rows) {
    if (row.recognizedRevenue !== 0)
      pointFor(row.saleDate).recognizedRevenue += row.recognizedRevenue

    for (const payment of row.payments) {
      if (payment.amount === 0)
        continue
      const point = pointFor(payment.appliedAt)

      point.collected += payment.amount
      if (payment.recovered)
        point.recovered += payment.amount
    }
  }

  return [...points.values()].sort((left, right) => left.bucket.localeCompare(right.bucket))
}

export function buildStoreDetailRecords(report: StoreReport, metric: StoreMetricKey): StoreDetailRecord[] {
  if (metric === 'collected' || metric === 'recovered') {
    return report.rows.flatMap(row => row.payments
      .filter(payment => metric === 'collected' || payment.recovered)
      .map(payment => ({
        key: `${payment.paymentId}:${row.productId}`,
        saleId: row.saleId,
        productId: row.productId,
        productName: row.productName,
        date: payment.appliedAt,
        amount: payment.amount,
        quantity: row.quantity,
        quality: report.summary.qualityByMetric[metric],
        payment: { id: payment.paymentId, method: payment.method, recovered: payment.recovered },
      })))
  }

  return report.rows.flatMap(row => {
    let amount: number | null
    let include: boolean
    switch (metric) {
    case 'unitsSold':
      amount = row.recognizedUnits
      include = row.recognizedUnits > 0
      break
    case 'recognizedRevenue':
      amount = row.recognizedRevenue
      include = row.recognizedUnits > 0
      break
    case 'historicalCost':
      amount = row.historicalCost
      include = row.recognizedUnits > 0
      break
    case 'grossProfit':
      amount = row.historicalCost === null ? null : row.recognizedRevenue - row.historicalCost
      include = row.recognizedUnits > 0
      break
    case 'grossMargin':
      amount = row.historicalCost === null || row.recognizedRevenue <= 0
        ? null
        : (row.recognizedRevenue - row.historicalCost) / row.recognizedRevenue * 100
      include = row.recognizedUnits > 0
      break
    case 'receivable':
      amount = row.receivable
      include = row.receivable > 0
      break
    case 'cancellations':
      amount = row.cancellationAmount
      include = row.cancellationAmount > 0
      break
    }
    if (!include)
      return []

    return [{
      key: `${row.saleId}:${row.productId}`,
      saleId: row.saleId,
      productId: row.productId,
      productName: row.productName,
      date: metric === 'cancellations' ? row.cancellationDate ?? row.saleDate : row.saleDate,
      amount,
      quantity: metric === 'unitsSold' ? row.recognizedUnits : row.quantity,
      quality: report.summary.qualityByMetric[metric],
    }]
  })
}
