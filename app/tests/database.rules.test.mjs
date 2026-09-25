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

const product = stock => ({ id: 'product-1', name: 'Producto de prueba', category: 'Prueba', barcode: '7501234567890', barcodes: { 'KR-00000001': true }, size: null, stock, alertLevel: 1, unitCost: 10, salePrice: 20, status: 'active', createdAt: now(), updatedAt: now() })
const athlete = { id: 'athlete-1', profile: { name: 'Atleta de prueba', phone: '0000000000', birthDate: '2000-01-01' }, membership: { schedule: 'Matutino', planId: 'plan-1', agreedAmount: 500, paymentDay: 5, registrationDate: '2026-01-01' }, kioskCode: '123456', status: 'active', createdAt: now(), updatedAt: now() }

const notificationConsent = (overrides = {}) => ({
  athleteId: 'athlete-1',
  receiptStatus: 'opted-in',
  reminderStatus: 'unknown',
  consentedPhoneE164: '520000000000',
  consentedAt: now(),
  consentSource: 'staff',
  recordedBy: 'athletes-only',
  optedOutAt: null,
  optOutSource: null,
  createdAt: now(),
  updatedAt: now(),
  updatedBy: 'athletes-only',
  ...overrides,
})

const athleteIntake = {
  athleteId: 'athlete-1',
  maritalStatus: 'single',
  emergencyContact: { name: 'Contacto de prueba', phone: '5512345678', relationship: 'Hermana' },
  healthHistory: {
    boneInjury: false,
    cardiovascularDisease: false,
    exerciseBreathingDifficulty: false,
    conditions: { asthma: false, epilepsy: false, diabetes: false, other: false, none: true, otherDescription: null },
    anemia: false,
    exerciseSymptoms: { dizziness: false, fainting: false, nausea: false, shortnessOfBreath: false, none: true },
    sportsActivity: { practiced: true, description: 'Natación' },
    sportsFacility: { attended: false, description: null },
  },
  createdAt: now(),
  updatedAt: now(),
}

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
    await db.ref('v1/users/admin-2').set(appUser('admin-2', 'admin'))
    await db.ref('v1/users/reception').set(appUser('reception', 'reception', { store: true, storeSell: true }, true, true))
    await db.ref('v1/users/coach').set(appUser('coach', 'coach'))
    await db.ref('v1/users/athletes-only').set(appUser('athletes-only', 'reception', { athletes: true, athletesManage: true }))
    await db.ref('v1/users/intake-reader').set(appUser('intake-reader', 'reception', { athletes: true, athletesIntake: true }))
    await db.ref('v1/users/intake-manager').set(appUser('intake-manager', 'reception', { athletes: true, athletesIntake: true, athletesIntakeManage: true }))
    await db.ref('v1/users/collector').set(appUser('collector', 'reception', { store: true, storeCollect: true }))
    await db.ref('v1/users/payment-corrector').set(appUser('payment-corrector', 'reception', { store: true, storeCorrectPayments: true }))
    await db.ref('v1/users/cashier').set(appUser('cashier', 'reception', { payments: true, paymentsManage: true, store: true, storeCollect: true }))
    await db.ref('v1/users/inventory').set(appUser('inventory', 'reception', { store: true, storeInventory: true }))
    await db.ref('v1/users/canceller').set(appUser('canceller', 'reception', { store: true, storeCancel: true }))
    await db.ref('v1/users/disabled').set(appUser('disabled', 'reception', { dashboard: true }, false))
    await db.ref('v1/products/product-1').set(product(2))
    await db.ref('v1/athletes/athlete-1').set(athlete)
    await db.ref('v1/athleteIntake/athlete-1').set(athleteIntake)
    await db.ref('v1/sales/sale-credit').set(saleFixture('sale-credit', 'credit'))
    await db.ref('v1/sales/sale-cancel').set(saleFixture('sale-cancel'))
    await db.ref('v1/visitors/visitor-1').set(visitor)
  })
})

after(async () => env?.cleanup())

test('notification status allows only the latest 20 for enabled admin or payments', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await context.database().ref('v1/users/payments-reader').set(appUser('payments-reader', 'coach', { payments: true }))
    await context.database().ref('v1/notificationStatus/athlete-1').set(Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`job-${String(i).padStart(32, '0')}`, { type: 'payment-receipt', status: 'accepted', updatedAt: i }]),
    ))
  })
  for (const uid of ['admin', 'cashier', 'payments-reader']) {
    const snapshot = await assertSucceeds(env.authenticatedContext(uid).database().ref('v1/notificationStatus/athlete-1').orderByChild('updatedAt').limitToLast(20).once('value'))

    assert.equal(snapshot.numChildren(), 20)
    assert.equal(snapshot.child(`job-${'0'.repeat(32)}`).exists(), false)
  }
})

