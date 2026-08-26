import type { ISOTimestamp } from '@/types/domain'

export type UserRole = 'admin' | 'reception'

export const accessModules = [
  {
    key: 'dashboard', label: 'Dashboard', description: 'Indicadores mensuales, reporte anual y alertas.', icon: 'ri-dashboard-3-line', route: '/dashboard', section: 'Operación', actions: [],
  },
  {
    key: 'athletes', label: 'Atletas', description: 'Directorio y estado de los miembros.', icon: 'ri-team-line', route: '/atletas', section: 'Operación',
    actions: [
      { key: 'athletesManage', label: 'Administrar atletas', description: 'Dar de alta, editar y cambiar el estado de los miembros.' },
      { key: 'athletesIntake', label: 'Consultar datos de admisión', description: 'Consultar contacto de emergencia y antecedentes de salud.' },
      { key: 'athletesIntakeManage', label: 'Administrar datos de admisión', description: 'Capturar y actualizar contacto de emergencia y antecedentes de salud.' },
    ],
  },
  {
    key: 'payments', label: 'Mensualidades', description: 'Consulta de cobros, historial y avisos.', icon: 'ri-wallet-3-line', route: '/pagos', section: 'Operación',
    actions: [{ key: 'paymentsManage', label: 'Registrar mensualidades', description: 'Crear y actualizar cobros de membresía.' }],
  },
  {
    key: 'visits', label: 'Visitas', description: 'Consulta de accesos, cuponeras y visitantes.', icon: 'ri-footprint-line', route: '/visitas', section: 'Operación',
    actions: [
      { key: 'visitsRegister', label: 'Registrar visitas', description: 'Registrar accesos y dar de alta visitantes.' },
      { key: 'visitsCollect', label: 'Cobrar visitas', description: 'Aplicar pagos a visitas pendientes.' },
      { key: 'visitsDelete', label: 'Eliminar visitas', description: 'Eliminar registros que todavía no estén liquidados.' },
    ],
  },
  {
    key: 'performance', label: 'Rendimiento', description: 'Consulta de marcas, habilidades y comparativos.', icon: 'ri-line-chart-line', route: '/rendimiento', section: 'Operación',
    actions: [{ key: 'performanceManage', label: 'Administrar rendimiento', description: 'Crear, editar o eliminar marcas y habilidades.' }],
  },
  {
    key: 'store', label: 'Tienda', description: 'Consulta del punto de venta, inventario y deudas.', icon: 'ri-shopping-bag-3-line', route: '/tienda', section: 'Administración',
    actions: [
      { key: 'storeSell', label: 'Realizar ventas', description: 'Cobrar productos y descontar existencias.' },
      { key: 'storeCollect', label: 'Aplicar abonos', description: 'Registrar pagos de ventas a crédito.' },
      { key: 'storeInventory', label: 'Administrar inventario', description: 'Crear, editar, ingresar existencias o dar de baja productos.' },
      { key: 'storeCancel', label: 'Cancelar ventas', description: 'Cancelar ventas y devolver sus productos al inventario.' },
    ],
  },
  {
    key: 'expenses', label: 'Egresos', description: 'Consulta y seguimiento de gastos.', icon: 'ri-money-dollar-circle-line', route: '/egresos', section: 'Administración',
    actions: [{ key: 'expensesManage', label: 'Administrar egresos', description: 'Crear, editar o eliminar gastos.' }],
  },
  {
    key: 'plans', label: 'Planes', description: 'Consulta del catálogo de membresías y precios.', icon: 'ri-price-tag-3-line', route: '/planes', section: 'Administración',
    actions: [{ key: 'plansManage', label: 'Administrar planes', description: 'Crear y editar membresías, precios y vigencia.' }],
  },
  {
    key: 'workouts', label: 'Programación', description: 'Consulta de la programación de WODs.', icon: 'ri-calendar-schedule-line', route: '/programacion', section: 'Box',
    actions: [{ key: 'workoutsManage', label: 'Administrar programación', description: 'Crear, editar o eliminar WODs.' }],
  },
  {
    key: 'community', label: 'Comunidad', description: 'Cumpleaños y marcas recientes.', icon: 'ri-group-2-line', route: '/comunidad', section: 'Box', actions: [],
  },
] as const

export type AccessModule = typeof accessModules[number]['key']
export type AccessAction = typeof accessModules[number]['actions'][number]['key']
export type PermissionKey = AccessModule | AccessAction
export type UserPermissions = Partial<Record<PermissionKey, boolean>>

const actionModules = Object.fromEntries(
  accessModules.flatMap(module => module.actions.map(action => [action.key, module.key])),
) as Record<AccessAction, AccessModule>

export interface AppUser {
  uid: string
  displayName: string
  email: string
  role: UserRole
  enabled: boolean
  permissions?: UserPermissions
  mustChangePassword: boolean
  createdBy: string
  createdAt: ISOTimestamp
  updatedAt: ISOTimestamp
}

export interface AuthConfiguration {
  initialized: boolean
  initializedAt?: ISOTimestamp
}

export const roleLabel = (role: UserRole) => role === 'admin' ? 'Admin' : 'Recepción'

export const hasModuleAccess = (user: AppUser | null, module: AccessModule) => Boolean(
  user?.enabled && (user.role === 'admin' || user.permissions?.[module] === true),
)

export const hasActionAccess = (user: AppUser | null, action: AccessAction) => {
  if (!user?.enabled)
    return false
  if (user.role === 'admin')
    return true

  const module = actionModules[action]

  return user.permissions?.[module] === true && user.permissions?.[action] === true
}

export const normalizePermissions = (permissions: UserPermissions = {}): UserPermissions => {
  const normalized: UserPermissions = {}

  for (const module of accessModules) {
    if (permissions[module.key] !== true)
      continue

    normalized[module.key] = true
    for (const action of module.actions) {
      if (permissions[action.key] === true)
        normalized[action.key] = true
    }
  }

  return normalized
}

export const defaultReceptionPermissions = (): UserPermissions => ({
  dashboard: true,
  athletes: true,
  payments: true,
  paymentsManage: true,
  visits: true,
  visitsRegister: true,
  visitsCollect: true,
  store: true,
  storeSell: true,
  storeCollect: true,
  community: true,
})

export const firstAllowedRoute = (user: AppUser | null) => {
  if (user?.role === 'admin')
    return '/dashboard'

  return accessModules.find(module => hasModuleAccess(user, module.key))?.route ?? '/sin-acceso'
}
