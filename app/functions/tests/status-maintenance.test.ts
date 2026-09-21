/* eslint-disable import/extensions -- Node tests import TypeScript sources. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createStatusMaintenance } from '../src/whatsapp/local-status-maintenance.ts'

const enabled = {
  GCLOUD_PROJECT: 'demo-kronos-training', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9010',
  KRONOS_NOTIFICATION_WORKER_MODE: 'fake', KRONOS_WHATSAPP_STATUS_INBOX_MODE: 'local',
  KRONOS_WHATSAPP_STATUS_MAINTENANCE_MODE: 'local',
  KRONOS_WHATSAPP_QA_ACCOUNT_ID: 'qa-maintenance', KRONOS_WHATSAPP_QA_NUMBER_ID: 'qa-number',
}

const page = { status: 'processed' as const, processed: 25, pending: 3, nextCursor: 'a'.repeat(64) }

test('maintenance rejects disabled, non-local and non-QA settings before data access', () => {
  for (const override of [
    { GCLOUD_PROJECT: 'real-project' },
    { KRONOS_NOTIFICATION_WORKER_MODE: 'real' },
    { KRONOS_WHATSAPP_STATUS_MAINTENANCE_MODE: '' },
    { KRONOS_WHATSAPP_STATUS_INBOX_MODE: '' },
    { FIREBASE_DATABASE_EMULATOR_HOST: 'example.org:9010' },
    { FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9001' },
    { KRONOS_WHATSAPP_QA_ACCOUNT_ID: 'real' },
    { KRONOS_WHATSAPP_QA_NUMBER_ID: '' },
  ]) {
    let reads = 0
    assert.throws(() => createStatusMaintenance({ environment: () => ({ ...enabled, ...override }),
      runPage: async () => { reads++

        return page }, cleanup: async () => { reads++

        return 0 } }), /disabled/)
    assert.equal(reads, 0)
  }
})

test('one cycle returns only aggregates, advances a confirmed cursor and resets at the end', async () => {
  const cursors: Array<string | undefined> = []
  let cleanups = 0
  let clock = 1000

  const run = createStatusMaintenance({ environment: () => enabled, now: () => clock++,
    runPage: async input => {
      cursors.push(input?.afterKey)

      return cursors.length === 1 ? page : { ...page, processed: 4, pending: 1, nextCursor: null }
    }, cleanup: async () => { cleanups++

      return 50 } })

  assert.deepEqual(await run(), { status: 'completed', visited: 25, pending: 3, deleted: 50, durationMs: 1, hasMorePages: true })
  assert.equal((await run()).hasMorePages, false)
  await run()
  assert.deepEqual(cursors, [undefined, 'a'.repeat(64), undefined])
  assert.equal(cleanups, 3)
})

test('page failure cannot advance the cursor or run cleanup; retry starts from the same page', async () => {
  let attempts = 0
  let cleanups = 0
  const cursors: Array<string | undefined> = []

  const run = createStatusMaintenance({ environment: () => enabled,
    runPage: async input => {
      cursors.push(input?.afterKey)
      if (++attempts === 1) throw new Error('private backend failure')

      return page
    }, cleanup: async () => { cleanups++

      return 0 } })

  await assert.rejects(run())
  assert.equal(cleanups, 0)
  await run()
  assert.deepEqual(cursors, [undefined, undefined])
})

test('changing identity or endpoint stops before reusing the cursor or deleting data', async () => {
  for (const override of [{ KRONOS_WHATSAPP_QA_ACCOUNT_ID: 'qa-other' },
    { FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' },
    { KRONOS_WHATSAPP_STATUS_MAINTENANCE_MODE: '' }]) {
    let environment: NodeJS.ProcessEnv = { ...enabled }
    let reads = 0

    const run = createStatusMaintenance({ environment: () => environment,
      runPage: async () => { reads++

        return page }, cleanup: async () => 0 })

    await run()
    environment = { ...enabled, ...override }
    await assert.rejects(run(), /disabled|changed/)
    assert.equal(reads, 1)
  }
})

test('cleanup failure rejects instead of reporting a successful cycle', async () => {
  const run = createStatusMaintenance({ environment: () => enabled, runPage: async () => page,
    cleanup: async () => { throw new Error('private cleanup error') } })

  await assert.rejects(run())
})

test('identity change during the page prevents cleanup in the new scope', async () => {
  let environment: NodeJS.ProcessEnv = { ...enabled }
  let cleanups = 0

  const run = createStatusMaintenance({ environment: () => environment,
    runPage: async () => { environment = { ...enabled, KRONOS_WHATSAPP_QA_ACCOUNT_ID: 'qa-other' }

      return page },
    cleanup: async () => { cleanups++

      return 0 } })

  await assert.rejects(run(), /changed/)
  assert.equal(cleanups, 0)
})

test('a concurrent cycle is rejected while the original page is in progress', async () => {
  let release = () => {}
  const pending = new Promise<void>(resolve => { release = resolve })
  let calls = 0

  const run = createStatusMaintenance({ environment: () => enabled,
    runPage: async () => { calls++; await pending

      return page }, cleanup: async () => 0 })

  const first = run()

  await assert.rejects(run(), /already running/)
  assert.equal(calls, 1)
  release()
  assert.equal((await first).status, 'completed')
})