test('notification status denies other modules, consent-only, disabled and anonymous', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await context.database().ref('v1/users/disabled-admin').set(appUser('disabled-admin', 'admin', { payments: true }, false))
  })
  for (const uid of ['coach', 'athletes-only', 'collector', 'disabled', 'disabled-admin'])
    await assertFails(env.authenticatedContext(uid).database().ref('v1/notificationStatus/athlete-1').orderByChild('updatedAt').limitToLast(20).once('value'))
  await assertFails(env.unauthenticatedContext().database().ref('v1/notificationStatus/athlete-1').orderByChild('updatedAt').limitToLast(20).once('value'))
  await assertFails(env.authenticatedContext('anonymous', { firebase: { sign_in_provider: 'anonymous' } }).database().ref('v1/notificationStatus/athlete-1').orderByChild('updatedAt').limitToLast(20).once('value'))
})

test('notification status denies wide, unordered, unbounded and direct child reads', async () => {
  const root = env.authenticatedContext('admin').database().ref('v1/notificationStatus')
  const athleteStatuses = root.child('athlete-1')

  await assertFails(root.orderByChild('updatedAt').limitToLast(20).once('value'))
  await assertFails(athleteStatuses.once('value'))
  await assertFails(athleteStatuses.limitToLast(20).once('value'))
  await assertFails(athleteStatuses.orderByChild('updatedAt').limitToLast(21).once('value'))
  await assertFails(athleteStatuses.orderByChild('updatedAt').limitToFirst(20).once('value'))
  await assertFails(athleteStatuses.orderByChild('updatedAt').endAt(10).limitToLast(20).once('value'))
  await assertFails(athleteStatuses.orderByChild('updatedAt').startAt(10).limitToLast(20).once('value'))
  await assertFails(athleteStatuses.orderByChild('updatedAt').equalTo(10).limitToLast(20).once('value'))
  await assertFails(athleteStatuses.child('job-one').once('value'))
})

test('notification status cannot be forged or deleted even by an admin client', async () => {
  for (const uid of ['admin', 'cashier']) {
    const target = env.authenticatedContext(uid).database().ref('v1/notificationStatus/athlete-1/job-one')

    await assertFails(target.set({ type: 'payment-receipt', status: 'read', updatedAt: now() }))
    await assertFails(target.update({ status: 'read' }))
    await assertFails(target.remove())
  }
})

test('notification status access ends when payments permission is revoked', async () => {
  const query = env.authenticatedContext('cashier').database().ref('v1/notificationStatus/athlete-1').orderByChild('updatedAt').limitToLast(20)

  await assertSucceeds(query.once('value'))
  await env.withSecurityRulesDisabled(context => context.database().ref('v1/users/cashier/permissions/payments').set(false))
  await assertFails(query.once('value'))
})

const cashClosure = {
  id: '2026-08-06',
  date: '2026-08-06',
  movementFrom: '2026-08-06',
  isBaseline: true,
  openingCash: 1000,
  openingBank: 5000,
  cashIncome: 500,
  bankIncome: 750,
  otherIncome: 0,
  cashExpenses: 100,
  bankExpenses: 250,
  otherExpenses: 0,
  expectedCash: 1400,
  expectedBank: 5500,
  countedCash: 1390,
  countedBank: 5500,
  cashVariance: -10,
  bankVariance: 0,
  closedBy: 'admin',
  closedByName: 'Admin de prueba',
  createdAt: now(),
  updatedAt: now(),
}

const inventoryClosure = {
  id: '2026-08-03',
  weekStart: '2026-08-03',
  weekEnd: '2026-08-09',
  items: {
    'product-1': {
      productId: 'product-1',
      name: 'Producto de prueba',
      category: 'Prueba',
      systemStock: 2,
      countedStock: 1,
      variance: -1,
      unitCost: 10,
      varianceValue: -10,
    },
  },
  totalSystemUnits: 2,
  totalCountedUnits: 1,
  varianceUnits: -1,
  lossValue: 10,
  gainValue: 0,
  closedBy: 'admin',
  closedByName: 'Admin de prueba',
  createdAt: now(),
  updatedAt: now(),
}

