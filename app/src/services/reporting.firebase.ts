import { athletesService } from './athletes.service'
import { visitsService } from './visits.service'
import { salesService } from './sales.service'
import { paymentsService } from './payments.service'
import { closuresService } from './closures.service'
import { workforceService } from './workforce.service'
import { expensesService } from './expenses.service'
import { visitPaymentsService } from './visit-payments.service'
import { subscribeValue } from './realtime.service'
import { subscribeReportingData, type ReportingErrorListener, type ReportingListener } from './reporting.service'
import type { AppUser } from '@/types/access'
import type { InventoryResolution } from '@/types/domain'

const subscribeInventoryResolutions = (onChange: (items: InventoryResolution[]) => void, onError: (error: Error) => void) => subscribeValue<Record<string, Record<string, InventoryResolution>>>('inventoryResolutions', value => {
  onChange(Object.values(value ?? {}).flatMap(group => Object.values(group ?? {})))
}, onError)

export const reportingFirebaseService = {
  subscribe: (user: AppUser | null, onChange: ReportingListener, onError: ReportingErrorListener) => subscribeReportingData(
    user,
    {
      athletes: athletesService.subscribe,
      visits: visitsService.subscribe,
      sales: salesService.subscribe,
      payments: paymentsService.subscribe,
      inventoryClosures: closuresService.subscribeInventory,
      inventoryResolutions: subscribeInventoryResolutions,
      workEntries: workforceService.subscribeEntries,
      payrollSettlements: workforceService.subscribeSettlements,
      visitPayments: visitPaymentsService.subscribe,
      expenses: expensesService.subscribe,
      cashClosures: closuresService.subscribeCash,
    },
    onChange,
    onError,
  ),
}
