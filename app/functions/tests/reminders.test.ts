/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_REMINDER_CONFIGURATION,
  FakeReminderScheduler,
  buildReminderCandidates,
  buildReminderSchedule,
  getMembershipDueDate,
  readReminderConfigurationFromEnv,
  resolveReminderConfiguration,
  runReminderSweep,
  type ReminderSnapshot,
} from '../src/notifications/reminders.ts'
import { InMemoryNotificationJobStore } from '../src/notifications/jobs.ts'

const activeAthlete = {
  id: 'athlete-1',
  status: 'active' as const,
  profile: { phone: '5512345678' },
  membership: { paymentDay: 12, agreedAmount: 500 },
}

const consent = {
  athleteId: 'athlete-1',
  reminderStatus: 'opted-in' as const,
  consentedPhoneE164: '525512345678',
}

const snapshot = (overrides: Partial<ReminderSnapshot> = {}): ReminderSnapshot => ({
  athletes: [activeAthlete],
  payments: {
    'athlete-1': {
      '2026-09': { status: 'pending', totalAmount: 500, balance: 500 },
    },
  },
  sales: [{ id: 'sale-1', athleteId: 'athlete-1', status: 'credit', total: 200, payments: {} }],
  consents: { 'athlete-1': consent },
  ...overrides,
})

test('E6 uses approved defaults and allows schedule/cadence overrides', () => {
  assert.deepEqual(DEFAULT_REMINDER_CONFIGURATION, {
    timezone: 'America/Mexico_City',
    executionHour: 9,
    executionMinute: 0,
    preDueDays: 3,
    overdueDays: 3,
    storeWeekdays: [3, 5],
    maxMessagesPerAthletePerDay: 1,
  })

  const configuration = resolveReminderConfiguration({
    timezone: 'America/Mexico_City',
    executionHour: 7,
    executionMinute: 30,
    preDueDays: 5,
    overdueDays: 4,
    storeWeekdays: [2, 6],
  })

  assert.equal(buildReminderSchedule(configuration).cronExpression, '30 7 * * *')
  assert.deepEqual(configuration.storeWeekdays, [2, 6])
})

test('E6 reads optional cadence values from environment without exposing secrets', () => {
  const configuration = readReminderConfigurationFromEnv({
    KRONOS_REMINDER_TIMEZONE: 'America/Mexico_City',
    KRONOS_REMINDER_HOUR: '8',
    KRONOS_REMINDER_MINUTE: '45',
    KRONOS_REMINDER_PRE_DUE_DAYS: '4',
    KRONOS_REMINDER_OVERDUE_DAYS: '2',
    KRONOS_REMINDER_STORE_WEEKDAYS: '2,6',
  })

  assert.deepEqual(configuration, {
    timezone: 'America/Mexico_City',
    executionHour: 8,
    executionMinute: 45,
    preDueDays: 4,
    overdueDays: 2,
    storeWeekdays: [2, 6],
    maxMessagesPerAthletePerDay: 1,
  })
})

test('E6 rejects invalid cadence configuration', () => {
  assert.throws(() => resolveReminderConfiguration({ executionHour: 24 }), /execution hour/)
  assert.throws(() => resolveReminderConfiguration({ timezone: 'Invalid/Timezone' }), /timezone/)
  assert.throws(() => resolveReminderConfiguration({ storeWeekdays: [3, 3] }), /weekdays/)
  assert.throws(() => resolveReminderConfiguration({ maxMessagesPerAthletePerDay: 2 as 1 }), /daily message limit/)
  assert.throws(() => readReminderConfigurationFromEnv({ KRONOS_REMINDER_OVERDUE_DAYS: '0' }), /overdue days/)
})

test('E6 clamps membership due dates to the last day of the month', () => {
  assert.equal(getMembershipDueDate('2026-02', 31), '2026-02-28')
  assert.equal(getMembershipDueDate('2028-02', 31), '2028-02-29')
  assert.equal(getMembershipDueDate('2026-04', 31), '2026-04-30')
})

