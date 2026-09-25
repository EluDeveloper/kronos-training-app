import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportingSourcesFor } from '../src/services/reporting-access'
import { subscribeReportingData } from '../src/services/reporting.service'
import { hasModuleAccess, normalizePermissions, type AppUser } from '../src/types/access'

const user = (role: AppUser['role'], permissions: AppUser['permissions'] = {}): AppUser => ({
  uid: 'u1',
  displayName: 'Persona de prueba',
  email: 'test@example.test',
  role,
  enabled: true,
  permissions,
  mustChangePassword: false,
  createdBy: 'admin',
  createdAt: 1,
  updatedAt: 1,
})

test('reports por sí solo no habilita lecturas de ninguna fuente', () => {
  assert.deepEqual(reportingSourcesFor(user('reception', { reports: true })), [])
  assert.equal(hasModuleAccess(user('reception', { reports: true }), 'reports'), true)
  assert.equal(hasModuleAccess(user('reception'), 'reports'), false)
  assert.deepEqual(normalizePermissions({ reports: true, payments: false }), { reports: true })
})

test('no Admin sólo usa fuentes operativas con permiso de módulo vigente', () => {
  assert.deepEqual(reportingSourcesFor(user('reception', { reports: true, athletes: true, visits: true, payments: true, store: true })), [
    'athletes',
    'visits',
  ])
})

test('Admin usa fuentes canónicas y conserva las fuentes financieras restringidas', () => {
  assert.deepEqual(reportingSourcesFor(user('admin')), [
    'athletes',
    'visits',
    'memberships',
    'store',
    'visit-payments',
    'expenses',
    'cash-closures',
    'inventory',
    'workforce',
  ])
})

test('perfil deshabilitado no inicia suscripciones aunque tenga permisos', () => {
  assert.deepEqual(reportingSourcesFor({ ...user('admin'), enabled: false }), [])
})

test('el adaptador no consulta fuentes sin permiso y proyecta atletas sin datos personales', () => {
  let subscriptions = 0
  let received: unknown

  const stop = subscribeReportingData(user('reception', { reports: true, athletes: true }), {
    athletes: onChange => {
      subscriptions += 1
      onChange([{
        id: 'a1',
        status: 'active',
        createdAt: 1,
        updatedAt: 2,
        profile: { name: 'Atleta confidencial', phone: '5551234567', birthDate: '2000-01-01' },
        membership: { planId: 'p1', agreedAmount: 500, paymentDay: 1, registrationDate: '2020-01-01', schedule: 'x' },
        lifecycleEvents: { e1: { id: 'e1', athleteId: 'a1', type: 'paused', fromStatus: 'active', toStatus: 'paused', effectiveDate: '2026-01-01', reason: 'texto privado', notes: 'nota privada', createdBy: 'staff', createdAt: 3 } },
      } as never])

      return () => undefined
    },
    visits: () => {
      subscriptions += 1

      return () => undefined
    },
  }, dataset => { received = dataset }, () => undefined)

  assert.equal(subscriptions, 1)

  const dataset = received as { athletes: Array<Record<string, unknown>>; visits: unknown[]; sources: string[] }

  assert.deepEqual(Object.keys(dataset.athletes[0]!).sort(), ['createdAt', 'id', 'lifecycleEvents', 'status'])
  assert.deepEqual(Object.keys((dataset.athletes[0]!.lifecycleEvents as Record<string, object>).e1!).sort(), ['athleteId', 'createdAt', 'effectiveDate', 'fromStatus', 'id', 'toStatus', 'type'])
  assert.deepEqual(dataset.visits, [])
  assert.deepEqual(dataset.sources, ['athletes'])
  stop()
})

