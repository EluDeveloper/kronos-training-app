import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultCoachPermissions,
  hasActionAccess,
  hasModuleAccess,
  roleLabel,
  type AppUser,
} from '../src/types/access'
import type { KioskSettings, Product, Sale } from '../src/types/domain'
import {
  availableStoreProducts,
  calculateGrossProfit,
  isKioskPaymentNowAllowed,
  KIOSK_SUCCESS_RESET_MS,
  normalizeCustomerKey,
  parseKioskSettings,
  removeCartItem,
} from '../src/utils/store-kiosk'

const timestamp = 1_700_000_000_000

function appUser(role: AppUser['role'], overrides: Partial<AppUser> = {}): AppUser {
  return {
    uid: `${role}-1`,
    displayName: `Usuario ${role}`,
    email: `${role}@example.test`,
    role,
    enabled: true,
    permissions: {},
    mustChangePassword: false,
    createdBy: 'admin-1',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function product(id: string, stock: number, status: Product['status'] = 'active'): Product {
  return {
    id,
    name: `Producto ${id}`,
    category: 'Prueba',
    stock,
    alertLevel: 1,
    unitCost: 40,
    salePrice: 100,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function sale(id: string, status: Sale['status'], source: Sale['source'], unitPrice: number, unitCost: number, quantity: number): Sale {
  return {
    id,
    customerName: 'Cliente de prueba',
    items: {
      line: { productId: 'product-1', name: 'Producto', quantity, unitPrice, unitCost },
    },
    total: unitPrice * quantity,
    status,
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

test('Coach inicia sin permisos y nunca obtiene privilegios de Admin por sus permisos', () => {
  const coach = appUser('coach', { permissions: defaultCoachPermissions() })
  const coachWithWorkouts = appUser('coach', { permissions: { workouts: true, workoutsManage: true } })

  assert.deepEqual(defaultCoachPermissions(), {})
  assert.equal(roleLabel('coach'), 'Coach')
  assert.equal(hasModuleAccess(coach, 'workouts'), false)
  assert.equal(hasModuleAccess(coachWithWorkouts, 'workouts'), true)
  assert.equal(hasActionAccess(coachWithWorkouts, 'workoutsManage'), true)
  assert.equal(hasActionAccess(coachWithWorkouts, 'storeSell'), false)
})

test('el selector de Punto de Venta ofrece sólo productos activos con stock positivo', () => {
  const result = availableStoreProducts([
    product('available', 2),
    product('empty', 0),
    product('invalid', -1),
    product('inactive', 4, 'inactive'),
  ])

  assert.deepEqual(result.map(item => item.id), ['available'])
})

test('la ganancia usa snapshots de todas las ventas no canceladas y redondea a centavos', () => {
  const result = calculateGrossProfit([
    sale('pos-paid', 'paid', 'pos', 100, 60, 2),
    sale('kiosk-credit', 'credit', 'kiosk', 30.10, 20, 1),
    sale('cancelled', 'cancelled', 'pos', 1_000, 0, 1),
    sale('negative-margin', 'paid', 'kiosk', 10, 15, 1),
  ])

  assert.equal(result, 85.10)
})

test('borrar repetidamente un producto es idempotente y normaliza claves nulas del cliente', () => {
  const cart = { product: { productId: 'product', name: 'Producto', quantity: 1, unitPrice: 20, unitCost: 10 } }
  const empty = removeCartItem(removeCartItem(cart, 'product'), 'product')

  assert.deepEqual(empty, {})
  assert.equal(normalizeCustomerKey(null), '')
  assert.equal(normalizeCustomerKey(undefined), '')
  assert.equal(normalizeCustomerKey('athlete:123'), 'athlete:123')
})

test('la política de Pagar ahora falla cerrada y sólo autoriza Admin habilitado', () => {
  const admin = appUser('admin', { uid: 'admin-1' })
  const anotherAdmin = appUser('admin', { uid: 'admin-2' })
  const disabledAdmin = appUser('admin', { uid: 'admin-1', enabled: false })
  const coach = appUser('coach', { uid: 'admin-1' })

  const selected: KioskSettings = {
    paymentNowMode: 'selected-admins',
    paymentNowUserIds: { 'admin-1': true },
    updatedBy: 'admin-1',
    updatedAt: timestamp,
  }

  assert.equal(isKioskPaymentNowAllowed(null, admin), false)
  assert.equal(isKioskPaymentNowAllowed({ ...selected, paymentNowMode: 'disabled', paymentNowUserIds: null }, admin), false)
  assert.equal(isKioskPaymentNowAllowed({ ...selected, paymentNowMode: 'all-admins', paymentNowUserIds: null }, admin), true)
  assert.equal(isKioskPaymentNowAllowed(selected, admin), true)
  assert.equal(isKioskPaymentNowAllowed(selected, anotherAdmin), false)
  assert.equal(isKioskPaymentNowAllowed(selected, disabledAdmin), false)
  assert.equal(isKioskPaymentNowAllowed(selected, coach), false)
})

test('la confirmación del Kiosco se reinicia exactamente a los cinco segundos', () => {
  assert.equal(KIOSK_SUCCESS_RESET_MS, 5_000)
})

test('la configuración persistida rechaza formas desconocidas o allowlists vacíos', () => {
  assert.equal(parseKioskSettings(null), null)
  assert.equal(parseKioskSettings({ paymentNowMode: 'enabled' }), null)
  assert.equal(parseKioskSettings({ paymentNowMode: 'selected-admins', paymentNowUserIds: {}, updatedBy: 'admin-1', updatedAt: timestamp }), null)
  assert.deepEqual(parseKioskSettings({ paymentNowMode: 'disabled', updatedBy: 'admin-1', updatedAt: timestamp }), {
    paymentNowMode: 'disabled',
    paymentNowUserIds: null,
    updatedBy: 'admin-1',
    updatedAt: timestamp,
  })
  assert.deepEqual(parseKioskSettings({
    paymentNowMode: 'selected-admins',
    paymentNowUserIds: { 'admin-1': true },
    updatedBy: 'admin-1',
    updatedAt: timestamp,
  }), {
    paymentNowMode: 'selected-admins',
    paymentNowUserIds: { 'admin-1': true },
    updatedBy: 'admin-1',
    updatedAt: timestamp,
  })
})