test('E8-PROD-1 finds a pre-due reminder in the next period without a payment row', () => {
  const nextPeriod = snapshot({
    athletes: [{ ...activeAthlete, membership: { paymentDay: 1, agreedAmount: 500 } }],
    payments: {},
    sales: [],
  })

  const candidates = buildReminderCandidates({
    snapshot: nextPeriod,
    now: Date.UTC(2026, 11, 29, 15, 0),
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.kind, 'pre-due')
  assert.equal(candidates[0]?.period, '2027-01')
  assert.equal(candidates[0]?.dueDate, '2027-01-01')
  assert.equal(candidates[0]?.monthlyDebt, 500)
})

test('E8-PROD-1 finds a clamped overdue reminder in the previous period without a payment row', () => {
  const previousPeriod = snapshot({
    athletes: [{ ...activeAthlete, membership: { paymentDay: 31, agreedAmount: 500 } }],
    payments: {},
    sales: [],
  })

  const candidates = buildReminderCandidates({
    snapshot: previousPeriod,
    now: Date.UTC(2026, 9, 3, 15, 0),
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.kind, 'overdue')
  assert.equal(candidates[0]?.period, '2026-09')
  assert.equal(candidates[0]?.dueDate, '2026-09-30')
  assert.equal(candidates[0]?.monthlyDebt, 500)
})

test('E8-PROD-1 does not revive paid balances from adjacent periods', () => {
  const paidAdjacentPeriods = snapshot({
    athletes: [{ ...activeAthlete, membership: { paymentDay: 1, agreedAmount: 500 } }],
    payments: {
      'athlete-1': {
        '2027-01': { status: 'paid', totalAmount: 500, balance: 0 },
      },
    },
    sales: [],
  })

  const candidates = buildReminderCandidates({
    snapshot: paidAdjacentPeriods,
    now: Date.UTC(2026, 11, 29, 15, 0),
  })

  assert.equal(candidates.length, 0)
})

test('E8-PROD-1 creates due reminders for days 28, 29, 30 and 31 after month-end clamping', () => {
  const cases = [
    { paymentDay: 28, now: Date.UTC(2026, 1, 28, 15, 0), dueDate: '2026-02-28' },
    { paymentDay: 29, now: Date.UTC(2028, 1, 29, 15, 0), dueDate: '2028-02-29' },
    { paymentDay: 30, now: Date.UTC(2026, 3, 30, 15, 0), dueDate: '2026-04-30' },
    { paymentDay: 31, now: Date.UTC(2026, 3, 30, 15, 0), dueDate: '2026-04-30' },
  ]

  for (const entry of cases) {
    const due = snapshot({
      athletes: [{ ...activeAthlete, membership: { paymentDay: entry.paymentDay, agreedAmount: 500 } }],
      payments: {},
      sales: [],
    })

    const candidates = buildReminderCandidates({ snapshot: due, now: entry.now })

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0]?.kind, 'due')
    assert.equal(candidates[0]?.dueDate, entry.dueDate)
  }
})

