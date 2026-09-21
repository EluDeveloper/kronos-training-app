/* eslint-disable import/extensions, camelcase -- Node tests and synthetic provider wire format. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { after, before, test } from 'node:test'
import { deleteApp } from 'firebase-admin/app'
import { getNotificationDatabase, RealtimeDatabaseNotificationJobStore } from '../src/notifications/realtime-job-store.ts'
import { createStatusMaintenance } from '../src/whatsapp/local-status-maintenance.ts'
import { inboxScope, parseStatusInbox, statusInboxRetentionMs } from '../src/whatsapp/status-inbox.ts'

const execute = promisify(execFile)
const now = Math.floor(Date.now() / 1000) * 1000
const owned = new Set<string>()
const cli = 'functions/lib/src/whatsapp/status-maintenance-cli.js'

before(() => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  process.env.KRONOS_NOTIFICATION_WORKER_MODE = 'fake'
  process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = 'local'
  process.env.KRONOS_WHATSAPP_STATUS_MAINTENANCE_MODE = 'local'
  process.env.KRONOS_WHATSAPP_QA_NUMBER_ID = 'qa-number'
})
after(async () => {
  for (const path of owned) await getNotificationDatabase().ref(path).remove()
  await deleteApp(getNotificationDatabase().app)
})

async function fixture(accountId: string) {
  process.env.KRONOS_WHATSAPP_QA_ACCOUNT_ID = accountId

  const config = { accountId, phoneNumberId: 'qa-number' }
  const path = 'v1/notificationStatusInbox/' + inboxScope(config)
  const root = getNotificationDatabase().ref(path)

  assert.equal((await root.get()).exists(), false, 'Do not replace existing fixtures')
  owned.add(path)
  function event(id: string, at = now, status = 'delivered') {
    const parsed = parseStatusInbox({ object: 'whatsapp_business_account', entry: [{ id: accountId, changes: [{
      field: 'messages', value: { metadata: { phone_number_id: 'qa-number' },
        statuses: [{ id: 'wamid.qa.' + id, status, timestamp: String(at / 1000) }] },
    }] }] }, config, at, 1000)

    if (parsed.status !== 'valid') throw new Error('Invalid fixture')

    return parsed.events[0]!
  }

  return { root, event }
}

async function acceptedJob(id: string) {
  const jobs = new RealtimeDatabaseNotificationJobStore()

  const input = { athleteId: 'qa-maintenance', type: 'payment-receipt' as const,
    idempotencyKey: 'sale-initial:' + id, reference: id }

  assert.equal(await jobs.getByIdempotencyKey(input.idempotencyKey), null)

  const { job } = await jobs.createIfAbsent(input, now)

  owned.add('v1/notificationJobs/' + job.jobId)
  await jobs.acquireLease(job.jobId, 'qa-maintenance', now, 60000)
  await jobs.setProviderMessageId(job.jobId, 'wamid.qa.' + id, now)
  await jobs.transition(job.jobId, 'accepted', now)

  return { jobs, jobId: job.jobId }
}

test('real cycles recover later pages and remove at most fifty expired records only in their scope', async () => {
  const main = await fixture('qa-maintenance-integration')
  const other = await fixture('qa-maintenance-other')
  const foreign = other.event('foreign', now - statusInboxRetentionMs)

  await other.root.child(foreign.eventKey).set(foreign.record)
  process.env.KRONOS_WHATSAPP_QA_ACCOUNT_ID = 'qa-maintenance-integration'

  const records: Record<string, unknown> = {}
  for (let i = 0; i < 53; i++) {
    const event = main.event('expired-' + i, now - statusInboxRetentionMs)

    records[event.eventKey] = event.record
  }
  for (let i = 0; i < 30; i++) {
    const event = main.event('unknown-' + i)

    records[event.eventKey] = event.record
  }
  const early = main.event('maintenance-pages')

  records[early.eventKey] = early.record
  await main.root.set(records)

  const { jobs, jobId } = await acceptedJob('maintenance-pages')
  const paymentPath = 'v1/payments/qa-maintenance-preserved/2026-09'
  const consentPath = 'v1/notificationPreferences/qa-maintenance-preserved'

  const preserved = { [paymentPath]: { amount: 200, totalAmount: 500, balance: 300 },
    [consentPath]: { receiptStatus: 'opted-in', reminderStatus: 'opted-in' } }

  for (const path of Object.keys(preserved)) {
    assert.equal((await getNotificationDatabase().ref(path).get()).exists(), false)
    owned.add(path)
  }
  await getNotificationDatabase().ref().update(preserved)

  const run = createStatusMaintenance({ now: () => now })
  const first = await run()

  assert.equal(first.visited, 25)
  assert.equal(first.deleted, 50)

  const second = await run()

  assert.equal(second.deleted, 3)
  let last = second
  for (let i = 0; last.hasMorePages && i < 10; i++) last = await run()
  assert.equal(last.hasMorePages, false)
  assert.equal((await main.root.get()).numChildren(), 31)
  assert.equal((await jobs.getById(jobId))?.status, 'delivered')
  assert.equal((await jobs.getById(jobId))?.attemptNumber, 1)
  assert.equal((await main.root.child(early.eventKey).get()).val().processingStatus, 'completed')
  assert.deepEqual((await other.root.child(foreign.eventKey).get()).val(), foreign.record)
  for (const [path, record] of Object.entries(preserved))
    assert.deepEqual((await getNotificationDatabase().ref(path).get()).val(), record)
})

test('compiled CLI once uses real RTDB and closes with aggregate-only output; replay never regresses read', async () => {
  const data = await fixture('qa-maintenance-cli')
  const early = data.event('maintenance-cli', now, 'read')

  await data.root.child(early.eventKey).set(early.record)

  const { jobs, jobId } = await acceptedJob('maintenance-cli')
  const output = await execute(process.execPath, [cli, '--once', '--apply'], { timeout: 20000 })

  assert.equal(output.stderr, '')

  const result = JSON.parse(output.stdout.trim())

  assert.equal(result.status, 'completed')
  assert.equal(result.visited, 1)
  assert.equal(result.pending, 0)
  assert.equal(result.deleted, 0)
  assert.equal(result.hasMorePages, false)
  assert.deepEqual(Object.keys(result).sort(), ['status', 'visited', 'pending', 'deleted', 'durationMs', 'hasMorePages'].sort())
  assert.equal((await jobs.getById(jobId))?.status, 'read')

  const late = data.event('maintenance-cli')

  await data.root.child(late.eventKey).set(late.record)
  await execute(process.execPath, [cli, '--once', '--apply'], { timeout: 20000 })
  assert.equal((await jobs.getById(jobId))?.status, 'read')
  assert.equal((await jobs.getById(jobId))?.attemptNumber, 1)
})

test('compiled CLI fails closed and sanitizes a corrupt record without erasing it', async () => {
  const data = await fixture('qa-maintenance-corrupt')
  const key = 'f'.repeat(64)
  const corrupt = { privateField: 'private-fixture-value' }

  await data.root.child(key).set(corrupt)
  await assert.rejects(execute(process.execPath, [cli, '--once', '--apply'], { timeout: 20000 }), error => {
    const result = error as Error & { code: number; stdout: string; stderr: string }

    assert.equal(result.code, 1)
    assert.deepEqual(JSON.parse(result.stdout.trim()), { status: 'failed', code: 'maintenance-failed' })
    assert.equal(result.stderr, '')

    return true
  })
  assert.deepEqual((await data.root.child(key).get()).val(), corrupt)
})

test('compiled runtime handles both stop signals during its real wait and exits cleanly', async () => {
  await fixture('qa-maintenance-signals')
  for (const signal of ['SIGINT', 'SIGTERM']) {
    // Windows child.kill forcibly terminates Node; emit the signal in the child
    // to exercise the registered handlers, real timer and SDK close portably.
    const script = `import { runStatusMaintenanceCli } from './functions/lib/src/whatsapp/status-maintenance-cli.js';
      process.exitCode = await runStatusMaintenanceCli(['--watch', '--apply'], {
        write: line => { console.log(line); if (JSON.parse(line).status === 'completed')
          setImmediate(() => process.emit('${signal}')); }
      });`

    const output = await execute(process.execPath, ['--input-type=module', '-e', script], { timeout: 20000 })

    assert.equal(output.stderr, '')

    const rows = output.stdout.trim().split('\n').map(line => JSON.parse(line))

    assert.equal(rows.length, 2)
    assert.equal(rows[0].status, 'completed')
    assert.deepEqual(rows[1], { status: 'stopped' })
  }
})
