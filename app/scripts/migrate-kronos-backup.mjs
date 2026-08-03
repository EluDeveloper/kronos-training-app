import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null }
const sourcePath = resolve(option('--source') ?? '../AppKronos/Backup/kronos_backup_20260803.json')
const outPath = option('--out') ? resolve(option('--out')) : null
const migratedAt = new Date().toISOString()
const months = { enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12' }
const hashId = (prefix, value) => `${prefix}_${createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`
const entries = value => Object.entries(value ?? {})
const list = value => value == null ? [] : Array.isArray(value) ? value : [value]
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0
const text = value => String(value ?? '').trim()
const normalized = value => text(value).toLocaleLowerCase('es')
const method = value => ({ efectivo: 'cash', transferencia: 'transfer', tarjeta: 'card' })[normalized(value)] ?? 'other'
const safeId = (prefix, value) => /^[A-Za-z0-9_-]+$/.test(text(value)) ? text(value) : hashId(prefix, value)
const invariant = (condition, message) => { if (!condition) throw new Error(message) }

const raw = JSON.parse(await readFile(sourcePath, 'utf8'))
const v1 = {
  meta: { schemaVersion: 1, migratedAt, sourceFile: sourcePath.split(/[\\/]/).at(-1) },
  athletes: {}, payments: {}, performance: {}, plans: {}, skills: {}, products: {}, sales: {}, expenses: {}, workouts: {},
  settings: { currency: 'MXN', locale: 'es-MX', timezone: 'America/Mexico_City' },
}
const planIds = new Map()
const skillIds = new Map()
const productIds = new Map()
const athleteIdsByName = new Map()
const warnings = []

for (const [sourceId, source] of entries(raw.catalogoPlanes)) {
  const id = safeId('plan', sourceId)
  planIds.set(sourceId, id)
  v1.plans[id] = { id, name: text(source.nombre), billingPeriod: normalized(source.vigencia) === 'mensual' ? 'monthly' : normalized(source.vigencia) === 'trimestral' ? 'quarterly' : 'other', price: num(source.precio), status: normalized(source.estatus) === 'activo' ? 'active' : 'inactive', createdAt: migratedAt, updatedAt: migratedAt }
}

for (const value of raw.skills ?? []) {
  const name = text(value)
  const id = hashId('skill', normalized(name))
  skillIds.set(normalized(name), id)
  v1.skills[id] = { id, name, status: 'active' }
}

for (const [sourceId, source] of entries(raw.tienda_productos)) {
  const id = safeId('product', source.id_producto || sourceId)
  productIds.set(sourceId, id)
  productIds.set(text(source.id_producto), id)
  v1.products[id] = { id, name: text(source.nombre_producto), category: text(source.categoria), size: text(source.tamano) || null, stock: num(source.stock_actual), alertLevel: num(source.nivel_alerta), unitCost: num(source.costo_unitario), salePrice: num(source.precio_venta), status: 'active', createdAt: migratedAt, updatedAt: migratedAt }
}

for (const [sourceId, source] of entries(raw.atletas)) {
  const id = hashId('athlete', sourceId)
  const profile = source.perfil ?? {}
  const membership = source.membresia ?? {}
  const inactive = normalized(profile.estatus) === 'inactivo'
  athleteIdsByName.set(normalized(profile.nombre), id)
  v1.athletes[id] = {
    id,
    profile: { name: text(profile.nombre), phone: text(profile.telefono), birthDate: text(profile.fecha_nacimiento) || null },
    membership: { schedule: text(membership.horario_base), planId: planIds.get(text(membership.plan_id)) ?? safeId('plan', membership.plan_id), agreedAmount: num(membership.monto_pagado), paymentDay: num(membership.dia_pago), registrationDate: text(membership.fecha_pago_registro) },
    status: inactive ? 'inactive' : 'active', inactiveAt: text(profile.fecha_baja) || null, inactiveReason: text(profile.motivo_baja) || null,
    migrationNeedsReview: inactive && !text(profile.fecha_baja), createdAt: migratedAt, updatedAt: migratedAt,
  }
  v1.payments[id] = {}
  for (const [year, yearPayments] of entries(source.historial_pagos)) {
    for (const [monthName, payment] of entries(yearPayments)) {
      const month = months[normalized(monthName)]
      invariant(month, `Mes desconocido para atleta ${id}: ${monthName}`)
      const period = `${year}-${month}`
      const appliedAt = text(payment.fecha_aplicacion) || null
      v1.payments[id][period] = { athleteId: id, period, status: normalized(payment.estatus) === 'pagado' ? 'paid' : normalized(payment.estatus) === 'n/a' ? 'not-applicable' : 'pending', method: payment.tipo_pago ? method(payment.tipo_pago) : null, amount: payment.monto_real_pagado == null ? null : num(payment.monto_real_pagado), appliedAt, createdAt: appliedAt || migratedAt, updatedAt: appliedAt || migratedAt }
    }
  }
  for (const [skillName, sourceMarks] of entries(source.marcas)) {
    const key = normalized(skillName)
    let skillId = skillIds.get(key)
    if (!skillId) {
      skillId = hashId('skill', key)
      skillIds.set(key, skillId)
      v1.skills[skillId] = { id: skillId, name: skillName, status: 'active' }
      warnings.push(`Skill agregado desde marcas: ${skillName}`)
    }
    v1.performance[id] ??= {}
    v1.performance[id][skillId] ??= {}
    list(sourceMarks).forEach((mark, index) => {
      const recordId = safeId('record', mark.id || `${sourceId}|${skillName}|${mark.date}|${index}`)
      v1.performance[id][skillId][recordId] = { type: text(mark.type) || '1RM', valueLbs: num(mark.valueLbs), valueKg: num(mark.valueKg) || Number((num(mark.valueLbs) * 0.45359237).toFixed(2)), recordedAt: text(mark.date) }
    })
  }
}

for (const source of raw.tienda_ventas ?? []) {
  const id = safeId('sale', source.id_venta)
  const athleteId = athleteIdsByName.get(normalized(source.atleta_nombre)) ?? null
  const rawItems = list(source.items).length ? list(source.items) : [{ id_producto: source.id_producto, nombre: source.producto_nombre, cantidad: source.cantidad, precio_unitario: source.precio_unitario }]
  const items = {}
  rawItems.filter(item => item?.id_producto).forEach((item, index) => {
    const productId = productIds.get(text(item.id_producto)) ?? safeId('product', item.id_producto)
    const product = v1.products[productId]
    items[`${productId}_${index}`] = { productId, name: text(item.nombre) || product?.name || 'Producto migrado', quantity: num(item.cantidad), unitPrice: num(item.precio_unitario), unitCost: num(product?.unitCost) }
  })
  const total = num(source.total_pagar) || Object.values(items).reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const payments = {}
  const received = num(source.monto_recibido)
  const changeGiven = num(source.cambio_entregado)
  const creditBalance = num(source.saldo_a_favor)
  const initialApplied = Math.min(total, Math.max(0, received - changeGiven - creditBalance))
  if (initialApplied > 0) {
    const paymentId = `${id}_initial`
    invariant(text(source.fecha_transaccion), `Venta sin fecha: ${id}`)
    payments[paymentId] = { id: paymentId, amountApplied: initialApplied, method: method(source.tipo_pago), receivedAmount: received, changeGiven, creditBalance, appliedAt: text(source.fecha_transaccion) }
  }
  let applied = initialApplied
  list(source.abonos).forEach((payment, index) => {
    const rawAmount = num(payment.monto)
    const amountApplied = Math.min(Math.max(0, total - applied), rawAmount)
    if (amountApplied <= 0) return
    invariant(text(payment.fecha), `Abono sin fecha en venta ${id}`)
    const paymentId = `${id}_payment_${index + 1}`
    payments[paymentId] = { id: paymentId, amountApplied, method: method(payment.metodo), receivedAmount: rawAmount, changeGiven: 0, appliedAt: text(payment.fecha) }
    applied += amountApplied
    if (rawAmount !== amountApplied) warnings.push(`Abono ajustado al saldo en venta ${id}.`)
  })
  const cancelled = normalized(source.estatus) === 'cancelado'
  v1.sales[id] = { id, athleteId, customerName: text(source.atleta_nombre) || 'Cliente general', items, total, status: cancelled ? 'cancelled' : applied >= total - 0.01 ? 'paid' : 'credit', payments, cancelledAt: cancelled ? text(source.fecha_transaccion) : null, inventoryRestoredAt: cancelled ? text(source.fecha_transaccion) : null, createdAt: text(source.fecha_transaccion), updatedAt: list(source.abonos).at(-1)?.fecha || text(source.fecha_transaccion) }
}

for (const source of raw.egresos ?? []) {
  const id = safeId('expense', source.id)
  const createdAt = text(source.timestamps?.created_at) || `${text(source.fecha)}T12:00:00.000Z`
  v1.expenses[id] = { id, date: text(source.fecha), category: text(source.categoria), subcategory: text(source.subcategoria) || null, description: text(source.descripcion), amount: num(source.monto), method: method(source.tipo_pago), status: normalized(source.estado) === 'pagado' ? 'paid' : normalized(source.estado) === 'programado' ? 'scheduled' : 'pending', registeredBy: text(source.registrado_por) || 'Migración', receiptUrl: text(source.comprobante_url) || null, createdAt, updatedAt: text(source.timestamps?.updated_at) || createdAt }
}

const counts = {
  athletes: Object.keys(v1.athletes).length,
  activeAthletes: Object.values(v1.athletes).filter(item => item.status === 'active').length,
  inactiveAthletes: Object.values(v1.athletes).filter(item => item.status === 'inactive').length,
  athletesToReview: Object.values(v1.athletes).filter(item => item.migrationNeedsReview).length,
  plans: Object.keys(v1.plans).length, skills: Object.keys(v1.skills).length, products: Object.keys(v1.products).length,
  sales: Object.keys(v1.sales).length, expenses: Object.keys(v1.expenses).length,
  performanceRecords: Object.values(v1.performance).flatMap(Object.values).reduce((sum, records) => sum + Object.keys(records).length, 0),
  payments: Object.values(v1.payments).reduce((sum, payments) => sum + Object.keys(payments).length, 0),
}
const expected = { athletes: 55, activeAthletes: 44, inactiveAthletes: 11, athletesToReview: 4, plans: 5, skills: 11, products: 5, sales: 96, expenses: 74, performanceRecords: 97, payments: 660 }
for (const [name, count] of Object.entries(expected)) invariant(counts[name] === count, `Conteo ${name}: se esperaban ${count} y se obtuvieron ${counts[name]}.`)
for (const athlete of Object.values(v1.athletes)) invariant(v1.plans[athlete.membership.planId], `Plan inexistente en atleta ${athlete.id}.`)
for (const sale of Object.values(v1.sales)) for (const item of Object.values(sale.items)) invariant(v1.products[item.productId], `Producto inexistente en venta ${sale.id}.`)

console.log(JSON.stringify({ source: sourcePath, valid: true, counts, warnings: warnings.length }, null, 2))
warnings.forEach(warning => console.warn(`AVISO: ${warning}`))
if (outPath) {
  await writeFile(outPath, `${JSON.stringify(v1, null, 2)}\n`, { flag: 'wx' })
  console.log(`Archivo generado: ${outPath}`)
}
