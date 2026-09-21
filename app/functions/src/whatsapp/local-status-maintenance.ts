import { getLocalStatusInboxConfig } from './local-status-inbox-config.js'
import { runLocalStatusInboxBatch } from './local-status-inbox.js'
import { RealtimeStatusInbox } from './realtime-status-inbox.js'

export interface MaintenanceCycle {
  status: 'completed'
  visited: number
  pending: number
  deleted: number
  durationMs: number
  hasMorePages: boolean
}

interface MaintenanceDependencies {
  environment?: () => NodeJS.ProcessEnv
  now?: () => number
  runPage?: typeof runLocalStatusInboxBatch
  cleanup?: (now: number) => Promise<number>
}

// One in-memory cursor per invocation. No scheduler, provider or new DB schema.
export function createStatusMaintenance(dependencies: MaintenanceDependencies = {}): () => Promise<MaintenanceCycle> {
  const environment = dependencies.environment ?? (() => process.env)
  const identity = maintenanceIdentity(environment())
  const now = dependencies.now ?? Date.now
  const runPage = dependencies.runPage ?? runLocalStatusInboxBatch
  const cleanup = dependencies.cleanup ?? (at => new RealtimeStatusInbox().cleanup(at))
  let afterKey: string | undefined
  let running = false

  function assertIdentity() {
    if (maintenanceIdentity(environment()) !== identity)
      throw new Error('Maintenance identity changed')
  }

  return async () => {
    assertIdentity()
    if (running)
      throw new Error('Maintenance already running')
    running = true
    try {
      const startedAt = now()
      const page = await runPage({ afterKey, now: () => startedAt })
      if (page.status !== 'processed')
        throw new Error('Maintenance disabled')
      afterKey = page.nextCursor ?? undefined

      // Recheck before deletion as well: never carry a cursor to a new scope.
      assertIdentity()

      const deleted = await cleanup(startedAt)

      return { status: 'completed', visited: page.processed, pending: page.pending,
        deleted, durationMs: Math.max(0, now() - startedAt), hasMorePages: page.nextCursor !== null }
    } finally {
      running = false
    }
  }
}

function maintenanceIdentity(environment: NodeJS.ProcessEnv): string {
  const config = getLocalStatusInboxConfig(environment)
  const endpoint = environment.FIREBASE_DATABASE_EMULATOR_HOST
  if (!config || environment.KRONOS_WHATSAPP_STATUS_MAINTENANCE_MODE !== 'local'
    || !/^(?:127\.0\.0\.1|localhost):(?:9000|9010)$/.test(endpoint ?? ''))
    throw new Error('Maintenance disabled')

  return JSON.stringify([config.accountId, config.phoneNumberId, endpoint])
}