test('un usuario no autenticado no puede leer datos ni perfiles', async () => {
  const db = env.unauthenticatedContext().database()

  await assertFails(db.ref('v1/athletes').once('value'))
  await assertFails(db.ref('v1/athleteIntake/athlete-1').once('value'))
  await assertFails(db.ref('v1/users/admin').once('value'))
})

test('los datos de admisión tienen lectura y escritura separadas del registro operativo', async () => {
  const athletesOnlyDb = env.authenticatedContext('athletes-only').database()
  const readerDb = env.authenticatedContext('intake-reader').database()
  const managerDb = env.authenticatedContext('intake-manager').database()
  const adminDb = env.authenticatedContext('admin').database()

  await assertSucceeds(athletesOnlyDb.ref('v1/athletes/athlete-1').once('value'))
  await assertFails(athletesOnlyDb.ref('v1/athleteIntake/athlete-1').once('value'))
  await assertSucceeds(readerDb.ref('v1/athleteIntake/athlete-1').once('value'))
  await assertFails(readerDb.ref('v1/athleteIntake/athlete-1').set(athleteIntake))
  await assertSucceeds(managerDb.ref('v1/athleteIntake/athlete-1').set(athleteIntake))
  await assertSucceeds(adminDb.ref('v1/athleteIntake/athlete-1').once('value'))
})

test('el consentimiento de WhatsApp queda separado y sólo lo administra personal autorizado de Atletas', async () => {
  const unauthenticatedDb = env.unauthenticatedContext().database()
  const coachDb = env.authenticatedContext('coach').database()
  const disabledDb = env.authenticatedContext('disabled').database()
  const intakeManagerDb = env.authenticatedContext('intake-manager').database()
  const athletesManagerDb = env.authenticatedContext('athletes-only').database()
  const adminDb = env.authenticatedContext('admin').database()

  await assertFails(unauthenticatedDb.ref('v1/notificationPreferences/athlete-1').once('value'))
  await assertFails(unauthenticatedDb.ref('v1/notificationPreferences/athlete-1').set(notificationConsent()))
  await assertFails(coachDb.ref('v1/notificationPreferences/athlete-1').once('value'))
  await assertFails(disabledDb.ref('v1/notificationPreferences/athlete-1').once('value'))
  await assertFails(intakeManagerDb.ref('v1/notificationPreferences/athlete-1').once('value'))

  await assertSucceeds(athletesManagerDb.ref('v1/notificationPreferences/athlete-1').set(notificationConsent()))
  await assertSucceeds(athletesManagerDb.ref('v1/notificationPreferences/athlete-1').once('value'))
  await assertSucceeds(athletesManagerDb.ref('v1/notificationPreferences/athlete-1').set(notificationConsent({
    receiptStatus: 'opted-out',
    reminderStatus: 'opted-out',
    optedOutAt: now(),
    optOutSource: 'staff',
  })))
  await assertFails(athletesManagerDb.ref('v1/notificationPreferences/athlete-1').remove())
  await assertSucceeds(adminDb.ref('v1/notificationPreferences/athlete-1').set(notificationConsent({
    recordedBy: 'admin',
    updatedBy: 'admin',
  })))

  await assertFails(athletesManagerDb.ref('v1/notificationPreferences/athlete-1').set(notificationConsent({ receiptStatus: 'sent' })))
  await assertFails(athletesManagerDb.ref('v1/notificationPreferences/athlete-1').set(notificationConsent({ consentedPhoneE164: '5512345678' })))
  await assertFails(athletesManagerDb.ref('v1/notificationPreferences/athlete-1').set(notificationConsent({ athleteId: 'athlete-2' })))
  await assertFails(athletesManagerDb.ref('v1/notificationPreferences/athlete-1').set({ ...notificationConsent(), unexpected: true }))
  await assertFails(athletesManagerDb.ref('v1/notificationPreferences/athlete-1').set(notificationConsent({ updatedBy: 'admin' })))
})

test('los jobs de notificación sólo son accesibles desde Functions/Admin SDK', async () => {
  const unauthenticatedDb = env.unauthenticatedContext().database()
  const adminDb = env.authenticatedContext('admin').database()

  await assertFails(unauthenticatedDb.ref('v1/notificationJobs/job-test').once('value'))
  await assertFails(adminDb.ref('v1/notificationJobs/job-test').once('value'))
  await assertFails(adminDb.ref('v1/notificationJobs/job-test').set({ status: 'queued' }))
  await assertFails(adminDb.ref('v1/notificationJobs/job-test').remove())
})

