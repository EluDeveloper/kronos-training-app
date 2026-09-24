import { defineString } from 'firebase-functions/params'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { notificationFunctionRuntime } from '../runtime-options.js'
import type {
  CreateNotificationJobResult,
  NotificationJobStore,
} from './jobs.js'
import { RealtimeDatabaseNotificationJobStore, getNotificationDatabase } from './realtime-job-store.js'
import {
  isNotificationAthleteAllowed,
  resolveNotificationRollout,
  type NotificationRollout,
} from './rollout.js'

const rolloutMode = defineString('KRONOS_NOTIFICATION_ROLLOUT_MODE', { default: 'disabled' })
const qaAthleteId = defineString('KRONOS_NOTIFICATION_QA_ATHLETE_ID', { default: '' })

export interface ReminderConfiguration {
  timezone: string
  executionHour: number
  executionMinute: number
  preDueDays: number
  overdueDays: number
  storeWeekdays: number[]
  maxMessagesPerAthletePerDay: 1
}

export const DEFAULT_REMINDER_CONFIGURATION: ReminderConfiguration = {
  timezone: 'America/Mexico_City',
  executionHour: 9,
  executionMinute: 0,
  preDueDays: 3,
  overdueDays: 3,
  storeWeekdays: [3, 5],
  maxMessagesPerAthletePerDay: 1,
}

export interface ReminderAthlete {
  id: string
  status: 'active' | 'inactive'
  profile: { phone: string }
  membership: { paymentDay: number; agreedAmount: number }
}

export interface ReminderPayment {
  status?: string
  amount?: number | string
  totalAmount?: number | string
  balance?: number | string
}

export interface ReminderSale {
  id: string
  athleteId?: string | null
  status: string
  total: number | string
  payments?: Record<string, { amountApplied?: number | string }>
}

export interface ReminderConsent {
  athleteId: string
  reminderStatus: 'unknown' | 'opted-in' | 'opted-out'
  consentedPhoneE164?: string | null
}

export interface ReminderSnapshot {
  athletes: ReminderAthlete[]
  payments: Record<string, Record<string, ReminderPayment>>
  sales: ReminderSale[]
  consents: Record<string, ReminderConsent>
}

export type ReminderKind = 'pre-due' | 'due' | 'overdue' | 'store' | 'combined'

export interface ReminderCandidate {
  athleteId: string
  localDate: string
  kind: ReminderKind
  period: string
  dueDate: string | null
  monthlyDebt: number
  storeDebt: number
  totalDebt: number
}

export interface ReminderSchedule {
  cronExpression: string
  timezone: string
}

export function resolveReminderConfiguration(
  overrides: Partial<ReminderConfiguration> = {},
): ReminderConfiguration {
  if (overrides.maxMessagesPerAthletePerDay !== undefined && overrides.maxMessagesPerAthletePerDay !== 1)
    throw new Error('Invalid reminder daily message limit')

  const configuration: ReminderConfiguration = {
    ...DEFAULT_REMINDER_CONFIGURATION,
    ...overrides,
    storeWeekdays: [...(overrides.storeWeekdays ?? DEFAULT_REMINDER_CONFIGURATION.storeWeekdays)],
    maxMessagesPerAthletePerDay: 1,
  }

  if (!isValidTimezone(configuration.timezone))
    throw new Error('Invalid reminder timezone')
  if (!isIntegerInRange(configuration.executionHour, 0, 23))
    throw new Error('Invalid reminder execution hour')
  if (!isIntegerInRange(configuration.executionMinute, 0, 59))
    throw new Error('Invalid reminder execution minute')
  if (!isIntegerAtLeast(configuration.preDueDays, 1))
    throw new Error('Invalid reminder pre-due days')
  if (!isIntegerAtLeast(configuration.overdueDays, 1))
    throw new Error('Invalid reminder overdue days')
  if (!configuration.storeWeekdays.length
    || configuration.storeWeekdays.some(day => !isIntegerInRange(day, 1, 7))
    || new Set(configuration.storeWeekdays).size !== configuration.storeWeekdays.length) {
    throw new Error('Invalid reminder store weekdays')
  }

  return configuration
}

