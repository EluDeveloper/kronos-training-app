import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlanPromotion } from '../src/types/domain'
import { resolvePlanPromotion, validatePlanPromotion } from '../src/utils/plan-promotions'
import { businessDateInMexicoCity } from '../src/utils/business-date'

const promotion = (overrides: Partial<PlanPromotion> = {}): PlanPromotion => ({
  id: 'promo-1', name: 'Temporada', discountType: 'percentage', discountValue: 20,
  validFrom: '2026-09-01', validThrough: '2026-09-30', planIds: { plan: true },
  schedules: 'all', status: 'active', createdAt: 1, updatedAt: 1, ...overrides,
})

test('elige la promoción de mayor ahorro sin acumular descuentos', () => {
  const quote = resolvePlanPromotion({ baseAmount: 1000, planId: 'plan', schedule: 'Matutino', businessDate: '2026-09-15', promotions: [
    promotion(), promotion({ id: 'fixed', discountType: 'fixed-amount', discountValue: 250 }),
  ] })

  assert.equal(quote.finalAmount, 750)
  assert.equal(quote.appliedPromotion?.promotionId, 'fixed')
})

test('una promoción fija igual o mayor al importe acordado vuelve gratuita la mensualidad', () => {
  for (const discountValue of [500, 800]) {
    const quote = resolvePlanPromotion({ baseAmount: 500, planId: 'plan', schedule: 'Matutino', businessDate: '2026-09-15', promotions: [
      promotion({ discountType: 'fixed-amount', discountValue }),
    ] })

    assert.equal(quote.finalAmount, 0)
    assert.equal(quote.discountAmount, 500)
    assert.equal(quote.appliedPromotion?.finalAmount, 0)
  }
})

test('respeta vigencia, plan y horario sin modificar el precio fuera de elegibilidad', () => {
  const quote = resolvePlanPromotion({ baseAmount: 800, planId: 'plan', schedule: 'Vespertino', businessDate: '2026-10-01', promotions: [
    promotion({ schedules: ['Matutino'] }),
  ] })

  assert.deepEqual(quote, { baseAmount: 800, discountAmount: 0, finalAmount: 800, appliedPromotion: null })
})

test('clasifica los horarios libres existentes como matutinos o vespertinos', () => {
  const matutino = resolvePlanPromotion({ baseAmount: 500, planId: 'plan', schedule: '06:00 AM', businessDate: '2026-09-15', promotions: [promotion({ schedules: ['Matutino'] })] })
  const vespertino = resolvePlanPromotion({ baseAmount: 500, planId: 'plan', schedule: '06:00 PM', businessDate: '2026-09-15', promotions: [promotion({ schedules: ['Vespertino'] })] })

  assert.equal(matutino.finalAmount, 400)
  assert.equal(vespertino.finalAmount, 400)
})

test('valida porcentaje y monto fijo dentro de límites', () => {
  assert.throws(() => validatePlanPromotion(promotion({ discountValue: 100 })), /porcentaje/i)
  assert.throws(() => validatePlanPromotion(promotion({ discountType: 'fixed-amount', discountValue: 0 })), /monto/i)
  assert.throws(() => validatePlanPromotion(promotion({ validFrom: '2026-10-01', validThrough: '2026-09-01' })), /vigencia/i)
})

test('usa la fecha de Ciudad de México para la vigencia', () => {
  assert.equal(businessDateInMexicoCity(new Date('2026-10-01T04:30:00.000Z')), '2026-09-30')
  assert.equal(businessDateInMexicoCity(new Date('2026-10-01T06:30:00.000Z')), '2026-10-01')
})