test('E6 consolidates monthly and store debt on the approved pre-due date', () => {
  const candidates = buildReminderCandidates({
    snapshot: snapshot(),
    now: Date.UTC(2026, 8, 9, 15, 0),
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.kind, 'combined')
  assert.equal(candidates[0]?.monthlyDebt, 500)
  assert.equal(candidates[0]?.storeDebt, 200)
  assert.equal(candidates[0]?.totalDebt, 700)
  assert.equal(candidates[0]?.period, '2026-09')
})

test('E6 emits store reminders on Wednesday and Friday and no other weekday', () => {
  const storeOnly = snapshot({
    payments: { 'athlete-1': { '2026-09': { status: 'paid', totalAmount: 500, balance: 0 } } },
  })

  assert.equal(buildReminderCandidates({ snapshot: storeOnly, now: Date.UTC(2026, 8, 9, 15, 0) })[0]?.kind, 'store')
  assert.equal(buildReminderCandidates({ snapshot: storeOnly, now: Date.UTC(2026, 8, 11, 15, 0) })[0]?.kind, 'store')
  assert.equal(buildReminderCandidates({ snapshot: storeOnly, now: Date.UTC(2026, 8, 10, 15, 0) }).length, 0)
})

test('E6 selects an overdue monthly debt three days after a clamped due date', () => {
  const overdueSnapshot = snapshot({
    athletes: [{ ...activeAthlete, membership: { paymentDay: 31, agreedAmount: 500 } }],
    payments: { 'athlete-1': { '2026-09': { status: 'pending', totalAmount: 500, balance: 500 } } },
  })

  const candidates = buildReminderCandidates({
    snapshot: overdueSnapshot,
    now: Date.UTC(2026, 9, 3, 15, 0),
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.kind, 'overdue')
  assert.equal(candidates[0]?.dueDate, '2026-09-30')
})

test('E6 requires current opted-in consent and the current phone', () => {
  const noConsent = snapshot({ consents: {} })

  const changedPhone = snapshot({
    athletes: [{ ...activeAthlete, profile: { phone: '5587654321' } }],
  })

  assert.equal(buildReminderCandidates({ snapshot: noConsent, now: Date.UTC(2026, 8, 9, 15, 0) }).length, 0)
  assert.equal(buildReminderCandidates({ snapshot: changedPhone, now: Date.UTC(2026, 8, 9, 15, 0) }).length, 0)
})

test('E8-PROD-1 excludes inactive and opted-out athletes', () => {
  const inactive = snapshot({
    athletes: [{ ...activeAthlete, status: 'inactive' }],
    sales: [],
  })

  const optedOut = snapshot({
    consents: {
      'athlete-1': { ...consent, reminderStatus: 'opted-out' },
    },
    sales: [],
  })

  assert.equal(buildReminderCandidates({ snapshot: inactive, now: Date.UTC(2026, 8, 9, 15, 0) }).length, 0)
  assert.equal(buildReminderCandidates({ snapshot: optedOut, now: Date.UTC(2026, 8, 9, 15, 0) }).length, 0)
})

test('E8-PROD-1 excludes settled monthly and store balances', () => {
  const settled = snapshot({
    payments: {
      'athlete-1': {
        '2026-09': { status: 'paid', totalAmount: 500, balance: 0 },
      },
    },
    sales: [{
      id: 'sale-1', athleteId: 'athlete-1', status: 'credit', total: 200,
      payments: { payment: { amountApplied: 200 } },
    }],
  })

  assert.equal(buildReminderCandidates({ snapshot: settled, now: Date.UTC(2026, 8, 9, 15, 0) }).length, 0)
})

test('E8-PROD-1 rejects invalid configuration before creating jobs', async () => {
  const jobs = new InMemoryNotificationJobStore()

  await assert.rejects(() => runReminderSweep({
    snapshot: snapshot(),
    jobs,
    now: Date.UTC(2026, 8, 9, 15, 0),
    configuration: { executionHour: 24 },
  }), /execution hour/)

  assert.equal(await jobs.getByIdempotencyKey('reminder:athlete-1:2026-09-09:daily'), null)
})

test('E6 creates at most one reminder job per athlete and day', async () => {
  const jobs = new InMemoryNotificationJobStore()

  const input = {
    snapshot: snapshot(),
    jobs,
    now: Date.UTC(2026, 8, 9, 15, 0),
    rollout: { mode: 'qa' as const, athleteId: 'athlete-1' },
  }

  const first = await runReminderSweep(input)
  const second = await runReminderSweep(input)

  assert.equal(first.enqueued.length, 1)
  assert.equal(first.enqueued[0]?.created, true)
  assert.equal(second.enqueued.length, 1)
  assert.equal(second.enqueued[0]?.created, false)
  assert.equal(second.enqueued[0]?.job.idempotencyKey, 'reminder:athlete-1:2026-09-09:daily')
})

test('rollout filters reminder jobs before persistence', async () => {
  const disabledJobs = new InMemoryNotificationJobStore()

  const disabled = await runReminderSweep({
    snapshot: snapshot(),
    jobs: disabledJobs,
    now: Date.UTC(2026, 8, 9, 15, 0),
    rollout: { mode: 'disabled', reason: 'MODE_DISABLED' },
  })

  const otherJobs = new InMemoryNotificationJobStore()

  const other = await runReminderSweep({
    snapshot: snapshot(),
    jobs: otherJobs,
    now: Date.UTC(2026, 8, 9, 15, 0),
    rollout: { mode: 'qa', athleteId: 'athlete-2' },
  })

  assert.deepEqual(disabled.candidates, [])
  assert.deepEqual(disabled.enqueued, [])
  assert.deepEqual(other.candidates, [])
  assert.deepEqual(other.enqueued, [])
})

test('E6 fake scheduler only runs at the configured local time', async () => {
  const runs: number[] = []

  const scheduler = new FakeReminderScheduler(async now => {
    runs.push(now)

    return { ok: true }
  })

  const beforeSchedule = await scheduler.run(Date.UTC(2026, 8, 9, 14, 0))
  const atSchedule = await scheduler.run(Date.UTC(2026, 8, 9, 15, 0))

  assert.equal(beforeSchedule.status, 'skipped-not-scheduled')
  assert.equal(atSchedule.status, 'executed')
  assert.deepEqual(runs, [Date.UTC(2026, 8, 9, 15, 0)])
})
