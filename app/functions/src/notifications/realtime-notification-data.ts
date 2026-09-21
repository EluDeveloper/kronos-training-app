import type { NotificationJob } from './jobs.js'
import type { NotificationDataSource, NotificationEligibility } from './worker.js'
import { getNotificationDatabase } from './realtime-job-store.js'
import { buildCanonicalNotificationDocument } from './financial-documents.js'
import { readReminderConfigurationFromEnv } from './reminders.js'

export class RealtimeNotificationDataSource implements NotificationDataSource {
  async readEligibility(job: NotificationJob): Promise<NotificationEligibility> {
    const athleteId = checkedAthleteId(job.athleteId)
    const database = getNotificationDatabase()

    const [status, phone, preference] = await Promise.all([
      database.ref(`v1/athletes/${athleteId}/status`).get(),
      database.ref(`v1/athletes/${athleteId}/profile/phone`).get(),
      database.ref(`v1/notificationPreferences/${athleteId}`).get(),
    ])

    if (status.val() !== 'active')
      return { eligible: false, reason: 'athlete-inactive' }
    const consent = preference.val()
    if (!consent || typeof consent !== 'object')
      return { eligible: false, reason: 'no-consent' }
    if (consent.athleteId !== athleteId)
      return { eligible: false, reason: 'consent-mismatch' }
    const purpose = job.type === 'payment-receipt' ? consent.receiptStatus : consent.reminderStatus
    if (purpose !== 'opted-in')
      return { eligible: false, reason: purpose === 'opted-out' ? 'opted-out' : 'no-consent' }
    const currentPhone = normalizePhone(phone.val())
    if (!currentPhone)
      return { eligible: false, reason: 'invalid-phone' }
    if (currentPhone !== normalizePhone(consent.consentedPhoneE164))
      return { eligible: false, reason: 'phone-changed' }

    return { eligible: true, recipient: currentPhone }
  }

  async readDocument(job: NotificationJob, now: number) {
    const athleteId = checkedAthleteId(job.athleteId)
    const database = getNotificationDatabase()

    const [name, membership, payments, sales] = await Promise.all([
      database.ref(`v1/athletes/${athleteId}/profile/name`).get(),
      database.ref(`v1/athletes/${athleteId}/membership`).get(),
      database.ref(`v1/payments/${athleteId}`).get(),
      database.ref('v1/sales').orderByChild('athleteId').equalTo(athleteId).limitToFirst(501).get(),
    ])

    if (sales.numChildren() > 500)
      throw new Error('Financial snapshot requires pagination')
    const membershipData = membership.val()
    if (typeof name.val() !== 'string' || !membershipData
      || typeof membershipData.agreedAmount !== 'number' || typeof membershipData.paymentDay !== 'number')
      return null

    return buildCanonicalNotificationDocument(job, {
      name: name.val(),
      membership: { agreedAmount: membershipData.agreedAmount, paymentDay: membershipData.paymentDay },
      payments: payments.val(), sales: sales.val(),
    }, now, readReminderConfigurationFromEnv())
  }
}

function checkedAthleteId(value: string): string {
  if (!/^[\w-]{1,128}$/.test(value))
    throw new Error('Invalid notification athlete id')

  return value
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\+?[\d\s().-]+$/.test(value))
    return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10)
    return `+52${digits}`

  return digits.length === 12 && digits.startsWith('52') ? `+${digits}` : null
}
