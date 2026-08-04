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

const saleFixture = (id, status = 'paid', payments = {}) => ({
  id,
  athleteId: null,
  customerName: 'Cliente de prueba',
  items: { 'product-1': { productId: 'product-1', name: 'Producto de prueba', quantity: 1, unitPrice: 20, unitCost: 10 } },
  total: 20,
  status,
  payments,
  createdAt: now(),
  updatedAt: now(),
})

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
    await db.ref('v1/users/reception').set(appUser('reception', 'reception', { store: true, storeSell: true }, true, true))
    await db.ref('v1/users/collector').set(appUser('collector', 'reception', { store: true, storeCollect: true }))
    await db.ref('v1/users/cashier').set(appUser('cashier', 'reception', { payments: true, paymentsManage: true, store: true, storeCollect: true }))
    await db.ref('v1/users/inventory').set(appUser('inventory', 'reception', { store: true, storeInventory: true }))
    await db.ref('v1/users/canceller').set(appUser('canceller', 'reception', { store: true, storeCancel: true }))
    await db.ref('v1/users/disabled').set(appUser('disabled', 'reception', { dashboard: true }, false))
    await db.ref('v1/products/product-1').set(product(2))
    await db.ref('v1/athletes/athlete-1').set(athlete)
    await db.ref('v1/sales/sale-credit').set(saleFixture('sale-credit', 'credit'))
    await db.ref('v1/sales/sale-cancel').set(saleFixture('sale-cancel'))
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

test('Admin puede aplicar un abono a una venta existente', async () => {
  const db = env.authenticatedContext('admin').database()
  const timestamp = now()
  const credit = (await db.ref('v1/sales/sale-credit').once('value')).val()

  credit.payments = {
    'admin-payment': {
      id: 'admin-payment',
      amountApplied: 20,
      method: 'cash',
      receivedAmount: 20,
      changeGiven: 0,
      appliedAt: timestamp,
    },
  }
  credit.status = 'paid'
  credit.updatedAt = timestamp

  await assertSucceeds(db.ref('v1/sales/sale-credit').set(credit))
})

