import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'

let env
const projectId = 'demo-kronos-training'
const now = () => Date.now()
const device = enabled => ({ enabled, label: 'Prueba', createdAt: now() })
const appUser = (uid, role = 'reception', permissions = {}, enabled = true, mustChangePassword = false) => ({
  uid,
  displayName: role === 'admin' ? 'Admin de prueba' : 'Recepción de prueba',
  email: `${uid}@example.test`,
  role,
  enabled,
  permissions,
  mustChangePassword,
  createdBy: 'seed',
  createdAt: now(),
  updatedAt: now(),
})
const product = stock => ({ id: 'product-1', name: 'Producto de prueba', category: 'Prueba', size: null, stock, alertLevel: 1, unitCost: 10, salePrice: 20, status: 'active', createdAt: now(), updatedAt: now() })
const athlete = { id: 'athlete-1', profile: { name: 'Atleta de prueba', phone: '0000000000', birthDate: '2000-01-01' }, membership: { schedule: 'Matutino', planId: 'plan-1', agreedAmount: 500, paymentDay: 5, registrationDate: '2026-01-01' }, status: 'active', createdAt: now(), updatedAt: now() }
const visitor = { id: 'visitor-1', name: 'Visitante de prueba', phone: '5512345678', pricePerVisit: 100, createdAt: now(), updatedAt: now() }

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
    await db.ref('v1/authorizedDevices/bootstrap').set(device(true))
    await db.ref('v1/authorizedDevices/waiting').set(device(false))
    await db.ref('v1/authConfig').set({ initialized: true, initializedAt: now() })
    await db.ref('v1/users/admin').set(appUser('admin', 'admin'))
    await db.ref('v1/users/reception').set(appUser('reception', 'reception', { store: true }, true, true))
    await db.ref('v1/users/disabled').set(appUser('disabled', 'reception', { dashboard: true }, false))
    await db.ref('v1/products/product-1').set(product(2))
    await db.ref('v1/visitors/visitor-1').set(visitor)
  })
})

after(async () => env?.cleanup())

test('un usuario no autenticado no puede leer datos ni perfiles', async () => {
  const db = env.unauthenticatedContext().database()
  await assertFails(db.ref('v1/athletes').once('value'))
  await assertFails(db.ref('v1/users/admin').once('value'))
})

test('un dispositivo pendiente sólo puede leer su autorización y el estado inicial', async () => {
  const db = env.authenticatedContext('waiting').database()
  const snapshot = await assertSucceeds(db.ref('v1/authorizedDevices/waiting').once('value'))
  assert.equal(snapshot.val().enabled, false)
  await assertSucceeds(db.ref('v1/authConfig').once('value'))
  await assertFails(db.ref('v1/products').once('value'))
  await assertFails(db.ref('v1/authorizedDevices/bootstrap').once('value'))
})

test('el cliente no puede autorizarse a sí mismo', async () => {
  const db = env.authenticatedContext('waiting').database()
  await assertFails(db.ref('v1/authorizedDevices/waiting/enabled').set(true))
})

test('un dispositivo autorizado sólo puede crear el primer Admin cuando no existen usuarios', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await context.database().ref('v1/users').remove()
    await context.database().ref('v1/authConfig').remove()
  })

  const db = env.authenticatedContext('bootstrap').database()
  const firstAdmin = appUser('first-admin', 'admin')
  firstAdmin.createdBy = 'bootstrap'
  await assertSucceeds(db.ref('v1').update({
    'users/first-admin': firstAdmin,
    'authConfig/initialized': true,
    'authConfig/initializedAt': now(),
  }))
  await assertFails(db.ref('v1/users/second-admin').set(appUser('second-admin', 'admin')))
})