test('los jobs conservan índices privados para correlación y recuperación', async () => {
  const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8'))

  assert.deepEqual(rules.rules.v1.notificationJobs['.indexOn'], [
    'providerMessageId',
    'recoveryAt',
  ])
  assert.equal(rules.rules.v1.notificationJobs['.read'], false)
  assert.equal(rules.rules.v1.notificationJobs['.write'], false)
})

test('los marcadores webhook conservan privacidad e índice de expiración', async () => {
  const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8'))
  const webhookEvents = rules.rules.v1.notificationWebhookEvents

  assert.deepEqual(webhookEvents['.indexOn'], ['expiresAt'])
  assert.equal(webhookEvents['.read'], false)
  assert.equal(webhookEvents['.write'], false)

  const client = env.authenticatedContext('admin').database().ref('v1/notificationWebhookEvents')

  await assertFails(client.orderByChild('expiresAt').endAt(now()).limitToFirst(50).once('value'))
  await assertFails(client.child('a'.repeat(64)).set({ receivedAt: now(), expiresAt: now() }))
})

test('las reglas rechazan respuestas de admisión inconsistentes', async () => {
  const managerDb = env.authenticatedContext('intake-manager').database()
  const invalidIntake = structuredClone(athleteIntake)

  invalidIntake.healthHistory.conditions.other = true
  invalidIntake.healthHistory.conditions.none = false
  invalidIntake.healthHistory.conditions.otherDescription = null

  await assertFails(managerDb.ref('v1/athleteIntake/athlete-1').set(invalidIntake))
})

test('sólo Admin puede guardar y consultar cierres de caja e inventario', async () => {
  const adminDb = env.authenticatedContext('admin').database()
  const receptionDb = env.authenticatedContext('reception').database()

  await assertSucceeds(adminDb.ref('v1/cashClosures/2026-08-06').set(cashClosure))
  await assertSucceeds(adminDb.ref('v1/inventoryClosures/2026-08-03').set(inventoryClosure))
  await assertFails(adminDb.ref('v1/cashClosures/2026-08-06/isBaseline').set('sí'))
  await assertSucceeds(adminDb.ref('v1/cashClosures').once('value'))
  await assertSucceeds(adminDb.ref('v1/inventoryClosures').once('value'))
  await assertFails(receptionDb.ref('v1/cashClosures').once('value'))
  await assertFails(receptionDb.ref('v1/inventoryClosures/2026-08-03').set(inventoryClosure))
})

test('el cierre finalizado y sus resoluciones conservan una bitácora inmutable', async () => {
  const adminDb = env.authenticatedContext('admin').database()
  const receptionDb = env.authenticatedContext('reception').database()
  const closureId = '2026-08-10'
  const draft = {
    ...structuredClone(inventoryClosure),
    id: closureId,
    weekStart: closureId,
    weekEnd: '2026-08-16',
    status: 'draft',
  }

  await assertSucceeds(adminDb.ref(`v1/inventoryClosures/${closureId}`).set(draft))

  const finalizedAt = now()
  const finalClosure = {
    ...draft,
    status: 'finalized',
    finalizedAt,
    adjustments: {
      'product-1': {
        id: `${closureId}-product-1`,
        productId: 'product-1',
        closureId,
        stockBefore: 2,
        countedStock: 1,
        varianceUnits: -1,
        unitCostSnapshot: 10,
        createdBy: 'admin',
        createdAt: finalizedAt,
      },
    },
    updatedAt: finalizedAt,
  }
  await assertSucceeds(adminDb.ref('v1').update({
    [`inventoryClosures/${closureId}`]: finalClosure,
    'products/product-1/stock': 1,
    [`products/product-1/inventoryReconciliations/${closureId}`]: finalizedAt,
    'products/product-1/updatedAt': finalizedAt,
  }))
  await assertFails(adminDb.ref(`v1/inventoryClosures/${closureId}/notes`).set('edición posterior'))
  await assertFails(adminDb.ref(`v1/inventoryClosures/${closureId}`).remove())

  const resolution = {
    id: 'resolution-1',
    adjustmentId: `${closureId}-product-1`,
    closureId,
    productId: 'product-1',
    kind: 'written-off',
    units: 1,
    amount: 10,
    reason: 'Fondo perdido',
    createdBy: 'admin',
    createdAt: now(),
  }
  await assertSucceeds(adminDb.ref(`v1/inventoryResolutions/${closureId}/${resolution.id}`).set(resolution))
  await assertFails(adminDb.ref(`v1/inventoryResolutions/${closureId}/${resolution.id}/reason`).set('Alterado'))
  await assertFails(adminDb.ref(`v1/inventoryResolutions/${closureId}/${resolution.id}`).remove())
  await assertFails(receptionDb.ref(`v1/inventoryResolutions/${closureId}/resolution-2`).set({ ...resolution, id: 'resolution-2' }))
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
  await assertSucceeds(db.ref('v1/users/new-coach').set(appUser('new-coach', 'coach')))
})

