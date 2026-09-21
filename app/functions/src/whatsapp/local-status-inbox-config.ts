import { isLocalNotificationWorkerEnabled } from '../notifications/local-worker.js'
import type { StatusInboxConfig } from './status-inbox.js'

export function getLocalStatusInboxConfig(environment: NodeJS.ProcessEnv = process.env): StatusInboxConfig | null {
  const accountId = environment.KRONOS_WHATSAPP_QA_ACCOUNT_ID ?? ''
  const phoneNumberId = environment.KRONOS_WHATSAPP_QA_NUMBER_ID ?? ''
  const port = Number(environment.FIREBASE_DATABASE_EMULATOR_HOST?.split(':')[1])
  if (!isLocalNotificationWorkerEnabled(environment) || environment.KRONOS_WHATSAPP_STATUS_INBOX_MODE !== 'local'
    || !Number.isInteger(port) || port < 1 || port > 65535
    || !/^qa-[a-z0-9-]{1,64}$/.test(accountId) || !/^qa-[a-z0-9-]{1,64}$/.test(phoneNumberId))
    return null

  return { accountId, phoneNumberId }
}