test('Admin puede leer el negocio y administrar perfiles válidos', async () => {
  const db = env.authenticatedContext('admin').database()
  await assertSucceeds(db.ref('v1/products').once('value'))
  await assertSucceeds(db.ref('v1/users').once('value'))
  await assertSucceeds(db.ref('v1/athletes/athlete-1').set(athlete))
  await assertSucceeds(db.ref('v1/users/new-reception').set(appUser('new-reception', 'reception', { visits: true })))
})

test('Recepción sólo accede a los módulos asignados y no administra usuarios', async () => {
  const db = env.authenticatedContext('reception').database()
  await assertSucceeds(db.ref('v1/products').once('value'))
  await assertSucceeds(db.ref('v1/athletes').once('value'))
  await assertSucceeds(db.ref('v1/products/product-1').update({ stock: 1, updatedAt: now() }))
  await assertFails(db.ref('v1/athletes/athlete-1').set(athlete))
  await assertFails(db.ref('v1/expenses').once('value'))
  await assertFails(db.ref('v1/users').once('value'))
  await assertSucceeds(db.ref('v1/users/reception').once('value'))
})

test('una cuenta deshabilitada no puede leer módulos asignados', async () => {
  const db = env.authenticatedContext('disabled').database()
  await assertFails(db.ref('v1/products').once('value'))
  await assertSucceeds(db.ref('v1/users/disabled').once('value'))
})

test('Recepción no puede elevar su perfil ni permisos', async () => {
  const db = env.authenticatedContext('reception').database()
  await assertFails(db.ref('v1/users/reception').update({ role: 'admin', updatedAt: now() }))
  await assertFails(db.ref('v1/users/reception/permissions/expenses').set(true))
})

test('el usuario puede confirmar una sola vez el cambio de contraseña temporal', async () => {
  const db = env.authenticatedContext('reception').database()
  await assertSucceeds(db.ref('v1/users/reception').update({ mustChangePassword: false, updatedAt: now() }))
  await assertFails(db.ref('v1/users/reception').update({ displayName: 'Nombre alterado', updatedAt: now() + 1 }))
})

test('Admin no puede quitarse a sí mismo el último acceso', async () => {
  const db = env.authenticatedContext('admin').database()
  await assertFails(db.ref('v1/users/admin').update({ enabled: false, updatedAt: now() }))
  await assertFails(db.ref('v1/users/admin').update({ role: 'reception', updatedAt: now() }))
})

test('las reglas impiden inventario negativo', async () => {
  const db = env.authenticatedContext('admin').database()
  await assertFails(db.ref('v1/products/product-1').update({ stock: -1, updatedAt: now() }))
})

test('una venta y su decremento de inventario se escriben de forma atómica', async () => {
  const db = env.authenticatedContext('admin').database()
  const timestamp = now()
  const sale = { id: 'sale-1', athleteId: null, customerName: 'Cliente de prueba', items: { line1: { productId: 'product-1', name: 'Producto de prueba', quantity: 1, unitPrice: 20, unitCost: 10 } }, total: 20, status: 'paid', payments: { initial: { id: 'initial', amountApplied: 20, method: 'cash', appliedAt: timestamp } }, createdAt: timestamp, updatedAt: timestamp }
  await assertSucceeds(db.ref('v1').update({ 'sales/sale-1': sale, 'products/product-1/stock': 1, 'products/product-1/updatedAt': timestamp }))
})

test('meta y lista de dispositivos no se pueden modificar desde el cliente', async () => {
  const db = env.authenticatedContext('admin').database()
  await assertFails(db.ref('v1/meta/schemaVersion').set(2))
  await assertFails(db.ref('v1/authorizedDevices/another').set(device(true)))
})

test('las visitas válidas respetan atleta y periodo de la ruta', async () => {
  const db = env.authenticatedContext('admin').database()
  const timestamp = now()
  const visit = { id: 'visit-1', athleteId: 'athlete-1', period: '2026-08', visitedAt: timestamp, planId: 'plan-1', accessType: 'visit-pack', unitPrice: 0, note: null, createdAt: timestamp, updatedAt: timestamp }
  await assertSucceeds(db.ref('v1/visits/athlete-1/2026-08/visit-1').set(visit))
  await assertFails(db.ref('v1/visits/another-athlete/2026-08/visit-1').set(visit))
})