test('Coach inicia sin acceso y sólo obtiene módulos asignados explícitamente', async () => {
  const coachDb = env.authenticatedContext('coach').database()
  const adminDb = env.authenticatedContext('admin').database()

  await assertSucceeds(coachDb.ref('v1/users/coach').once('value'))
  await assertFails(coachDb.ref('v1/products').once('value'))
  await assertFails(coachDb.ref('v1/settings/kiosk').once('value'))
  await assertFails(coachDb.ref('v1/users').once('value'))

  await assertSucceeds(adminDb.ref('v1/users/coach').update({ permissions: { store: true }, updatedAt: now() }))
  await assertSucceeds(coachDb.ref('v1/products').once('value'))
  await assertFails(coachDb.ref('v1/sales/coach-sale').set(saleFixture('coach-sale')))
})

test('sólo Admin configura Pagar ahora con modos y perfiles válidos', async () => {
  const adminDb = env.authenticatedContext('admin').database()
  const receptionDb = env.authenticatedContext('reception').database()
  const coachDb = env.authenticatedContext('coach').database()
  const timestamp = now()
  const disabled = { paymentNowMode: 'disabled', updatedBy: 'admin', updatedAt: timestamp }

  await assertSucceeds(adminDb.ref('v1/settings/kiosk').set(disabled))
  await assertSucceeds(adminDb.ref('v1/settings/kiosk').once('value'))
  await assertFails(receptionDb.ref('v1/settings/kiosk').once('value'))
  await assertFails(coachDb.ref('v1/settings/kiosk').set(disabled))
  await assertFails(adminDb.ref('v1/settings/kiosk').set({ ...disabled, paymentNowMode: 'enabled' }))
  await assertFails(adminDb.ref('v1/settings/kiosk').set({ ...disabled, paymentNowMode: 'selected-admins', paymentNowUserIds: {} }))
  await assertFails(adminDb.ref('v1/settings/kiosk').set({ ...disabled, paymentNowMode: 'selected-admins', paymentNowUserIds: { reception: true } }))
  await assertSucceeds(adminDb.ref('v1/settings/kiosk').set({ ...disabled, paymentNowMode: 'selected-admins', paymentNowUserIds: { 'admin-2': true } }))
})

test('las reglas bloquean una venta pagada de Kiosco si la política no autoriza al aprobador', async () => {
  const db = env.authenticatedContext('admin').database()
  const timestamp = now()
  const paidSale = saleFixture('paid-kiosk')

  paidSale.athleteId = 'athlete-1'
  paidSale.source = 'kiosk'
  paidSale.approvedBy = 'admin-2'
  paidSale.payments = {
    paid: { id: 'paid', amountApplied: 20, method: 'cash', receivedAmount: 20, changeGiven: 0, appliedAt: timestamp },
  }

  await assertFails(db.ref('v1/sales/paid-kiosk').set(paidSale))
  await assertSucceeds(db.ref('v1/settings/kiosk').set({ paymentNowMode: 'all-admins', updatedBy: 'admin', updatedAt: timestamp }))
  await assertFails(db.ref('v1/sales/paid-kiosk').set(paidSale))
  paidSale.approvedBy = 'admin'
  await assertSucceeds(db.ref('v1/sales/paid-kiosk').set(paidSale))

  const deniedSale = structuredClone(paidSale)

  deniedSale.id = 'denied-kiosk'
  await assertSucceeds(db.ref('v1/settings/kiosk').set({ paymentNowMode: 'selected-admins', paymentNowUserIds: { 'admin-2': true }, updatedBy: 'admin', updatedAt: timestamp + 1 }))
  await assertFails(db.ref('v1/sales/denied-kiosk').set(deniedSale))

  const creditSale = saleFixture('credit-kiosk', 'credit')

  creditSale.athleteId = 'athlete-1'
  creditSale.source = 'kiosk'
  await assertSucceeds(db.ref('v1/settings/kiosk').set({ paymentNowMode: 'disabled', updatedBy: 'admin', updatedAt: timestamp + 2 }))
  await assertSucceeds(db.ref('v1/sales/credit-kiosk').set(creditSale))
})

