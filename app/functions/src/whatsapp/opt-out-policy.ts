import type { LocalOptOutEvent } from './inbound-opt-out.js'
import { buildOptOutPatch } from './opt-out.js'

type OptOutDecision = { status: 'ignored' | 'retry-required' } | { status: 'update'; value: Record<string, unknown> }

// Pure transaction policy: re-evaluated against the current server value on every retry.
export function decideOptOut(current: unknown, athleteId: string, event: LocalOptOutEvent): OptOutDecision {
  if (current === null)
    return { status: 'ignored' }
  if (typeof current !== 'object' || Array.isArray(current))
    return { status: 'retry-required' }
  const value = current as Record<string, unknown>
  if (value.athleteId !== athleteId || !validStatus(value.receiptStatus) || !validStatus(value.reminderStatus))
    return { status: 'retry-required' }
  if (value.consentedPhoneE164 !== event.senderPhone
    || (value.receiptStatus === 'opted-out' && value.reminderStatus === 'opted-out'))
    return { status: 'ignored' }
  const consentedAt = timestamp(value.consentedAt)
  if (consentedAt === null && (value.consentedAt != null || value.receiptStatus === 'opted-in' || value.reminderStatus === 'opted-in'))
    return { status: 'retry-required' }
  if (consentedAt !== null && Math.floor(consentedAt / 1000) > event.eventAt / 1000)
    return { status: 'ignored' }
  const patch = buildOptOutPatch(event.keyword, event.receivedAt)
  if (!patch)
    return { status: 'retry-required' }

  return { status: 'update', value: { ...value, ...patch, updatedAt: event.receivedAt, updatedBy: 'whatsapp-webhook' } }
}

function validStatus(value: unknown): boolean {
  return value === 'unknown' || value === 'opted-in' || value === 'opted-out'
}

function timestamp(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return null
  const calendarDay = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== value.slice(0, 10))
    return null
  const parsed = Date.parse(value)

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}
