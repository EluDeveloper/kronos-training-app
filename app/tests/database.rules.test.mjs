import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'

let env
const projectId = 'demo-kronos-training'
const device = enabled => ({ enabled, label: 'Prueba', createdAt: Date.now() })
const product = stock => ({ id: 'product-1', name: 'Producto de prueba', category: 'Prueba', size: null, stock, alertLevel: 1, unitCost: 10, salePrice: 20, status: 'active', createdAt: Date.now(), updatedAt: Date.now() })
const athlete = { id: 'athlete-1', profile: { name: 'Atleta de prueba', phone: '0000000000', birthDate: '2000-01-01' }, membership: { schedule: 'Matutino', planId: 'plan-1', agreedAmount: 500, paymentDay: 5, registrationDate: '2026-01-01' }, status: 'active', createdAt: Date.now(), updatedAt: Date.now() }
const visitor = { id: 'visitor-1', name: 'Visitante de prueba', phone: '5512345678', pricePerVisit: 100, createdAt: Date.now(), updatedAt: Date.now() }

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    database: { rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearDatabase()
  await env.withSecurityRulesDisabled(async context => {
    const db = context.database()
    await db.ref('v1/authorizedDevices/authorized').set(device(true))
    await db.ref('v1/authorizedDevices/waiting').set(device(false))
    await db.ref('v1/products/product-1').set(product(2))
    await db.ref('v1/visitors/visitor-1').set(visitor)
  })
})

after(async () => env?.cleanup())

test('un usuario no autenticado no puede leer datos del negocio', async () => {
  const db = env.unauthenticatedContext().database()
  await assertFails(db.ref('v1/athletes').once('value'))
})

test('un dispositivo pendiente sólo puede leer su propia autorización', async () => {
  const db = env.authenticatedContext('waiting').database()
  const snapshot = await assertSucceeds(db.ref('v1/authorizedDevices/waiting').once('value'))
  assert.equal(snapshot.val().enabled, false)
  await assertFails(db.ref('v1/products').once('value'))
  await assertFails(db.ref('v1/authorizedDevices/authorized').once('value'))
})

test('el cliente no puede autorizarse a sí mismo', async () => {
  const db = env.authenticatedContext('waiting').database()
  await assertFails(db.ref('v1/authorizedDevices/waiting/enabled').set(true))
})

test('un dispositivo autorizado puede leer y crear entidades válidas', async () => {
  const db = env.authenticatedContext('authorized').database()
  await assertSucceeds(db.ref('v1/products').once('value'))
  await assertSucceeds(db.ref('v1/athletes/athlete-1').set(athlete))
})

test('las reglas impiden inventario negativo', async () => {
  const db = env.authenticatedContext('authorized').database()
  await assertFails(db.ref('v1/products/product-1').update({ stock: -1, updatedAt: Date.now() }))
})

test('una venta y su decremento de inventario se escriben de forma atómica', async () => {
  const db = env.authenticatedContext('authorized').database()
  const now = Date.now()
  const sale = { id: 'sale-1', athleteId: null, customerName: 'Cliente de prueba', items: { line1: { productId: 'product-1', name: 'Producto de prueba', quantity: 1, unitPrice: 20, unitCost: 10 } }, total: 20, status: 'paid', payments: { initial: { id: 'initial', amountApplied: 20, method: 'cash', appliedAt: now } }, createdAt: now, updatedAt: now }
  await assertSucceeds(db.ref('v1').update({ 'sales/sale-1': sale, 'products/product-1/stock': 1, 'products/product-1/updatedAt': now }))
})

test('meta y lista de dispositivos no se pueden modificar desde el cliente', async () => {
  const db = env.authenticatedContext('authorized').database()
  await assertFails(db.ref('v1/meta/schemaVersion').set(2))
  await assertFails(db.ref('v1/authorizedDevices/another').set(device(true)))
})

test('las visitas válidas respetan atleta y periodo de la ruta', async () => {
  const db = env.authenticatedContext('authorized').database()
  const now = Date.now()
  const visit = { id: 'visit-1', athleteId: 'athlete-1', period: '2026-08', visitedAt: now, planId: 'plan-1', accessType: 'visit-pack', unitPrice: 0, note: null, createdAt: now, updatedAt: now }
  await assertSucceeds(db.ref('v1/visits/athlete-1/2026-08/visit-1').set(visit))
  await assertFails(db.ref('v1/visits/another-athlete/2026-08/visit-1').set(visit))
})

test('un visitante puede registrar visitas y compras sin convertirse en atleta', async () => {
  const db = env.authenticatedContext('authorized').database()
  const now = Date.now()
  const visit = { id: 'visit-visitor', visitorId: 'visitor-1', period: '2026-08', visitedAt: now, accessType: 'pay-per-visit', unitPrice: 100, note: null, createdAt: now, updatedAt: now }
  const sale = { id: 'sale-visitor', visitorId: 'visitor-1', customerName: visitor.name, items: { line1: { productId: 'product-1', name: 'Producto de prueba', quantity: 1, unitPrice: 20, unitCost: 10 } }, total: 20, status: 'credit', payments: {}, createdAt: now, updatedAt: now }
  await assertSucceeds(db.ref('v1/visits/visitor-1/2026-08/visit-visitor').set(visit))
  await assertSucceeds(db.ref('v1/sales/sale-visitor').set(sale))
  await assertFails(db.ref('v1/visits/another-visitor/2026-08/visit-visitor').set(visit))
})
