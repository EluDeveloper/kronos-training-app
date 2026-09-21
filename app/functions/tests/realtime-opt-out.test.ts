/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import { RealtimeOptOutStore } from '../src/whatsapp/realtime-opt-out.ts'
import type { getNotificationDatabase } from '../src/notifications/realtime-job-store.ts'

test('a duplicate observing an uncommitted withdrawal must confirm server consent before completion', async () => {
  const localEnvironment = { KRONOS_WHATSAPP_OPT_OUT_MODE: 'local', KRONOS_NOTIFICATION_WORKER_MODE: 'fake',
    GCLOUD_PROJECT: 'demo-kronos-training', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9010',
    KRONOS_WHATSAPP_QA_ACCOUNT_ID: 'qa-business', KRONOS_WHATSAPP_QA_NUMBER_ID: 'qa-number' }

  const previous = Object.fromEntries(Object.keys(localEnvironment).map(key => [key, process.env[key]]))

  Object.assign(process.env, localEnvironment)
  try {
    const event = { eventKey: 'a'.repeat(64), senderPhone: '520000000001', eventAt: 1000, receivedAt: 2000, keyword: 'BAJA' as const }
    let serverConsent: Record<string, unknown> = { athleteId: 'qa-optout-race', receiptStatus: 'opted-in', reminderStatus: 'opted-in', consentedAt: 0, consentedPhoneE164: event.senderPhone }
    const optimisticConsent = { ...serverConsent, receiptStatus: 'opted-out', reminderStatus: 'opted-out' }
    let marker: unknown = null
    const snapshot = (value: unknown) => ({ val: () => value, exists: () => value !== null })

    const markerReference = {
      get: async () => snapshot(marker),
      transaction: async (callback: (current: unknown) => unknown) => {
        const next = callback(marker)
        if (next !== undefined) marker = next

        return { committed: next !== undefined, snapshot: snapshot(marker) }
      },
    }

    const match = { numChildren: () => 1, forEach: (callback: (child: { key: string }) => void) => callback({ key: 'qa-optout-race' }) }
    const query = { orderByChild: () => query, equalTo: () => query, limitToFirst: () => query, get: async () => match }

    const preferenceReference = { transaction: async (callback: (current: unknown) => unknown) => {
      // Another request has a pending local write that will fail. Aborting here is not a server acknowledgement.
      if (callback(optimisticConsent) === undefined)
        return { committed: false, snapshot: snapshot(optimisticConsent) }
      serverConsent = callback(serverConsent) as Record<string, unknown>

      return { committed: true, snapshot: snapshot(serverConsent) }
    } }

    const database = { ref: (path: string) => path.includes('/notificationOptOutEvents/') ? markerReference
      : path.endsWith('/notificationPreferences') ? query : preferenceReference } as unknown as ReturnType<typeof getNotificationDatabase>

    await new RealtimeOptOutStore(() => database).process(event)
    assert.equal(serverConsent.receiptStatus, 'opted-out')
    assert.equal((marker as { status: string }).status, 'completed')
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('disabled adapter cannot obtain a database even when a factory is injected', async () => {
  const previous = process.env.KRONOS_WHATSAPP_OPT_OUT_MODE

  delete process.env.KRONOS_WHATSAPP_OPT_OUT_MODE
  try {
    let calls = 0
    const store = new RealtimeOptOutStore(() => { calls++; throw new Error('I/O forbidden') })

    await assert.rejects(store.cleanup(0), /disabled/)
    assert.equal(calls, 0)
  } finally {
    if (previous !== undefined) process.env.KRONOS_WHATSAPP_OPT_OUT_MODE = previous
  }
})