test('un visitante puede registrar visitas y compras sin convertirse en atleta', async () => {
  const db = env.authenticatedContext('admin').database()
  const timestamp = now()
  const visit = { id: 'visit-visitor', visitorId: 'visitor-1', period: '2026-08', visitedAt: timestamp, accessType: 'pay-per-visit', unitPrice: 100, note: null, createdAt: timestamp, updatedAt: timestamp }
  const sale = { id: 'sale-visitor', visitorId: 'visitor-1', customerName: visitor.name, items: { line1: { productId: 'product-1', name: 'Producto de prueba', quantity: 1, unitPrice: 20, unitCost: 10 } }, total: 20, status: 'credit', payments: {}, createdAt: timestamp, updatedAt: timestamp }
  await assertSucceeds(db.ref('v1/visits/visitor-1/2026-08/visit-visitor').set(visit))
  await assertSucceeds(db.ref('v1/sales/sale-visitor').set(sale))
  await assertFails(db.ref('v1/visits/another-visitor/2026-08/visit-visitor').set(visit))
})

test('un pago acumulado liquida visitas de meses distintos en una sola escritura', async () => {
  const db = env.authenticatedContext('admin').database()
  const timestamp = now()
  const juneVisit = { id: 'visit-june', visitorId: 'visitor-1', period: '2026-06', visitedAt: timestamp - 2_000, accessType: 'pay-per-visit', unitPrice: 100, note: null, createdAt: timestamp, updatedAt: timestamp }
  const julyVisit = { id: 'visit-july', visitorId: 'visitor-1', period: '2026-07', visitedAt: timestamp - 1_000, accessType: 'pay-per-visit', unitPrice: 100, note: null, createdAt: timestamp, updatedAt: timestamp }

  await assertSucceeds(db.ref('v1/visits/visitor-1').update({ '2026-06/visit-june': juneVisit, '2026-07/visit-july': julyVisit }))

  const payment = {
    id: 'visit-payment-1',
    visitorId: 'visitor-1',
    customerName: visitor.name,
    phone: visitor.phone,
    throughPeriod: '2026-07',
    amount: 200,
    method: 'cash',
    appliedAt: timestamp,
    visitRefs: {
      'visit-june': { id: 'visit-june', period: '2026-06', visitedAt: juneVisit.visitedAt, unitPrice: 100 },
      'visit-july': { id: 'visit-july', period: '2026-07', visitedAt: julyVisit.visitedAt, unitPrice: 100 },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await assertSucceeds(db.ref('v1').update({
    'visitPayments/visitor-1/visit-payment-1': payment,
    'visits/visitor-1/2026-06/visit-june/paidAt': timestamp,
    'visits/visitor-1/2026-06/visit-june/visitPaymentId': payment.id,
    'visits/visitor-1/2026-06/visit-june/paymentPeriod': payment.throughPeriod,
    'visits/visitor-1/2026-06/visit-june/updatedAt': timestamp,
    'visits/visitor-1/2026-07/visit-july/paidAt': timestamp,
    'visits/visitor-1/2026-07/visit-july/visitPaymentId': payment.id,
    'visits/visitor-1/2026-07/visit-july/paymentPeriod': payment.throughPeriod,
    'visits/visitor-1/2026-07/visit-july/updatedAt': timestamp,
  }))

  const saved = await db.ref('v1/visits/visitor-1').once('value')
  assert.equal(saved.child('2026-06/visit-june/visitPaymentId').val(), payment.id)
  assert.equal(saved.child('2026-07/visit-july/visitPaymentId').val(), payment.id)
  await assertFails(db.ref('v1/visits/visitor-1/2026-06/visit-june').update({ visitPaymentId: 'another-payment', updatedAt: timestamp + 1 }))
})