export function buildReminderSchedule(configuration: ReminderConfiguration): ReminderSchedule {
  const resolved = resolveReminderConfiguration(configuration)

  return {
    cronExpression: `${resolved.executionMinute} ${resolved.executionHour} * * *`,
    timezone: resolved.timezone,
  }
}

export function getMembershipDueDate(period: string, paymentDay: number): string {
  const parsedPeriod = parsePeriod(period)
  if (!isIntegerInRange(paymentDay, 1, 31))
    throw new Error('Invalid membership payment day')

  const lastDay = new Date(Date.UTC(parsedPeriod.year, parsedPeriod.month, 0)).getUTCDate()
  const day = Math.min(paymentDay, lastDay)

  return `${period}-${String(day).padStart(2, '0')}`
}

export function buildReminderCandidates(input: {
  snapshot: ReminderSnapshot
  now: number
  configuration?: Partial<ReminderConfiguration>
}): ReminderCandidate[] {
  const configuration = resolveReminderConfiguration(input.configuration)
  const candidates: ReminderCandidate[] = []

  for (const athlete of input.snapshot.athletes) {
    if (!isEligibleForReminder(athlete, input.snapshot.consents[athlete.id]))
      continue

    const candidate = buildReminderDebtCandidate(athlete, input.snapshot.payments[athlete.id] ?? {}, input.snapshot.sales, input.now, configuration)
    if (candidate)
      candidates.push(candidate)
  }

  return candidates.sort((left, right) => left.athleteId.localeCompare(right.athleteId))
}

export function buildReminderDebtCandidate(
  athlete: Pick<ReminderAthlete, 'id' | 'membership'>,
  payments: Record<string, ReminderPayment>,
  sales: ReminderSale[],
  now: number,
  configuration: ReminderConfiguration = DEFAULT_REMINDER_CONFIGURATION,
): ReminderCandidate | null {
  const local = getLocalDateTime(now, configuration.timezone)
  const monthly = findMonthlyReminder(athlete, payments, local, configuration)
  const storeDebt = configuration.storeWeekdays.includes(local.weekday) ? calculateStoreDebt(athlete.id, sales) : 0
  if (!monthly && storeDebt <= 0)
    return null

  return {
    athleteId: athlete.id, localDate: local.date,
    kind: monthly && storeDebt > 0 ? 'combined' : monthly ? monthly.kind : 'store',
    period: monthly?.period ?? local.period, dueDate: monthly?.dueDate ?? null,
    monthlyDebt: monthly?.debt ?? 0, storeDebt,
    totalDebt: (monthly?.debt ?? 0) + storeDebt,
  }
}

export async function runReminderSweep(input: {
  snapshot: ReminderSnapshot
  jobs: NotificationJobStore
  now: number
  configuration?: Partial<ReminderConfiguration>
  rollout?: NotificationRollout
}): Promise<{
  localDate: string
  candidates: ReminderCandidate[]
  enqueued: CreateNotificationJobResult[]
}> {
  const configuration = resolveReminderConfiguration(input.configuration)
  const localDate = getLocalDateTime(input.now, configuration.timezone).date

  const rollout = input.rollout ?? resolveNotificationRollout({})

  const candidates = buildReminderCandidates({
    snapshot: input.snapshot,
    now: input.now,
    configuration,
  }).filter(candidate => isNotificationAthleteAllowed(rollout, candidate.athleteId))

  const enqueued = await Promise.all(candidates.map(candidate => input.jobs.createIfAbsent({
    type: 'payment-reminder',
    athleteId: candidate.athleteId,
    idempotencyKey: `reminder:${candidate.athleteId}:${localDate}:daily`,
    reference: `reminder:${candidate.localDate}:${candidate.kind}:${candidate.period}`,
  }, input.now)))

  return { localDate, candidates, enqueued }
}

