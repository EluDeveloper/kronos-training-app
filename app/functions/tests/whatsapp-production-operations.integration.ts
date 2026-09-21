/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase } from '../src/notifications/realtime-job-store.ts'
import { createWhatsAppProductionMaintenance } from '../src/whatsapp/production-maintenance.ts'
import { RealtimeStatusInbox } from '../src/whatsapp/realtime-status-inbox.ts'
import {
  RealtimeWebhookEventStore,
  webhookEventRetentionMs,
} from '../src/whatsapp/realtime-webhook-events.ts'
import { parseStatusInbox, statusInboxRetentionMs, inboxScope } from '../src/whatsapp/status-inbox.ts'

const maintenanceNow = Date.parse('2026-09-21T15:00:00.000Z')
const config = { accountId: '987654321098765', phoneNumberId: '123456789012345' }

const environment = {
  KRONOS_WHATSAPP_MAINTENANCE_MODE: 'scheduled',
  KRONOS_NOTIFICATION_WORKER_MODE: 'meta',
  GCLOUD_PROJECT: 'kronos-training-fd5e5',
  KRONOS_WHATSAPP_GRAPH_API_VERSION: 'v23.0',
  KRONOS_WHATSAPP_PHONE_NUMBER_ID: config.phoneNumberId,
  KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID: config.accountId,
}

before(() => {
  assert.match(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '', /^(?:127\.0\.0\.1|localhost):\d+$/)
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
})

beforeEach(async () => {
  await getNotificationDatabase().ref('v1').update({
    notificationJobs: null,
    notificationStatusInbox: null,
    notificationOptOutEvents: null,
    notificationWebhookEvents: null,
  })
})

after(async () => {
  if (process.env.GCLOUD_PROJECT === 'demo-kronos-training'
    && /^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? ''))
    await deleteApp(getNotificationDatabase().app)
})

test('production maintenance reconciles one page and deletes only expired transient rows', async () => {
  const database = getNotificationDatabase()
  const inbox = new RealtimeStatusInbox(undefined, config)
  const expired = statusEvent('expired', 'delivered', maintenanceNow - statusInboxRetentionMs, maintenanceNow - statusInboxRetentionMs + 1_000)
  const pending = statusEvent('pending', 'sent', maintenanceNow - 1_000, maintenanceNow)
  const completed = statusEvent('completed', 'read', maintenanceNow - 1_000, maintenanceNow)

  await inbox.enqueue(expired, maintenanceNow - statusInboxRetentionMs + 1_000)
  await inbox.enqueue(pending, maintenanceNow)
  await inbox.enqueue(completed, maintenanceNow)
  await database.ref(`v1/notificationStatusInbox/${inboxScope(config)}/${completed.eventKey}/processingStatus`).set('completed')

  await database.ref('v1/notificationOptOutEvents/' + 'd'.repeat(64)).set({
    status: 'completed', receivedAt: maintenanceNow - webhookEventRetentionMs,
    expiresAt: maintenanceNow,
  })
  await database.ref('v1/notificationOptOutEvents/' + 'e'.repeat(64)).set({
    status: 'completed', receivedAt: maintenanceNow,
    expiresAt: maintenanceNow + webhookEventRetentionMs,
  })

  const webhookEvents = new RealtimeWebhookEventStore()

  await webhookEvents.markProcessed('expired-webhook', maintenanceNow - webhookEventRetentionMs)
  await webhookEvents.markProcessed('current-webhook', maintenanceNow)
  await database.ref('v1/notificationWebhookEvents/' + 'f'.repeat(64)).set({ receivedAt: 1_000 })

  const run = createWhatsAppProductionMaintenance({
    environment: () => environment,
    now: () => maintenanceNow,
    telemetry: () => {},
  })

  const result = await run()

  assert.deepEqual(result, {
    status: 'processed', visited: 3, pending: 1, completed: 1, expired: 1, missing: 0,
    deletedStatus: 1, deletedOptOut: 1, deletedWebhook: 1, durationMs: 0, hasMorePages: false,
  })
  assert.equal((await database.ref(`v1/notificationStatusInbox/${inboxScope(config)}/${expired.eventKey}`).get()).exists(), false)
  assert.equal((await database.ref(`v1/notificationStatusInbox/${inboxScope(config)}/${pending.eventKey}`).get()).exists(), true)
  assert.equal((await database.ref('v1/notificationOptOutEvents/' + 'e'.repeat(64)).get()).exists(), true)
  assert.equal((await database.ref('v1/notificationWebhookEvents/' + 'f'.repeat(64)).get()).exists(), true)
  assert.equal((await database.ref('v1/notificationWebhookEvents').get()).numChildren(), 2)
})

function statusEvent(suffix: string, status: 'sent' | 'delivered' | 'read', eventAt: number, receivedAt: number) {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: config.accountId,
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: config.phoneNumberId },
          statuses: [{ id: `wamid.operations.${suffix}`, status, timestamp: String(eventAt / 1_000) }],
        },
      }],
    }],
  }

  const parsed = parseStatusInbox(payload, config, receivedAt, Buffer.byteLength(JSON.stringify(payload)))

  assert.equal(parsed.status, 'valid')
  if (parsed.status !== 'valid')
    throw new Error('Invalid synthetic status fixture')

  return parsed.events[0]!
}