test('Admin suscribe ventas de tienda y la proyección elimina datos personales y campos no necesarios', () => {
  let subscriptions = 0
  let received: unknown

  const sale = {
    id: 's1',
    athleteId: 'athlete-1',
    visitorId: 'visitor-secret',
    customerName: 'Cliente confidencial',
    source: 'kiosk',
    approvedBy: 'staff-secret',
    createdAt: 1,
    updatedAt: 2,
    cancelledAt: null,
    total: 50,
    status: 'credit',
    items: { p1: { productId: 'p1', name: 'Producto', quantity: 1, unitPrice: 50, unitCost: 20 } },
    payments: { pay1: { id: 'pay1', amountApplied: 10, method: 'cash', appliedAt: 3, receivedAmount: 20, changeGiven: 10 } },
    paymentAdjustments: { adj1: { id: 'adj1', saleId: 's1', paymentId: 'pay1', kind: 'method-change', fromMethod: 'cash', toMethod: 'transfer', reason: 'motivo privado', createdBy: 'staff-secret', createdAt: 4 } },
  }

  const stop = subscribeReportingData(user('admin'), {
    sales: onChange => {
      subscriptions += 1
      onChange([sale] as never)

      return () => undefined
    },
  }, dataset => { received = dataset }, () => undefined)

  assert.equal(subscriptions, 1)

  const dataset = received as { sales: Array<Record<string, unknown>>; sources: string[] }
  const projected = dataset.sales[0]!

  assert.deepEqual(dataset.sources, ['store'])
  assert.deepEqual(Object.keys(projected).sort(), ['athleteId', 'createdAt', 'id', 'items', 'paymentAdjustments', 'payments', 'status', 'total', 'updatedAt'])
  assert.deepEqual(Object.keys((projected.payments as Record<string, Record<string, unknown>>).pay1!).sort(), ['amountApplied', 'appliedAt', 'changeGiven', 'id', 'method', 'receivedAmount'])
  assert.deepEqual(Object.keys((projected.paymentAdjustments as Record<string, Record<string, unknown>>).adj1!).sort(), ['createdAt', 'fromMethod', 'id', 'kind', 'paymentId', 'saleId', 'toMethod'])
  assert.equal('customerName' in projected, false)
  assert.equal('visitorId' in projected, false)
  stop()
})

test('usuarios no Admin no reciben suscripción de ventas aunque tengan permiso store', () => {
  let subscriptions = 0
  subscribeReportingData(user('reception', { reports: true, store: true }), {
    sales: () => {
      subscriptions += 1

      return () => undefined
    },
  }, () => undefined, () => undefined)()

  assert.equal(subscriptions, 0)
})

test('Admin recibe pagos con una proyección allowlisted y no Admin nunca los suscribe', () => {
  let adminSubscriptions = 0
  let nonAdminSubscriptions = 0
  let received: unknown

  const payment = {
    athleteId: 'a1', period: '2026-10', status: 'pending', amount: 200, totalAmount: 500, balance: 300,
    method: 'cash', appliedAt: 2, concept: 'texto libre privado', visitCount: 3, visitorId: 'visitante-privado',
    snapshot: { planId: 'plan-1', agreedAmount: 500, paymentDay: 5, dueDate: '2026-10-05' },
    installments: { i1: { id: 'i1', amountApplied: 200, method: 'cash', appliedAt: 2, balanceAfter: 300 } },
    createdAt: 1, updatedAt: 2,
  }

  subscribeReportingData(user('admin'), {
    payments: onChange => {
      adminSubscriptions += 1
      onChange([payment] as never)

      return () => undefined
    },
  }, dataset => { received = dataset }, () => undefined)()

  subscribeReportingData(user('reception', { reports: true, payments: true }), {
    payments: () => {
      nonAdminSubscriptions += 1

      return () => undefined
    },
  }, () => undefined, () => undefined)()

  const projected = (received as { payments: Array<Record<string, unknown>> }).payments[0]!

  assert.equal(adminSubscriptions, 1)
  assert.equal(nonAdminSubscriptions, 0)
  assert.deepEqual(Object.keys(projected).sort(), ['athleteId', 'createdAt', 'installments', 'period', 'snapshot', 'status', 'totalAmount', 'updatedAt'])
  assert.deepEqual(Object.keys((projected.installments as Record<string, object>).i1!).sort(), ['amountApplied', 'appliedAt', 'id', 'method'])
  assert.equal('concept' in projected, false)
  assert.equal('visitorId' in projected, false)
})

