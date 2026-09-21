import { info } from 'firebase-functions/logger'

type MaintenanceStage =
  | 'initialization'
  | 'status-page'
  | 'status-reconcile'
  | 'status-cleanup'
  | 'opt-out-cleanup'
  | 'webhook-cleanup'

export type OperationalEvent =
  | { code: 'whatsapp_maintenance_disabled'; reason: 'MODE_DISABLED' | 'INVALID_RUNTIME' }
  | {
    code: 'whatsapp_maintenance_completed'
    visited: number
    pending: number
    completed: number
    expired: number
    missing: number
    deletedStatus: number
    deletedOptOut: number
    deletedWebhook: number
    durationMs: number
    hasMorePages: boolean
  }
  | { code: 'whatsapp_maintenance_failed'; stage: MaintenanceStage }
  | {
    code: 'whatsapp_recovery_completed'
    selected: number
    finished: number
    deferred: number
    busy: number
    skipped: number
    failed: number
  }
  | { code: 'whatsapp_recovery_disabled'; reason: 'MODE_DISABLED' | 'INVALID_RUNTIME' | 'INVALID_SECRET' }
  | { code: 'whatsapp_recovery_failed'; stage: 'selection' }
  | {
    code: 'whatsapp_webhook_result'
    method: 'GET' | 'POST' | 'OTHER'
    httpClass: '2xx' | '4xx' | '5xx'
    durationMs: number
  }

export type OperationalTelemetry = (event: OperationalEvent) => void

export function emitOperationalEvent(
  event: OperationalEvent,
  write: OperationalTelemetry = writeFirebaseLog,
): void {
  if (!isOperationalEvent(event))
    throw new Error('Invalid operational event')

  write(event)
}

export function webhookTelemetryEvent(method: string, statusCode: number, durationMs: number): OperationalEvent {
  const httpClass = statusCode >= 200 && statusCode < 300
    ? '2xx' as const
    : statusCode >= 400 && statusCode < 500
      ? '4xx' as const
      : '5xx' as const

  return {
    code: 'whatsapp_webhook_result',
    method: method === 'GET' || method === 'POST' ? method : 'OTHER',
    httpClass,
    durationMs,
  }
}

function writeFirebaseLog(event: OperationalEvent): void {
  info(event.code, event)
}

function isOperationalEvent(value: unknown): value is OperationalEvent {
  if (!isRecord(value) || typeof value.code !== 'string')
    return false

  switch (value.code) {
  case 'whatsapp_maintenance_disabled':
    return exactKeys(value, ['code', 'reason'])
        && (value.reason === 'MODE_DISABLED' || value.reason === 'INVALID_RUNTIME')
  case 'whatsapp_maintenance_completed':
    return exactKeys(value, [
      'code',
      'visited',
      'pending',
      'completed',
      'expired',
      'missing',
      'deletedStatus',
      'deletedOptOut',
      'deletedWebhook',
      'durationMs',
      'hasMorePages',
    ])
        && counts(value, [
          'visited',
          'pending',
          'completed',
          'expired',
          'missing',
          'deletedStatus',
          'deletedOptOut',
          'deletedWebhook',
          'durationMs',
        ])
        && typeof value.hasMorePages === 'boolean'
  case 'whatsapp_maintenance_failed':
    return exactKeys(value, ['code', 'stage'])
        && ['initialization',
          'status-page',
          'status-reconcile',
          'status-cleanup',
          'opt-out-cleanup',
          'webhook-cleanup'].includes(String(value.stage))
  case 'whatsapp_recovery_completed':
    return exactKeys(value, ['code', 'selected', 'finished', 'deferred', 'busy', 'skipped', 'failed'])
        && counts(value, ['selected', 'finished', 'deferred', 'busy', 'skipped', 'failed'])
  case 'whatsapp_recovery_disabled':
    return exactKeys(value, ['code', 'reason'])
        && ['MODE_DISABLED', 'INVALID_RUNTIME', 'INVALID_SECRET'].includes(String(value.reason))
  case 'whatsapp_recovery_failed':
    return exactKeys(value, ['code', 'stage']) && value.stage === 'selection'
  case 'whatsapp_webhook_result':
    return exactKeys(value, ['code', 'method', 'httpClass', 'durationMs'])
        && ['GET', 'POST', 'OTHER'].includes(String(value.method))
        && ['2xx', '4xx', '5xx'].includes(String(value.httpClass))
        && isCount(value.durationMs)
  default:
    return false
  }
}

function counts(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => isCount(value[key]))
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