test('los códigos personales y de barras deben tener un formato válido', async () => {
  const db = env.authenticatedContext('admin').database()
  const invalidAthlete = structuredClone(athlete)
  const invalidProduct = product(2)

  invalidAthlete.kioskCode = '1234'
  invalidProduct.barcode = 'código con espacios'

  await assertSucceeds(db.ref('v1/athletes/athlete-1/kioskCode').set('654321'))
  await assertFails(db.ref('v1/athletes/athlete-1').set(invalidAthlete))
  await assertSucceeds(db.ref('v1/products/product-1/barcode').set('012345678905'))
  await assertSucceeds(db.ref('v1/products/product-1/barcodes/7501234567891').set(true))
  await assertFails(db.ref('v1/products/product-1/barcodes/7501234567892').set(false))
  await assertFails(db.ref('v1/products/product-1/barcodes/codigo con espacios').set(true))
  await assertFails(db.ref('v1/products/product-1').set(invalidProduct))
})

test('Admin puede registrar desde kiosco una compra pendiente y descontar inventario', async () => {
  const db = env.authenticatedContext('admin').database()
  const timestamp = now()
  const kioskSale = saleFixture('sale-kiosk', 'credit')

  kioskSale.athleteId = 'athlete-1'
  kioskSale.source = 'kiosk'

  await assertSucceeds(db.ref('v1').update({
    'sales/sale-kiosk': kioskSale,
    'products/product-1/stock': 1,
    'products/product-1/updatedAt': timestamp,
  }))
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
    snapshot: { planId: 'plan-basic', agreedAmount: 500, paymentDay: 31, dueDate: '2026-08-31' },
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

  const changedSnapshot = structuredClone(settled)

  changedSnapshot.snapshot.agreedAmount = 450
  await assertFails(db.ref('v1/payments/athlete-1/2026-08').set(changedSnapshot))
})

test('las transiciones de atleta exigen evento atómico append-only', async () => {
  const timestamp = now()
  const admin = env.authenticatedContext('admin').database()
  const collector = env.authenticatedContext('collector').database()
  const event = {
    id: 'pause-1', athleteId: 'athlete-1', type: 'paused', fromStatus: 'active', toStatus: 'paused',
    effectiveDate: '2026-09-24', expectedReturnDate: '2026-10-08', reason: 'Pausa temporal solicitada', createdBy: 'admin', createdAt: timestamp,
  }

  await assertFails(admin.ref('v1/athletes/athlete-1/status').set('paused'))
  await assertFails(collector.ref('v1/athletes/athlete-1').update({
    status: 'paused', lastLifecycleEventId: event.id, [`lifecycleEvents/${event.id}`]: { ...event, createdBy: 'collector' }, updatedAt: timestamp,
  }))
  await assertSucceeds(admin.ref('v1/athletes/athlete-1').update({
    status: 'paused', pausedAt: '2026-09-24', expectedReturnDate: '2026-10-08', lastLifecycleEventId: event.id,
    [`lifecycleEvents/${event.id}`]: event, updatedAt: timestamp,
  }))
  await assertFails(admin.ref(`v1/athletes/athlete-1/lifecycleEvents/${event.id}/reason`).set('Alterado'))
  await assertFails(admin.ref(`v1/athletes/athlete-1/lifecycleEvents/${event.id}`).remove())
})

