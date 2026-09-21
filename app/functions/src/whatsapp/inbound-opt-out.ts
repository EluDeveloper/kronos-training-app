import { createHash } from 'node:crypto'
import { isLocalNotificationWorkerEnabled } from '../notifications/local-worker.js'
import { recognizeOptOutKeyword, type OptOutKeyword } from './opt-out.js'

export const optOutRetentionMs = 30 * 86400 * 1000
export interface LocalOptOutConfig { accountId: string; phoneNumberId: string }
export interface LocalOptOutEvent {
  eventKey: string
  senderPhone: string
  eventAt: number
  receivedAt: number
  keyword: OptOutKeyword
}
export type InboundOptOutResult = { status: 'no-messages' | 'invalid' } | { status: 'valid'; events: LocalOptOutEvent[] }

export function getLocalOptOutConfig(environment: NodeJS.ProcessEnv = process.env): LocalOptOutConfig | null {
  const accountId = environment.KRONOS_WHATSAPP_QA_ACCOUNT_ID ?? ''
  const phoneNumberId = environment.KRONOS_WHATSAPP_QA_NUMBER_ID ?? ''
  const port = Number(environment.FIREBASE_DATABASE_EMULATOR_HOST?.split(':')[1])
  if (!isLocalNotificationWorkerEnabled(environment) || environment.KRONOS_WHATSAPP_OPT_OUT_MODE !== 'local'
    || !Number.isInteger(port) || port < 1 || port > 65535
    || !/^qa-[a-z0-9-]{1,64}$/.test(accountId) || !/^qa-[a-z0-9-]{1,64}$/.test(phoneNumberId))
    return null

  return { accountId, phoneNumberId }
}

// Input is the JSON body whose ORIGINAL bytes were authenticated by the HTTP boundary.
export function parseInboundOptOut(payload: unknown, config: LocalOptOutConfig, receivedAt: number, bodyBytes: number): InboundOptOutResult {
  const root = record(payload)
  const batches: { account: unknown; field: unknown; value: Record<string, unknown> }[] = []
  for (const entry of Array.isArray(root?.entry) ? root.entry : []) {
    const item = record(entry)
    for (const change of Array.isArray(item?.changes) ? item.changes : []) {
      const changeRecord = record(change)
      const value = record(changeRecord?.value)
      if (value && Object.hasOwn(value, 'messages'))
        batches.push({ account: item?.id, field: changeRecord?.field, value })
    }
  }
  if (!batches.length)
    return { status: 'no-messages' }
  if (root?.object !== 'whatsapp_business_account' || !Number.isSafeInteger(receivedAt) || receivedAt < 0
    || !Number.isSafeInteger(bodyBytes) || bodyBytes < 0 || bodyBytes > 65536 || batches.length > 100)
    return { status: 'invalid' }

  const events: LocalOptOutEvent[] = []
  let count = 0
  for (const batch of batches) {
    const messages = batch.value.messages
    if (batch.field !== 'messages' || batch.account !== config.accountId
      || record(batch.value.metadata)?.phone_number_id !== config.phoneNumberId || !Array.isArray(messages))
      return { status: 'invalid' }
    count += messages.length
    if (count > 100)
      return { status: 'invalid' }
    for (const item of messages) {
      const message = record(item)
      if (!message || typeof message.id !== 'string' || !/^[\w.:-]{1,256}$/.test(message.id)
        || typeof message.from !== 'string' || !/^52\d{10}$/.test(message.from)
        || typeof message.timestamp !== 'string' || !/^\d{1,13}$/.test(message.timestamp)
        || typeof message.type !== 'string' || !message.type || message.type.length > 32)
        return { status: 'invalid' }
      const eventAt = Number(message.timestamp) * 1000
      if (!Number.isSafeInteger(eventAt) || eventAt > receivedAt)
        return { status: 'invalid' }
      if (message.type !== 'text')
        continue
      const body = record(message.text)?.body
      if (typeof body !== 'string')
        return { status: 'invalid' }
      const keyword = recognizeOptOutKeyword(body)
      if (!keyword || receivedAt - eventAt > optOutRetentionMs)
        continue
      const eventKey = createHash('sha256').update(JSON.stringify([config.accountId, config.phoneNumberId, message.id])).digest('hex')

      events.push({ eventKey, senderPhone: message.from, eventAt, receivedAt, keyword })
    }
  }

  return { status: 'valid', events }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
