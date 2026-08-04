import type { ISOTimestamp } from '@/types/domain'

export type UserRole = 'admin' | 'reception'

export const accessModules = [
  { key: 'dashboard', label: 'Dashboard', description: 'Indicadores mensuales, reporte anual y alertas.', icon: 'ri-dashboard-3-line', route: '/dashboard', section: 'Operación' },
  { key: 'athletes', label: 'Atletas', description: 'Directorio, altas, edición y bajas de miembros.', icon: 'ri-team-line', route: '/atletas', section: 'Operación' },
  { key: 'payments', label: 'Mensualidades', description: 'Cobros, historial y avisos de pago.', icon: 'ri-wallet-3-line', route: '/pagos', section: 'Operación' },
  { key: 'visits', label: 'Visitas', description: 'Registro de accesos, cuponeras y visitantes.', icon: 'ri-footprint-line', route: '/visitas', section: 'Operación' },
  { key: 'performance', label: 'Rendimiento', description: 'Marcas, habilidades y comparativos.', icon: 'ri-line-chart-line', route: '/rendimiento', section: 'Operación' },
  { key: 'store', label: 'Tienda', description: 'Punto de venta, inventario, ventas y deudas.', icon: 'ri-shopping-bag-3-line', route: '/tienda', section: 'Administración' },
  { key: 'expenses', label: 'Egresos', description: 'Registro y seguimiento de gastos.', icon: 'ri-money-dollar-circle-line', route: '/egresos', section: 'Administración' },
  { key: 'plans', label: 'Planes', description: 'Catálogo de membresías y precios.', icon: 'ri-price-tag-3-line', route: '/planes', section: 'Administración' },
  { key: 'workouts', label: 'Programación', description: 'Planeación y edición de WODs.', icon: 'ri-calendar-schedule-line', route: '/programacion', section: 'Box' },
  { key: 'community', label: 'Comunidad', description: 'Cumpleaños y marcas recientes.', icon: 'ri-group-2-line', route: '/comunidad', section: 'Box' },
] as const

export type AccessModule = typeof accessModules[number]['key']
export type UserPermissions = Partial<Record<AccessModule, boolean>>

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

export const defaultReceptionPermissions = (): UserPermissions => ({
  dashboard: true,
  athletes: true,
  payments: true,
  visits: true,
  performance: true,
  store: true,
  workouts: true,
  community: true,
})

export const firstAllowedRoute = (user: AppUser | null) => {
  if (user?.role === 'admin')
    return '/dashboard'

  return accessModules.find(module => hasModuleAccess(user, module.key))?.route ?? '/sin-acceso'
}
