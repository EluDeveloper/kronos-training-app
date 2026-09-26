import { membershipDueDate } from '@/utils/membership-periods'
import type { ReportingDataQuality, ReportingFilters, ReportingMembershipSource } from '@/types/reporting'
import { dateForBusinessTimeZone } from './reporting-periods'
import { currency } from './reporting-metrics'

export interface MembershipReport {
  summary: { expected: number | null; collected: number; overdue: number | null; advanced: number | null; receivable: number | null; quality: ReportingDataQuality }
  rows: Array<{
    athleteId: string
    period: string
    dueDate: string | null
    expected: number | null
    collected: number
    balance: number | null
    complimentary: boolean
    promotionName: string | null
    discountAmount: number
    status: 'paid' | 'pending' | 'overdue' | 'advance' | 'unavailable'
    quality: ReportingDataQuality
    movements: Array<{ id: string; amount: number; method: string; effectiveDate: string }>
  }>
}

export function buildMembershipReport(payments: ReportingMembershipSource[], filters: ReportingFilters, options: { asOf?: string } = {}): MembershipReport {
  const asOf = options.asOf ?? filters.through
  const rows: MembershipReport['rows'] = []
  let expected = 0
  let collected = 0
  let overdue = 0
  let advanced = 0
  let receivable = 0
  let quality: ReportingDataQuality = 'exact'
  let hasUnknownExpected = false
  let hasUnknownDueDate = false

  for (const payment of payments) {
    if (filters.athleteId && payment.athleteId !== filters.athleteId)
      continue
    const dueDate = payment.snapshot?.dueDate ?? null

    const monthInScope = `${payment.period}-01` >= `${filters.from.slice(0, 7)}-01`
      && `${payment.period}-01` <= `${filters.through.slice(0, 7)}-01`

    if (!monthInScope && (!dueDate || dueDate < filters.from || dueDate > filters.through))
      continue

    const installments = Object.values(payment.installments ?? {})

    const periodPayments = installments.filter(installment => {
      const paidDate = dateForBusinessTimeZone(installment.appliedAt)

      return paidDate >= filters.from && paidDate <= filters.through && paidDate <= asOf
        && (!filters.paymentMethod || installment.method === filters.paymentMethod)
    })

    const expectedValue = payment.totalAmount ?? payment.snapshot?.agreedAmount ?? null
    const totalExpected = expectedValue === null ? null : Number(expectedValue)

    const amountPaidAtCutoff = installments
      .filter(installment => dateForBusinessTimeZone(installment.appliedAt) <= asOf)
      .reduce((sum, installment) => sum + Number(installment.amountApplied || 0), 0)

    const legacy = !payment.snapshot
    const rowQuality: ReportingDataQuality = expectedValue === null ? 'unavailable' : legacy ? 'partial-history' : 'exact'
    if (rowQuality === 'unavailable') {
      quality = 'unavailable'
      hasUnknownExpected = true
    }
    else if (legacy && quality !== 'unavailable') {
      quality = 'partial-history'
    }
    const rowDueDate = dueDate ?? (legacy ? null : membershipDueDate(payment.period, payment.snapshot!.paymentDay))
    if (!rowDueDate)
      hasUnknownDueDate = true
    const balance = totalExpected === null ? null : currency(Math.max(0, totalExpected - amountPaidAtCutoff))

    const rowCollected = periodPayments.reduce((sum, installment) => sum + Number(installment.amountApplied || 0), 0)

    const rowAdvanced = rowDueDate
      ? installments.filter(installment => dateForBusinessTimeZone(installment.appliedAt) < rowDueDate && dateForBusinessTimeZone(installment.appliedAt) <= asOf
        && (!filters.paymentMethod || installment.method === filters.paymentMethod))
        .reduce((sum, installment) => sum + Number(installment.amountApplied || 0), 0)
      : 0

    const state = balance === null || !rowDueDate
      ? 'unavailable'
      : balance <= 0
        ? 'paid'
        : rowDueDate < asOf ? 'overdue' : rowAdvanced > 0 ? 'advance' : 'pending'

    if (filters.membershipStatus && filters.membershipStatus !== state)
      continue

    if (rowDueDate && rowDueDate >= filters.from && rowDueDate <= filters.through) {
      if (totalExpected !== null)
        expected += totalExpected
    }
    else if (!rowDueDate && monthInScope && totalExpected !== null) {
      expected += totalExpected
    }
    collected += rowCollected
    if (state === 'overdue' && balance !== null) overdue += balance
    if (rowDueDate && rowDueDate >= filters.from && rowDueDate <= filters.through) advanced += rowAdvanced
    if (balance !== null)
      receivable += balance
    rows.push({
      athleteId: payment.athleteId,
      period: payment.period,
      dueDate: rowDueDate,
      expected: totalExpected === null ? null : currency(totalExpected),
      collected: currency(rowCollected),
      balance,
      complimentary: totalExpected === 0 && payment.status === 'paid' && payment.snapshot?.promotion?.finalAmount === 0,
      promotionName: payment.snapshot?.promotion?.name ?? null,
      discountAmount: currency(payment.snapshot?.promotion?.discountAmount ?? 0),
      status: state,
      quality: rowQuality,
      movements: periodPayments.map(installment => ({
        id: installment.id,
        amount: currency(installment.amountApplied),
        method: installment.method,
        effectiveDate: dateForBusinessTimeZone(installment.appliedAt),
      })),
    })
  }

  return {
    summary: {
      expected: hasUnknownExpected ? null : currency(expected),
      collected: currency(collected),
      overdue: hasUnknownDueDate ? null : currency(overdue),
      advanced: hasUnknownDueDate ? null : currency(advanced),
      receivable: hasUnknownExpected ? null : currency(receivable),
      quality,
    },
    rows,
  }
}