test('nómina es Admin-only y liquida trabajo con un único egreso inmutable', async () => {
  const admin = env.authenticatedContext('admin').database()
  const reception = env.authenticatedContext('reception').database()
  const timestamp = now()
  const employee = {
    id: 'employee-1', name: 'Coach de prueba', phone: null, kind: 'coach', startDate: '2026-09-01', status: 'active', notes: null,
    linkedUserId: null, compensationUnit: 'class', currentRate: 150,
    rateHistory: { [`rate-${timestamp}`]: { id: `rate-${timestamp}`, unit: 'class', amount: 150, effectiveFrom: '2026-09-01', createdBy: 'admin', createdAt: timestamp } },
    createdAt: timestamp, updatedAt: timestamp,
  }
  const entry = {
    id: 'entry-1', employeeId: employee.id, employeeName: employee.name, date: '2026-09-24', unit: 'class', quantity: 2,
    rateSnapshot: 150, amount: 300, status: 'approved', createdBy: 'admin', createdAt: timestamp, updatedAt: timestamp,
  }

  await assertFails(reception.ref(`v1/employees/${employee.id}`).set(employee))
  await assertSucceeds(admin.ref(`v1/employees/${employee.id}`).set(employee))
  await assertSucceeds(admin.ref(`v1/workEntries/${entry.id}`).set(entry))

  const settlementId = 'settlement-1'
  const expenseId = `payroll-${settlementId}`
  const settlement = {
    id: settlementId, employeeId: employee.id, employeeName: employee.name, entryIds: { [entry.id]: true },
    periodFrom: entry.date, periodThrough: entry.date, amount: 300, method: 'transfer', paidAt: entry.date,
    expenseId, createdBy: 'admin', createdAt: timestamp, updatedAt: timestamp,
  }
  const operation = {
    id: settlementId, status: 'pending', employeeId: employee.id, employeeName: employee.name, entryIds: { [entry.id]: true },
    periodFrom: entry.date, periodThrough: entry.date, amount: 300, method: 'transfer', paidAt: entry.date,
    createdBy: 'admin', createdAt: timestamp, updatedAt: timestamp,
  }
  await assertSucceeds(admin.ref(`v1/payrollOperations/${settlementId}`).set(operation))
  const paidEntry = { ...entry, status: 'paid', payrollSettlementId: settlementId, updatedAt: timestamp + 1 }
  const expense = {
    id: expenseId, date: entry.date, category: 'Nómina', subcategory: 'Liquidación de trabajo',
    description: 'Liquidación Coach de prueba', amount: 300, method: 'transfer', status: 'paid', registeredBy: 'admin',
    payrollSettlementId: settlementId, employeeId: employee.id, employeeName: employee.name, periodFrom: entry.date, periodThrough: entry.date,
    createdAt: timestamp, updatedAt: timestamp,
  }
  await assertSucceeds(admin.ref('v1').update({
    [`payrollSettlements/${settlementId}`]: settlement,
    [`workEntries/${entry.id}`]: paidEntry,
    [`expenses/${expenseId}`]: expense,
    [`payrollOperationCompletions/${settlementId}`]: { operationId: settlementId, completedBy: 'admin', completedAt: timestamp + 1 },
  }))
  await assertFails(admin.ref(`v1/workEntries/${entry.id}`).remove())
  await assertFails(admin.ref(`v1/expenses/${expenseId}`).remove())
  await assertFails(admin.ref(`v1/payrollSettlements/${settlementId}`).remove())
  await assertFails(reception.ref('v1/employees').once('value'))
})