test('Admin recibe Inventario y Personal con proyecciones allowlisted y carga cada dominio completo', () => {
  let received: unknown

  const listeners = {
    inventoryClosures: (onChange: (items: never[]) => void) => {
      onChange([{
        id: '2026-10-01', weekStart: '2026-10-01', weekEnd: '2026-10-07', status: 'finalized', finalizedAt: 10,
        items: { p1: { productId: 'p1', name: 'Producto', category: 'Bebidas', systemStock: 5, countedStock: 3, variance: -2, unitCost: 10, varianceValue: -20 } },
        totalSystemUnits: 5, totalCountedUnits: 3, varianceUnits: -2, lossValue: 20, gainValue: 0,
        notes: 'nota privada', closedBy: 'admin-secret', closedByName: 'Admin', createdAt: 1, updatedAt: 2,
      }] as never)

      return () => undefined
    },
    inventoryResolutions: (onChange: (items: never[]) => void) => {
      onChange([{ id: 'r1', adjustmentId: 'a1', closureId: '2026-10-01', productId: 'p1', kind: 'covered', units: 1, amount: 10, method: 'cash', reference: 'privada', reason: 'motivo privado', createdBy: 'admin-secret', createdAt: 11 }] as never)

      return () => undefined
    },
    workEntries: (onChange: (items: never[]) => void) => {
      onChange([{ id: 'w1', employeeId: 'e1', employeeName: 'Entrenadora QA', date: '2026-10-02', unit: 'class', quantity: 1, rateSnapshot: 200, amount: 200, status: 'paid', note: 'nota privada', correctionReason: 'motivo privado', createdBy: 'admin-secret', approvedBy: 'admin-secret', payrollSettlementId: 's1', createdAt: 1, updatedAt: 2 }] as never)

      return () => undefined
    },
    payrollSettlements: (onChange: (items: never[]) => void) => {
      onChange([{ id: 's1', employeeId: 'e1', employeeName: 'Entrenadora QA', entryIds: { w1: true }, periodFrom: '2026-10-02', periodThrough: '2026-10-02', amount: 200, method: 'cash', reference: 'privada', paidAt: '2026-10-03', expenseId: 'payroll-s1', createdBy: 'admin-secret', createdAt: 1, updatedAt: 2 }] as never)

      return () => undefined
    },
  }

  subscribeReportingData(user('admin'), listeners, dataset => { received = dataset }, () => undefined)()

  const dataset = received as Record<string, Array<Record<string, unknown>> | string[]>

  assert.deepEqual(dataset.loadedSources, ['inventory', 'workforce'])
  assert.deepEqual(Object.keys(dataset.inventoryClosures![0]!).sort(), ['finalizedAt', 'id', 'items', 'status', 'weekEnd', 'weekStart'])
  assert.deepEqual(Object.keys(dataset.inventoryResolutions![0]!).sort(), ['adjustmentId', 'amount', 'closureId', 'createdAt', 'id', 'kind', 'method', 'productId', 'units'])
  assert.deepEqual(Object.keys(dataset.workEntries![0]!).sort(), ['amount', 'date', 'employeeId', 'employeeName', 'id', 'payrollSettlementId', 'quantity', 'rateSnapshot', 'status', 'unit'])
  assert.deepEqual(Object.keys(dataset.payrollSettlements![0]!).sort(), ['amount', 'employeeId', 'employeeName', 'entryIds', 'id', 'method', 'paidAt', 'periodFrom', 'periodThrough'])
  assert.equal(JSON.stringify(dataset).includes('privada'), false)
  assert.equal(JSON.stringify(dataset).includes('admin-secret'), false)
})

test('no Admin nunca suscribe Inventario ni Personal aunque tenga permiso reports', () => {
  let subscriptions = 0

  const listener = () => {
    subscriptions += 1
    throw new Error('Una fuente restringida intentó suscribirse para un usuario no Admin.')
  }

  subscribeReportingData(user('reception', { reports: true, store: true }), {
    inventoryClosures: listener,
    inventoryResolutions: listener,
    workEntries: listener,
    payrollSettlements: listener,
  }, () => undefined, () => undefined)()

  assert.equal(subscriptions, 0)
})