export class FakeReminderScheduler {
  private readonly configuration: ReminderConfiguration
  private readonly handler: (now: number) => Promise<unknown>

  constructor(
    handler: (now: number) => Promise<unknown>,
    configuration: Partial<ReminderConfiguration> = {},
  ) {
    this.handler = handler
    this.configuration = resolveReminderConfiguration(configuration)
  }

  async run(now: number): Promise<{
    status: 'skipped-not-scheduled' | 'executed'
    localDate: string
    result?: unknown
  }> {
    const local = getLocalDateTime(now, this.configuration.timezone)
    if (local.hour !== this.configuration.executionHour || local.minute !== this.configuration.executionMinute)
      return { status: 'skipped-not-scheduled', localDate: local.date }

    return {
      status: 'executed',
      localDate: local.date,
      result: await this.handler(now),
    }
  }
}

export function readReminderConfigurationFromEnv(
  environment: NodeJS.ProcessEnv = process.env,
): ReminderConfiguration {
  return resolveReminderConfiguration({
    timezone: environment.KRONOS_REMINDER_TIMEZONE || DEFAULT_REMINDER_CONFIGURATION.timezone,
    executionHour: readEnvInteger(environment.KRONOS_REMINDER_HOUR, DEFAULT_REMINDER_CONFIGURATION.executionHour),
    executionMinute: readEnvInteger(environment.KRONOS_REMINDER_MINUTE, DEFAULT_REMINDER_CONFIGURATION.executionMinute),
    preDueDays: readEnvInteger(environment.KRONOS_REMINDER_PRE_DUE_DAYS, DEFAULT_REMINDER_CONFIGURATION.preDueDays),
    overdueDays: readEnvInteger(environment.KRONOS_REMINDER_OVERDUE_DAYS, DEFAULT_REMINDER_CONFIGURATION.overdueDays),
    storeWeekdays: readEnvWeekdays(environment.KRONOS_REMINDER_STORE_WEEKDAYS),
  })
}

export interface ReminderDataSource {
  read(): Promise<ReminderSnapshot>
}

export class RealtimeDatabaseReminderDataSource implements ReminderDataSource {
  async read(): Promise<ReminderSnapshot> {
    const database = getNotificationDatabase()

    const [athletes, payments, sales, consents] = await Promise.all([
      database.ref('v1/athletes').get(),
      database.ref('v1/payments').get(),
      database.ref('v1/sales').get(),
      database.ref('v1/notificationPreferences').get(),
    ])

    return {
      athletes: parseAthletes(athletes.val()),
      payments: parsePayments(payments.val()),
      sales: parseSales(sales.val()),
      consents: parseConsents(consents.val()),
    }
  }
}

const scheduledConfiguration = readReminderConfigurationFromEnv()
const scheduledReminder = buildReminderSchedule(scheduledConfiguration)

export const onReminderScheduled = onSchedule({
  ...notificationFunctionRuntime,
  schedule: scheduledReminder.cronExpression,
  timeZone: scheduledReminder.timezone,
}, async () => {
  const rollout = resolveNotificationRollout({
    KRONOS_NOTIFICATION_ROLLOUT_MODE: rolloutMode.value(),
    KRONOS_NOTIFICATION_QA_ATHLETE_ID: qaAthleteId.value(),
  })

  if (rollout.mode === 'disabled')
    return

  await runReminderSweep({
    snapshot: await new RealtimeDatabaseReminderDataSource().read(),
    jobs: new RealtimeDatabaseNotificationJobStore(),
    now: Date.now(),
    configuration: scheduledConfiguration,
    rollout,
  })
})

interface LocalDateTime {
  date: string
  period: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
}

interface MonthlyReminder {
  kind: 'pre-due' | 'due' | 'overdue'
  period: string
  dueDate: string
  debt: number
}

