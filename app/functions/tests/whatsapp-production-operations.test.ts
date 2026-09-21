/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWhatsAppProductionMaintenance,
  onWhatsAppMaintenanceScheduled,
} from '../src/whatsapp/production-maintenance.ts'
import {
  emitOperationalEvent,
  webhookTelemetryEvent,
  type OperationalEvent,
} from '../src/operations/telemetry.ts'
import { runNotificationRecovery } from '../src/notifications/production-recovery.ts'

const metaEnvironment = {
  KRONOS_WHATSAPP_MAINTENANCE_MODE: 'scheduled',
  KRONOS_NOTIFICATION_WORKER_MODE: 'meta',
  GCLOUD_PROJECT: 'kronos-training-fd5e5',
  KRONOS_WHATSAPP_GRAPH_API_VERSION: 'v23.0',
  KRONOS_WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
  KRONOS_WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321098765',
}

test('operational telemetry accepts only fixed schemas and scalar aggregates', () => {
  const written: OperationalEvent[] = []

  const event: OperationalEvent = {
    code: 'whatsapp_maintenance_completed',
    visited: 25,
    pending: 3,
    completed: 20,
    expired: 1,
    missing: 1,
    deletedStatus: 4,
    deletedOptOut: 5,
    deletedWebhook: 6,
    durationMs: 17,
    hasMorePages: true,
  }

  emitOperationalEvent(event, value => written.push(value))

  assert.deepEqual(written, [event])
  assert.throws(() => emitOperationalEvent({ ...event, phone: '520000000000' } as OperationalEvent, () => {}), /Invalid operational event/)
  assert.throws(() => emitOperationalEvent({ ...event, durationMs: -1 }, () => {}), /Invalid operational event/)
  assert.equal(JSON.stringify(written).includes('520000000000'), false)
})

test('webhook telemetry reduces request details to method and HTTP classes', () => {
  assert.deepEqual(webhookTelemetryEvent('POST', 200, 12), {
    code: 'whatsapp_webhook_result', method: 'POST', httpClass: '2xx', durationMs: 12,
  })
  assert.deepEqual(webhookTelemetryEvent('PATCH', 405, 0), {
    code: 'whatsapp_webhook_result', method: 'OTHER', httpClass: '4xx', durationMs: 0,
  })
})

test('disabled or invalid production maintenance exits before creating stores', async () => {
  let creations = 0

  const create = () => { creations++
    throw new Error('must not create a store') }

  for (const environment of [
    {},
    { ...metaEnvironment, KRONOS_WHATSAPP_MAINTENANCE_MODE: 'disabled' },
    { ...metaEnvironment, KRONOS_WHATSAPP_MAINTENANCE_MODE: 'unexpected' },
    { ...metaEnvironment, FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' },
  ]) {
    const run = createWhatsAppProductionMaintenance({
      environment: () => environment,
      createStatusInbox: create,
      createOptOutStore: create,
      createWebhookEventStore: create,
    })

    assert.equal((await run()).status, 'disabled')
  }

  assert.equal(creations, 0)
})

test('maintenance advances a confirmed cursor and returns sanitized bounded aggregates', async () => {
  const cursors: Array<string | undefined> = []
  const events = Array.from({ length: 25 }, (_, index) => ({ eventKey: index.toString(16).padStart(64, '0') }))
  const telemetry: OperationalEvent[] = []
  let clock = 1_000
  let pages = 0

  const run = createWhatsAppProductionMaintenance({
    environment: () => metaEnvironment,
    now: () => clock++,
    telemetry: event => telemetry.push(event),
    createStatusInbox: () => ({
      page: async input => {
        cursors.push(input.afterKey)
        pages++

        return pages === 1
          ? { events, nextCursor: 'f'.repeat(64) }
          : { events: events.slice(0, 2), nextCursor: null }
      },
      reconcile: async eventKey => {
        const tail = Number.parseInt(eventKey.slice(-1), 16)

        return tail % 4 === 0 ? 'pending' : tail % 4 === 1 ? 'completed' : tail % 4 === 2 ? 'expired' : 'missing'
      },
      cleanup: async () => 11,
    }),
    createOptOutStore: () => ({ cleanup: async () => 12 }),
    createWebhookEventStore: () => ({ cleanup: async () => 13 }),
  })

  const first = await run()
  const second = await run()

  assert.deepEqual(cursors, [undefined, 'f'.repeat(64)])
  assert.deepEqual(first, {
    status: 'processed', visited: 25, pending: 7, completed: 6, expired: 6, missing: 6,
    deletedStatus: 11, deletedOptOut: 12, deletedWebhook: 13, durationMs: 1, hasMorePages: true,
  })
  assert.equal(second.status, 'processed')
  assert.equal(second.status === 'processed' && second.hasMorePages, false)
  assert.equal(JSON.stringify(telemetry).includes('eventKey'), false)
})

test('maintenance reports a fixed failure code and rejects without false success', async () => {
  const telemetry: OperationalEvent[] = []

  const run = createWhatsAppProductionMaintenance({
    environment: () => metaEnvironment,
    telemetry: event => telemetry.push(event),
    createStatusInbox: () => ({
      page: async () => { throw new Error('private backend payload 520000000000') },
      reconcile: async () => 'completed',
      cleanup: async () => 0,
    }),
    createOptOutStore: () => ({ cleanup: async () => 0 }),
    createWebhookEventStore: () => ({ cleanup: async () => 0 }),
  })

  await assert.rejects(run(), /private backend payload/)
  assert.deepEqual(telemetry, [{ code: 'whatsapp_maintenance_failed', stage: 'status-page' }])
  assert.equal(JSON.stringify(telemetry).includes('520000000000'), false)
})

test('recovery emits aggregate telemetry without job identifiers', async () => {
  const telemetry: OperationalEvent[] = []

  const result = await runNotificationRecovery({
    environment: {
      ...metaEnvironment,
      KRONOS_NOTIFICATION_RECOVERY_MODE: 'scheduled',
    },
    readAccessToken: () => 'qa-only-synthetic-access-token',
    listDueJobIds: async () => ['job-' + 'a'.repeat(32)],
    processJob: async () => ({ status: 'finished' }),
    telemetry: event => telemetry.push(event),
    now: () => 2_000,
  })

  assert.equal(result.status, 'processed')
  assert.deepEqual(telemetry, [{
    code: 'whatsapp_recovery_completed', selected: 1, finished: 1,
    deferred: 0, busy: 0, skipped: 0, failed: 0,
  }])
  assert.equal(JSON.stringify(telemetry).includes('job-'), false)
})

test('maintenance scheduler is unique, secretless and resource bounded', () => {
  const endpoint = (onWhatsAppMaintenanceScheduled as unknown as {
    __endpoint: {
      timeoutSeconds?: number | null
      maxInstances?: number | null
      concurrency?: number | null
      secretEnvironmentVariables?: Array<{ key: string }>
      scheduleTrigger?: { schedule?: string; timeZone?: string }
    }
  }).__endpoint

  assert.deepEqual(endpoint.secretEnvironmentVariables ?? [], [])
  assert.equal(endpoint.scheduleTrigger?.schedule, '*/5 * * * *')
  assert.equal(endpoint.scheduleTrigger?.timeZone, 'UTC')
  assert.equal(endpoint.timeoutSeconds, 540)
  assert.equal(endpoint.maxInstances, 1)
  assert.equal(endpoint.concurrency, 1)
})
