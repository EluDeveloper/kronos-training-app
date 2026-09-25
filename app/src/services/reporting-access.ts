import type { AppUser } from '@/types/access'

export type ReportingSource = 'athletes' | 'visits' | 'memberships' | 'store' | 'visit-payments' | 'expenses' | 'cash-closures' | 'inventory' | 'workforce'

const adminOnlySources: ReportingSource[] = ['memberships', 'store', 'visit-payments', 'expenses', 'cash-closures', 'inventory', 'workforce']

export function reportingSourcesFor(user: AppUser | null): ReportingSource[] {
  if (!user?.enabled || (user.role !== 'admin' && user.permissions?.reports !== true))
    return []

  if (user.role === 'admin')
    return ['athletes', 'visits', ...adminOnlySources]

  return (['athletes', 'visits'] as const).filter(source => user.permissions?.[source] === true)
}