function findMonthlyReminder(
  athlete: Pick<ReminderAthlete, 'membership'>,
  payments: Record<string, ReminderPayment>,
  local: LocalDateTime,
  configuration: ReminderConfiguration,
): MonthlyReminder | null {
  const periods = new Set([
    ...getAdjacentPeriods(local),
    ...Object.keys(payments).filter(isValidPeriod),
  ])

  const matches: MonthlyReminder[] = []

  for (const period of [...periods].sort()) {
    const dueDate = getMembershipDueDate(period, athlete.membership.paymentDay)
    const difference = differenceInDays(local.date, dueDate)
    const payment = payments[period]
    const debt = calculateMembershipDebt(payment, athlete.membership.agreedAmount)
    if (debt <= 0)
      continue

    const kind = difference === -configuration.preDueDays
      ? 'pre-due'
      : difference === 0
        ? 'due'
        : difference === configuration.overdueDays
          ? 'overdue'
          : null

    if (kind)
      matches.push({ kind, period, dueDate, debt })
  }

  const selected = matches[0]
  if (!selected)
    return null

  return matches.slice(1).reduce((combined, match) => ({
    ...combined,
    debt: combined.debt + match.debt,
  }), selected)
}

function getAdjacentPeriods(local: Pick<LocalDateTime, 'year' | 'month'>): string[] {
  return [-1, 0, 1].map(offset => {
    const date = new Date(Date.UTC(local.year, local.month - 1 + offset, 1))

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }).filter(isValidPeriod)
}

function calculateMembershipDebt(payment: ReminderPayment | undefined, agreedAmount: number): number {
  if (!payment)
    return Math.max(0, finiteNumber(agreedAmount) ?? 0)
  if (payment.balance !== undefined) {
    const balance = finiteNumber(payment.balance)
    if (balance !== null)
      return Math.max(0, balance)
  }
  if (payment.status === 'paid')
    return 0

  const total = finiteNumber(payment.totalAmount) ?? Math.max(0, finiteNumber(agreedAmount) ?? 0)
  const paid = finiteNumber(payment.amount) ?? 0

  return Math.max(0, total - paid)
}

function calculateStoreDebt(athleteId: string, sales: ReminderSale[]): number {
  return sales.reduce((debt, sale) => {
    if (sale.athleteId !== athleteId || sale.status !== 'credit')
      return debt
    const total = finiteNumber(sale.total)
    if (total === null)
      return debt

    const paid = Object.values(sale.payments ?? {})
      .reduce((sum, payment) => sum + (finiteNumber(payment.amountApplied) ?? 0), 0)


    return debt + Math.max(0, total - paid)
  }, 0)
}

function isEligibleForReminder(athlete: ReminderAthlete, consent?: ReminderConsent): boolean {
  if (athlete.status !== 'active' || !consent || consent.reminderStatus !== 'opted-in')
    return false
  const currentPhone = normalizeMexicanPhone(athlete.profile.phone)
  const consentedPhone = normalizeMexicanPhone(consent.consentedPhoneE164)

  return currentPhone !== null && currentPhone === consentedPhone
}

function normalizeMexicanPhone(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10)
    return `52${digits}`
  if (digits.length === 12 && digits.startsWith('52'))
    return digits

  return null
}

function getLocalDateTime(now: number, timezone: string): LocalDateTime {
  if (!Number.isFinite(now))
    throw new Error('Invalid reminder timestamp')

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now))

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const year = Number(values.year)
  const month = Number(values.month)
  const day = Number(values.day)
  const hour = Number(values.hour)
  const minute = Number(values.minute)
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  return {
    date,
    period: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    day,
    hour,
    minute,
    weekday: isoWeekday(year, month, day),
  }
}

function differenceInDays(left: string, right: string): number {
  return (parseDate(left) - parseDate(right)) / 86_400_000
}

function parseDate(value: string): number {
  const [year, month, day] = value.split('-').map(Number)

  return Date.UTC(year, month - 1, day)
}

function isoWeekday(year: number, month: number, day: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

  return weekday === 0 ? 7 : weekday
}

