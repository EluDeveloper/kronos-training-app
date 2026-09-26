import type { AppliedPromotionSnapshot, ISODate, PlanPromotion } from '@/types/domain'

const datePattern = /^\d{4}-(?:0[1-9]|1[012])-(?:0[1-9]|[12]\d|3[01])$/
const currency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export function promotionScheduleSegment(schedule: string) {
  const normalized = schedule.trim().toLocaleLowerCase('es')
  if (normalized.includes('matut')) return 'Matutino'
  if (normalized.includes('vespert')) return 'Vespertino'
  const time = normalized.match(/^(\d{1,2}):\d{2}\s*(am|pm)$/i)
  if (!time) return schedule.trim()
  const hour = Number(time[1]) % 12 + (time[2]!.toLowerCase() === 'pm' ? 12 : 0)

  return hour < 12 ? 'Matutino' : 'Vespertino'
}

export function validatePlanPromotion(promotion: PlanPromotion) {
  if (promotion.name.trim().length < 2)
    throw new Error('Captura un nombre de promoción válido.')
  if (!datePattern.test(promotion.validFrom) || !datePattern.test(promotion.validThrough) || promotion.validFrom > promotion.validThrough)
    throw new Error('La vigencia de la promoción no es válida.')
  if (!Object.keys(promotion.planIds).length)
    throw new Error('Selecciona al menos un plan.')
  if (promotion.schedules !== 'all' && !promotion.schedules.length)
    throw new Error('Selecciona al menos un horario.')
  if (promotion.discountType === 'percentage' && (!Number.isFinite(promotion.discountValue) || promotion.discountValue <= 0 || promotion.discountValue >= 100))
    throw new Error('El porcentaje debe ser mayor que 0 y menor que 100.')
  if (promotion.discountType === 'fixed-amount' && (!Number.isFinite(promotion.discountValue) || promotion.discountValue <= 0))
    throw new Error('El monto fijo debe ser mayor que cero.')
}

export function resolvePlanPromotion(input: { baseAmount: number; planId: string; schedule: string; businessDate: ISODate; promotions: PlanPromotion[] }) {
  const baseAmount = currency(input.baseAmount)
  const scheduleSegment = promotionScheduleSegment(input.schedule)

  const eligible = input.promotions
    .filter(promotion => promotion.status === 'active' && promotion.validFrom <= input.businessDate && promotion.validThrough >= input.businessDate && Boolean(promotion.planIds[input.planId]) && (promotion.schedules === 'all' || promotion.schedules.includes(scheduleSegment)))
    .map(promotion => {
      const discountAmount = currency(Math.min(baseAmount, promotion.discountType === 'percentage' ? baseAmount * promotion.discountValue / 100 : promotion.discountValue))
      const appliedPromotion: AppliedPromotionSnapshot = { promotionId: promotion.id, name: promotion.name, discountType: promotion.discountType, discountValue: promotion.discountValue, baseAmount, discountAmount, finalAmount: currency(baseAmount - discountAmount) }

      return { promotion, appliedPromotion }
    })
    .sort((left, right) => right.appliedPromotion.discountAmount - left.appliedPromotion.discountAmount || left.promotion.validFrom.localeCompare(right.promotion.validFrom) || left.promotion.id.localeCompare(right.promotion.id))

  const winner = eligible[0]?.appliedPromotion ?? null

  return { baseAmount, discountAmount: winner?.discountAmount ?? 0, finalAmount: winner?.finalAmount ?? baseAmount, appliedPromotion: winner }
}