test('cumpleaños permite lectura de Comunidad y sólo Admin registra eventos anuales', async () => {
  const admin = env.authenticatedContext('admin').database()
  const community = env.authenticatedContext('coach').database()
  const reception = env.authenticatedContext('reception').database()
  await env.withSecurityRulesDisabled(context => context.database().ref('v1/users/coach/permissions/community').set(true))
  const timestamp = now()
  const greetingId = 'athlete-1_2026'
  const event = { id: 'greet-1', greetingId, athleteId: 'athlete-1', year: 2026, toStatus: 'greeted', createdBy: 'admin', createdAt: timestamp }
  const greeting = { id: greetingId, athleteId: 'athlete-1', year: 2026, status: 'greeted', greetedAt: timestamp, greetedBy: 'admin', lastEventId: event.id, createdAt: timestamp, updatedAt: timestamp }

  await assertSucceeds(admin.ref('v1').update({ [`birthdayGreetings/${greetingId}`]: greeting, [`birthdayGreetingEvents/${greetingId}/${event.id}`]: event }))
  await assertSucceeds(community.ref('v1/birthdayGreetings').once('value'))
  await assertFails(community.ref(`v1/birthdayGreetings/${greetingId}/status`).set('pending'))
  await assertFails(reception.ref('v1/birthdayGreetings').once('value'))
  await assertFails(admin.ref(`v1/birthdayGreetingEvents/${greetingId}/${event.id}`).remove())
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
    'sales/sale-credit/payments/combined-store': { id: 'combined-store', amountApplied: 20, method: 'cash', receivedAmount: 20, changeGiven: 0, appliedAt: timestamp, membershipPeriod: '2026-09', membershipInstallmentId: 'combined' },
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

test('los ajustes de cobro son append-only y requieren permiso, actor y forma válidos', async () => {
  const timestamp = now()

  await env.withSecurityRulesDisabled(async context => {
    await context.database().ref('v1/sales/sale-correction').set(saleFixture('sale-correction', 'paid', {
      payment1: { id: 'payment1', amountApplied: 20, method: 'cash', appliedAt: timestamp },
    }))
  })

  const corrector = env.authenticatedContext('payment-corrector').database()
  const collector = env.authenticatedContext('collector').database()
  const admin = env.authenticatedContext('admin').database()
  const valid = {
    id: 'reversal-payment1',
    saleId: 'sale-correction',
    paymentId: 'payment1',
    kind: 'reversal',
    amount: 20,
    reason: 'Cobro aplicado por error',
    createdBy: 'payment-corrector',
    createdAt: timestamp + 1,
  }

  await assertSucceeds(corrector.ref('v1/sales/sale-correction/paymentAdjustments/reversal-payment1').set(valid))
  await assertFails(collector.ref('v1/sales/sale-correction/paymentAdjustments/collector-adjustment').set({ ...valid, id: 'collector-adjustment', createdBy: 'collector' }))
  await assertFails(corrector.ref('v1/sales/sale-correction/paymentAdjustments/reversal-payment1/reason').set('Alterado'))
  await assertFails(corrector.ref('v1/sales/sale-correction/paymentAdjustments/reversal-payment1').remove())
  await assertFails(admin.ref('v1/sales/sale-correction/paymentAdjustments/forged-actor').set({ ...valid, id: 'forged-actor', createdBy: 'payment-corrector' }))
  await assertFails(admin.ref('v1/sales/sale-correction/paymentAdjustments/wrong-amount').set({ ...valid, id: 'wrong-amount', amount: 10, createdBy: 'admin' }))
  await assertFails(admin.ref('v1/sales/sale-correction/paymentAdjustments/store-credit-method').set({
    id: 'store-credit-method',
    saleId: 'sale-correction',
    paymentId: 'payment1',
    kind: 'method-change',
    fromMethod: 'cash',
    toMethod: 'store-credit',
    reason: 'Método inválido',
    createdBy: 'admin',
    createdAt: timestamp + 2,
  }))
})

test('la conciliación de saldo por reverso es atómica y no permite alterar el saldo libremente', async () => {
  const timestamp = now()
  const corrector = env.authenticatedContext('payment-corrector').database()

  await env.withSecurityRulesDisabled(async context => {
    await context.database().ref('v1').update({
      'sales/sale-credit-correction': saleFixture('sale-credit-correction', 'paid', {
        payment2: { id: 'payment2', amountApplied: 20, method: 'cash', creditBalance: 50, appliedAt: timestamp },
      }),
      'storeCredits/athlete-1': {
        athleteId: 'athlete-1', balance: 70,
        entries: {
          'deposit-payment2': { id: 'deposit-payment2', type: 'deposit', amount: 50, saleId: 'sale-credit-correction', description: 'Excedente', occurredAt: timestamp, balanceAfter: 50 },
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    })
  })

  await assertFails(corrector.ref('v1/storeCredits/athlete-1/balance').set(0))
  await assertFails(corrector.ref('v1/storeCredits/athlete-1').update({
    balance: 19,
    updatedAt: timestamp + 1,
    lastAdjustmentId: 'payment-adjustment-operation-1',
    'entries/payment-adjustment-operation-1': {
      id: 'payment-adjustment-operation-1', type: 'reversal', amount: 50, saleId: 'sale-credit-correction', description: 'Retiro por reverso', occurredAt: timestamp + 1, balanceAfter: 20, createdBy: 'payment-corrector',
    },
  }))

  await assertSucceeds(corrector.ref('v1').update({
    'sales/sale-credit-correction/paymentAdjustments/reversal-payment2': {
      id: 'reversal-payment2', saleId: 'sale-credit-correction', paymentId: 'payment2', kind: 'reversal', amount: 20, reason: 'Cobro aplicado por error', createdBy: 'payment-corrector', createdAt: timestamp + 1,
    },
    'storeCredits/athlete-1/balance': 20,
    'storeCredits/athlete-1/updatedAt': timestamp + 1,
    'storeCredits/athlete-1/lastAdjustmentId': 'payment-adjustment-operation-1',
    'storeCredits/athlete-1/entries/payment-adjustment-operation-1': {
      id: 'payment-adjustment-operation-1', type: 'reversal', amount: 50, saleId: 'sale-credit-correction', description: 'Retiro por reverso', occurredAt: timestamp + 1, balanceAfter: 20, createdBy: 'payment-corrector',
    },
  }))
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