function parsePeriod(period: string): { year: number; month: number } {
  if (!isValidPeriod(period))
    throw new Error('Invalid reminder period')
  const [year, month] = period.split('-').map(Number)

  return { year, month }
}

function isValidPeriod(value: string): boolean {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value))
    return false
  const [year, month] = value.split('-').map(Number)

  return year >= 1970 && year <= 9999 && month >= 1 && month <= 12
}

function isValidTimezone(timezone: string): boolean {
  if (!timezone.trim())
    return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()

    return true
  } catch {
    return false
  }
}

function isIntegerInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum
}

function isIntegerAtLeast(value: number, minimum: number): boolean {
  return Number.isInteger(value) && value >= minimum
}

function readEnvInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '')
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed))
    throw new Error('Invalid reminder environment integer')

  return parsed
}

function readEnvWeekdays(value: string | undefined): number[] {
  if (value === undefined || value.trim() === '')
    return [...DEFAULT_REMINDER_CONFIGURATION.storeWeekdays]

  return value.split(',').map(day => Number(day.trim()))
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function parseAthletes(value: unknown): ReminderAthlete[] {
  if (!isRecord(value))
    return []

  return Object.entries(value).flatMap(([id, raw]) => {
    if (!isRecord(raw) || raw.status !== 'active' || !isRecord(raw.profile) || !isRecord(raw.membership))
      return []
    const phone = raw.profile.phone
    const paymentDay = finiteNumber(raw.membership.paymentDay)
    const agreedAmount = finiteNumber(raw.membership.agreedAmount)
    if (typeof phone !== 'string' || paymentDay === null || agreedAmount === null || !Number.isInteger(paymentDay))
      return []

    return [{
      id,
      status: 'active' as const,
      profile: { phone },
      membership: { paymentDay, agreedAmount },
    }]
  })
}

function parsePayments(value: unknown): Record<string, Record<string, ReminderPayment>> {
  if (!isRecord(value))
    return {}
  const payments: Record<string, Record<string, ReminderPayment>> = {}
  for (const [athleteId, rawPeriods] of Object.entries(value)) {
    if (!isRecord(rawPeriods))
      continue
    const periods: Record<string, ReminderPayment> = {}
    for (const [period, rawPayment] of Object.entries(rawPeriods)) {
      if (isValidPeriod(period) && isRecord(rawPayment))
        periods[period] = rawPayment as ReminderPayment
    }
    payments[athleteId] = periods
  }

  return payments
}

function parseSales(value: unknown): ReminderSale[] {
  if (!isRecord(value))
    return []

  return Object.entries(value).flatMap(([id, raw]) => {
    if (!isRecord(raw) || typeof raw.status !== 'string' || finiteNumber(raw.total) === null)
      return []

    const payments = isRecord(raw.payments)
      ? Object.fromEntries(Object.entries(raw.payments).flatMap(([paymentId, rawPayment]) => (
        isRecord(rawPayment) ? [[paymentId, { amountApplied: rawPayment.amountApplied as number | string }]] : []
      )))
      : undefined


    return [{
      id,
      athleteId: typeof raw.athleteId === 'string' ? raw.athleteId : null,
      status: raw.status,
      total: raw.total as number | string,
      ...(payments ? { payments } : {}),
    }]
  })
}

function parseConsents(value: unknown): Record<string, ReminderConsent> {
  if (!isRecord(value))
    return {}

  return Object.entries(value).reduce<Record<string, ReminderConsent>>((result, [athleteId, raw]) => {
    if (!isRecord(raw)
      || (raw.reminderStatus !== 'unknown' && raw.reminderStatus !== 'opted-in' && raw.reminderStatus !== 'opted-out')) {
      return result
    }
    result[athleteId] = {
      athleteId,
      reminderStatus: raw.reminderStatus,
      consentedPhoneE164: typeof raw.consentedPhoneE164 === 'string' ? raw.consentedPhoneE164 : null,
    }

    return result
  }, {})
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
