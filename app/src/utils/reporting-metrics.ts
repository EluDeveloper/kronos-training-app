import type { ReportingMetricDefinition } from '@/types/reporting'

export const currency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export const metricDefinitions: ReportingMetricDefinition[] = [
  { key: 'unitsSold', label: 'Artículos vendidos', unit: 'count', meaning: 'Unidades vendidas en ventas no canceladas.', attribution: 'sale-date' },
  { key: 'recognizedRevenue', label: 'Venta reconocida', unit: 'currency', meaning: 'Importe de ventas no canceladas, independiente de su cobro.', attribution: 'sale-date' },
  { key: 'historicalCost', label: 'Costo histórico', unit: 'currency', meaning: 'Costo unitario guardado en cada partida al momento de venta.', attribution: 'sale-date' },
  { key: 'grossProfit', label: 'Utilidad bruta', unit: 'currency', meaning: 'Venta reconocida menos costo histórico; no representa utilidad neta ni flujo.', attribution: 'sale-date' },
  { key: 'grossMargin', label: 'Margen bruto', unit: 'percentage', meaning: 'Utilidad bruta dividida entre venta reconocida.', attribution: 'sale-date' },
  { key: 'collected', label: 'Cobrado', unit: 'currency', meaning: 'Pagos efectivos aplicados, incluidos saldo a favor. No equivale a flujo de caja y no netea devoluciones sin registro auditable.', attribution: 'movement-date' },
  { key: 'recovered', label: 'Recuperado', unit: 'currency', meaning: 'Cobros aplicados después de la fecha de venta, atribuidos proporcionalmente por producto si corresponde.', attribution: 'movement-date' },
  { key: 'receivable', label: 'Cuentas por cobrar', unit: 'currency', meaning: 'Saldo efectivo pendiente al corte.', attribution: 'cutoff-date' },
  { key: 'cancellations', label: 'Cancelaciones', unit: 'currency', meaning: 'Importe cancelado por la fecha efectiva de cancelación.', attribution: 'event-date' },
  { key: 'athletesActive', label: 'Atletas activos', unit: 'count', meaning: 'Atletas cuyo estado auditado al corte es activo.', attribution: 'cutoff-date' },
  { key: 'athletesPaused', label: 'Atletas pausados', unit: 'count', meaning: 'Atletas cuyo estado auditado al corte es pausado.', attribution: 'cutoff-date' },
  { key: 'athletesInactive', label: 'Atletas de baja', unit: 'count', meaning: 'Atletas cuyo estado auditado al corte es baja.', attribution: 'cutoff-date' },
  { key: 'athleteEnrollments', label: 'Altas', unit: 'count', meaning: 'Eventos auditables de alta efectiva.', attribution: 'event-date' },
  { key: 'athletePauses', label: 'Pausas', unit: 'count', meaning: 'Eventos auditables de pausa efectiva.', attribution: 'event-date' },
  { key: 'athleteExits', label: 'Bajas', unit: 'count', meaning: 'Eventos auditables de baja efectiva.', attribution: 'event-date' },
  { key: 'athleteReactivations', label: 'Reactivaciones', unit: 'count', meaning: 'Eventos auditables de reactivación.', attribution: 'event-date' },
  { key: 'athleteRetention', label: 'Retención', unit: 'percentage', meaning: 'Retención sólo cuando exista una cohorte y ventana temporal suficientes.', attribution: 'cutoff-date' },
  { key: 'membershipExpected', label: 'Mensualidad esperada', unit: 'currency', meaning: 'Obligación mensual respaldada por snapshot de periodo.', attribution: 'cutoff-date' },
  { key: 'membershipCollected', label: 'Mensualidad cobrada', unit: 'currency', meaning: 'Abonos de mensualidad efectivos por fecha de aplicación.', attribution: 'movement-date' },
  { key: 'membershipOverdue', label: 'Mensualidad vencida', unit: 'currency', meaning: 'Saldo positivo cuyo vencimiento pasó al corte.', attribution: 'cutoff-date' },
  { key: 'membershipAdvanced', label: 'Mensualidad adelantada', unit: 'currency', meaning: 'Pago aplicado a un periodo futuro.', attribution: 'movement-date' },
  { key: 'membershipReceivable', label: 'Saldo pendiente de mensualidad', unit: 'currency', meaning: 'Saldo de mensualidades al corte.', attribution: 'cutoff-date' },
  { key: 'inventoryDifferences', label: 'Diferencias de inventario', unit: 'count', meaning: 'Unidades de variación registradas en cierres finalizados.', attribution: 'event-date' },
  { key: 'inventoryRecovered', label: 'Unidades recuperadas', unit: 'count', meaning: 'Unidades resueltas como encontradas.', attribution: 'event-date' },
  { key: 'inventoryCovered', label: 'Faltantes cubiertos', unit: 'currency', meaning: 'Importe efectivamente registrado como cubierto.', attribution: 'movement-date' },
  { key: 'inventoryWrittenOff', label: 'Fondo perdido', unit: 'currency', meaning: 'Valor reconocido como pérdida de inventario; no es egreso de caja.', attribution: 'event-date' },
  { key: 'workAccrued', label: 'Trabajo devengado', unit: 'currency', meaning: 'Trabajo aprobado o pagado, basado en su registro de trabajo.', attribution: 'work-date' },
  { key: 'workPaid', label: 'Trabajo pagado', unit: 'currency', meaning: 'Trabajo enlazado a liquidaciones efectivas.', attribution: 'movement-date' },
  { key: 'workPending', label: 'Trabajo pendiente de pago', unit: 'currency', meaning: 'Trabajo devengado aún no liquidado.', attribution: 'work-date' },
  { key: 'expenses', label: 'Egresos pagados', unit: 'currency', meaning: 'Egresos con estado pagado.', attribution: 'movement-date' },
  { key: 'cashFlow', label: 'Flujo de efectivo', unit: 'currency', meaning: 'Movimientos efectivos por cuenta; no equivale a ingreso reconocido ni utilidad.', attribution: 'movement-date' },
  { key: 'cashVariance', label: 'Diferencia de conciliación', unit: 'currency', meaning: 'Diferencia entre importe esperado y contado en el cierre.', attribution: 'cutoff-date' },
]