test('las mensualidades permiten abonos acumulados sin alterar el historial', async () => {
  const db = env.authenticatedContext('admin').database()
  const timestamp = now()

  const first = {
    athleteId: 'athlete-1',
    period: '2026-08',
    status: 'pending',
    amount: 200,
    totalAmount: 500,
    balance: 300,
    method: 'cash',
    appliedAt: timestamp,
    installments: {
      first: { id: 'first', amountApplied: 200, method: 'cash', appliedAt: timestamp, balanceAfter: 300 },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await assertSucceeds(db.ref('v1/payments/athlete-1/2026-08').set(first))

  const settled = structuredClone(first)

  settled.status = 'paid'
  settled.amount = 500
  settled.balance = 0
  settled.method = 'transfer'
  settled.appliedAt = timestamp + 1
  settled.updatedAt = timestamp + 1
  settled.installments.second = { id: 'second', amountApplied: 300, method: 'transfer', appliedAt: timestamp + 1, balanceAfter: 0 }
  await assertSucceeds(db.ref('v1/payments/athlete-1/2026-08').set(settled))

  const tampered = structuredClone(settled)

  tampered.installments.first.amountApplied = 250
  await assertFails(db.ref('v1/payments/athlete-1/2026-08').set(tampered))

  const overpaid = structuredClone(settled)

  overpaid.amount = 550
  await assertFails(db.ref('v1/payments/athlete-1/2026-08').set(overpaid))
})

test('Tienda conserva saldo a favor y permite aplicarlo en una compra futura', async () => {
  const db = env.authenticatedContext('reception').database()
  const timestamp = now()
  const firstSale = saleFixture('sale-favor')

  firstSale.athleteId = 'athlete-1'
  firstSale.payments = {
    cash: { id: 'cash', amountApplied: 20, method: 'cash', receivedAmount: 40, changeGiven: 0, creditBalance: 20, appliedAt: timestamp },
  }

  await assertSucceeds(db.ref('v1').update({
    'sales/sale-favor': firstSale,
    'products/product-1/stock': 1,
    'products/product-1/updatedAt': timestamp,
    'storeCredits/athlete-1': {
      athleteId: 'athlete-1',
      balance: 20,
      entries: {
        'deposit-sale-favor': { id: 'deposit-sale-favor', type: 'deposit', amount: 20, saleId: 'sale-favor', description: 'Excedente dejado como saldo a favor', occurredAt: timestamp, balanceAfter: 20 },
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  }))

  const secondSale = saleFixture('sale-credit-use')

  secondSale.athleteId = 'athlete-1'
  secondSale.payments = {
    credit: { id: 'credit', amountApplied: 20, method: 'store-credit', receivedAmount: 20, changeGiven: 0, creditBalance: 0, appliedAt: timestamp + 1 },
  }
  await assertSucceeds(db.ref('v1').update({
    'sales/sale-credit-use': secondSale,
    'products/product-1/stock': 0,
    'products/product-1/updatedAt': timestamp + 1,
    'storeCredits/athlete-1/balance': 0,
    'storeCredits/athlete-1/entries/application-sale-credit-use': { id: 'application-sale-credit-use', type: 'application', amount: 20, saleId: 'sale-credit-use', description: 'Saldo aplicado a compra', occurredAt: timestamp + 1, balanceAfter: 0 },
    'storeCredits/athlete-1/updatedAt': timestamp + 1,
  }))

  await assertFails(db.ref('v1/storeCredits/athlete-1/entries/deposit-sale-favor/amount').set(25))
})

test('un cobro combinado liquida mensualidad y deudas de tienda en una escritura', async () => {
  const db = env.authenticatedContext('cashier').database()
  const timestamp = now()

  const monthlyPayment = {
    athleteId: 'athlete-1',
    period: '2026-09',
    status: 'paid',
    amount: 500,
    totalAmount: 500,
    balance: 0,
    method: 'cash',
    appliedAt: timestamp,
    installments: {
      combined: { id: 'combined', amountApplied: 500, method: 'cash', appliedAt: timestamp, balanceAfter: 0 },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await assertSucceeds(db.ref('v1').update({
    'payments/athlete-1/2026-09': monthlyPayment,
    'sales/sale-credit/payments/combined-store': { id: 'combined-store', amountApplied: 20, method: 'cash', receivedAmount: 20, changeGiven: 0, appliedAt: timestamp },
    'sales/sale-credit/status': 'paid',
    'sales/sale-credit/updatedAt': timestamp,
  }))
})

test('Recepción con permiso de venta vende pero no administra inventario, abonos ni cancelaciones', async () => {
  const db = env.authenticatedContext('reception').database()
  const timestamp = now()
  const newSale = saleFixture('sale-reception')

  await assertSucceeds(db.ref('v1/products').once('value'))
  await assertSucceeds(db.ref('v1/athletes').once('value'))
  await assertSucceeds(db.ref('v1').update({
    'sales/sale-reception': newSale,
    'products/product-1/stock': 1,
    'products/product-1/updatedAt': timestamp,
  }))
  await assertFails(db.ref('v1/products/product-1').update({ stock: 3, updatedAt: timestamp + 1 }))
  await assertFails(db.ref('v1/products/product-1').remove())
  await assertFails(db.ref('v1/sales/sale-credit').update({
    status: 'paid',
    'payments/payment-1': { id: 'payment-1', amountApplied: 20, method: 'cash', appliedAt: timestamp },
    updatedAt: timestamp,
  }))
  await assertFails(db.ref('v1/sales/sale-cancel').update({ status: 'cancelled', cancelledAt: timestamp, updatedAt: timestamp }))
  await assertFails(db.ref('v1/athletes/athlete-1').set(athlete))
  await assertFails(db.ref('v1/expenses').once('value'))
  await assertFails(db.ref('v1/users').once('value'))
  await assertSucceeds(db.ref('v1/users/reception').once('value'))
})

test('los permisos de Tienda para abonos, inventario y cancelación son independientes', async () => {
  const timestamp = now()
  const collectorDb = env.authenticatedContext('collector').database()
  const inventoryDb = env.authenticatedContext('inventory').database()
  const cancellerDb = env.authenticatedContext('canceller').database()

  const credit = (await collectorDb.ref('v1/sales/sale-credit').once('value')).val()

  credit.payments = { payment1: { id: 'payment1', amountApplied: 20, method: 'cash', appliedAt: timestamp } }
  credit.status = 'paid'
  credit.updatedAt = timestamp
  await assertSucceeds(collectorDb.ref('v1/sales/sale-credit').set(credit))
  await assertFails(collectorDb.ref('v1/products/product-1').update({ stock: 3, updatedAt: timestamp }))

  await assertSucceeds(inventoryDb.ref('v1/products/product-1').update({ stock: 5, updatedAt: timestamp }))
  await assertFails(inventoryDb.ref('v1/sales/inventory-sale').set(saleFixture('inventory-sale')))

  await assertSucceeds(cancellerDb.ref('v1/sales/sale-cancel').update({ status: 'cancelled', cancelledAt: timestamp, updatedAt: timestamp }))
  await assertSucceeds(cancellerDb.ref('v1/products/product-1').update({
    stock: 6,
    'inventoryAdjustments/sale-cancel': timestamp,
    updatedAt: timestamp,
  }))
  await assertSucceeds(cancellerDb.ref('v1/sales/sale-cancel').update({ inventoryRestoredAt: timestamp, updatedAt: timestamp + 1 }))
  await assertFails(cancellerDb.ref('v1/sales/canceller-sale').set(saleFixture('canceller-sale')))
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

  await assertSucceeds(db.ref('v1/users/reception/mustChangePassword').set(false))
  await assertFails(db.ref('v1/users/reception/mustChangePassword').set(true))
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