test('Admin recibe visitas pagadas, egresos y cierres con proyecciones financieras allowlisted', () => {
  let received: unknown

  subscribeReportingData(user('admin'), {
    visitPayments: onChange => {
      onChange([{
        id: 'vp1', visitorId: 'visitor-1', customerName: 'Nombre privado', phone: '555-0000', throughPeriod: '2026-10', amount: 150, method: 'cash', appliedAt: 10,
        visitRefs: { v1: { id: 'v1', period: '2026-10', visitedAt: 9, unitPrice: 150 } }, createdAt: 10, updatedAt: 10,
      }] as never)

      return () => undefined
    },
    expenses: onChange => {
      onChange([{
        id: 'e1', date: '2026-10-02', category: 'Operación', subcategory: 'Renta', description: 'texto privado', amount: 500, method: 'transfer', status: 'paid', registeredBy: 'admin-secret', receiptUrl: 'https://private.test', payrollSettlementId: 's1', employeeId: 'employee-1', employeeName: 'Nombre privado', periodFrom: '2026-10-01', periodThrough: '2026-10-15', createdAt: 1, updatedAt: 2,
      }] as never)

      return () => undefined
    },
    cashClosures: onChange => {
      onChange([{
        id: '2026-10-02', date: '2026-10-02', movementFrom: '2026-10-01', isBaseline: false, openingCash: 100, openingBank: 200,
        cashIncome: 150, bankIncome: 0, otherIncome: 0, cashExpenses: 0, bankExpenses: 500, otherExpenses: 0,
        expectedCash: 250, expectedBank: -300, countedCash: 245, countedBank: -300, cashVariance: -5, bankVariance: 0,
        notes: 'nota privada', closedBy: 'admin-secret', closedByName: 'Nombre privado', createdAt: 1, updatedAt: 2,
      }] as never)

      return () => undefined
    },
  }, dataset => { received = dataset }, () => undefined)()

  const dataset = received as Record<string, Array<Record<string, unknown>> | string[]>

  assert.deepEqual(dataset.loadedSources, ['visit-payments', 'expenses', 'cash-closures'])
  assert.deepEqual(Object.keys(dataset.visitPayments![0]!).sort(), ['amount', 'appliedAt', 'id', 'method', 'throughPeriod', 'visitorId'])
  assert.deepEqual(Object.keys(dataset.expenses![0]!).sort(), ['amount', 'category', 'date', 'employeeId', 'id', 'method', 'payrollSettlementId', 'periodFrom', 'periodThrough', 'status', 'subcategory'])
  assert.deepEqual(Object.keys(dataset.cashClosures![0]!).sort(), ['bankExpenses', 'bankIncome', 'bankVariance', 'cashExpenses', 'cashIncome', 'cashVariance', 'countedBank', 'countedCash', 'date', 'expectedBank', 'expectedCash', 'id', 'isBaseline', 'movementFrom', 'openingBank', 'openingCash', 'otherExpenses', 'otherIncome'])
  assert.equal(JSON.stringify(dataset).includes('privada'), false)
  assert.equal(JSON.stringify(dataset).includes('admin-secret'), false)
})

test('no Admin nunca suscribe visitas pagadas, egresos ni cierres aunque tenga reports', () => {
  let subscriptions = 0

  const listener = () => {
    subscriptions += 1

    return () => undefined
  }

  subscribeReportingData(user('reception', { reports: true, visits: true }), {
    visitPayments: listener,
    expenses: listener,
    cashClosures: listener,
  }, () => undefined, () => undefined)()

  assert.equal(subscriptions, 0)
})

test('las fuentes operativas reportan fallos por separado y se pueden cancelar', () => {
  const failures: string[] = []
  let stopped = 0
  subscribeReportingData(user('reception', { reports: true, athletes: true, visits: true }), {
    athletes: (_onChange, onError) => {
      onError(new Error('falló'))

      return () => { stopped += 1 }
    },
    visits: (_onChange, onError) => {
      onError(new Error('falló'))

      return () => { stopped += 1 }
    },
  }, () => undefined, source => failures.push(source))()

  assert.deepEqual(failures.sort(), ['athletes', 'visits'])
  assert.equal(stopped, 2)
})