export function allocateCentsProportionally(total: number, items: Array<{ id: string; weight: number }>): Record<string, number> {
  const amount = currency(total)
  if (amount < 0)
    throw new Error('La distribución proporcional requiere un importe no negativo.')
  const ids = new Set(items.map(item => item.id))
  if (ids.size !== items.length)
    throw new Error('Los identificadores de distribución deben ser únicos.')
  if (items.some(item => !Number.isFinite(item.weight) || item.weight < 0))
    throw new Error('Los pesos de distribución deben ser números no negativos.')

  const result = Object.fromEntries(items.map(item => [item.id, 0])) as Record<string, number>
  const weightTotal = items.reduce((sum, item) => sum + item.weight, 0)
  const totalCents = Math.round(amount * 100)
  if (!items.length || weightTotal <= 0 || totalCents === 0)
    return result

  const fractions = items.map(item => {
    const exactCents = totalCents * item.weight / weightTotal
    const baseCents = Math.floor(exactCents)

    result[item.id] = baseCents / 100

    return { id: item.id, fraction: exactCents - baseCents }
  })

  const centsLeft = totalCents - Object.values(result).reduce((sum, value) => sum + Math.round(value * 100), 0)

  fractions.sort((left, right) => right.fraction - left.fraction || left.id.localeCompare(right.id))
  fractions.slice(0, centsLeft).forEach(item => {
    result[item.id] = currency(result[item.id]! + 0.01)
  })

  return result
}
