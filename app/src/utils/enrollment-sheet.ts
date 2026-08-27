import type { Athlete, EmergencyContact, ISODate, ISOTimestamp } from '@/types/domain'

export interface EnrollmentEmergencyContact {
  name: string | null
  phone: string | null
  relationship: string | null
}

export interface EnrollmentSheetData {
  kind: 'enrollment'
  folio: string
  issuedAt: ISOTimestamp
  athleteName: string
  birthDate: ISODate | null
  registrationDate: ISODate | null
  paymentDay: number | null
  emergencyContact: EnrollmentEmergencyContact | null
}

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

const validISODate = (value?: ISODate | null): value is ISODate => {
  const match = value?.match(isoDatePattern)
  if (!match)
    return false

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const candidate = new Date(Date.UTC(year, month - 1, day))

  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
}

const normalizedPaymentDay = (value: number) => Number.isInteger(value) && value >= 1 && value <= 31
  ? value
  : null

const normalizedText = (value?: string | null) => value?.trim() || null

const folioSuffix = (value: string) => value
  .replace(/[^a-z0-9]/gi, '')
  .slice(-8)
  .toUpperCase()
  .padStart(8, '0')

const enrollmentFolio = (athlete: Athlete) => {
  const registrationKey = validISODate(athlete.membership.registrationDate)
    ? athlete.membership.registrationDate.replaceAll('-', '')
    : '00000000'

  return `INS-${registrationKey}-${folioSuffix(athlete.id)}`
}

export const formatEnrollmentDate = (value?: ISODate | null) => {
  if (!validISODate(value))
    return 'Sin capturar'

  const [, year, month, day] = value.match(isoDatePattern)!

  return `${day}/${month}/${year}`
}

export const paymentScheduleText = (paymentDay?: number | null) => {
  const day = normalizedPaymentDay(Number(paymentDay))

  return day ? `Tu fecha de pago será el ${day} de cada mes.` : 'Sin capturar'
}

export function buildEnrollmentSheet(athlete: Athlete, emergencyContact: EmergencyContact | null, issuedAt: ISOTimestamp = Date.now()): EnrollmentSheetData {
  return {
    kind: 'enrollment',
    folio: enrollmentFolio(athlete),
    issuedAt,
    athleteName: athlete.profile.name.trim() || 'Sin capturar',
    birthDate: validISODate(athlete.profile.birthDate) ? athlete.profile.birthDate : null,
    registrationDate: validISODate(athlete.membership.registrationDate) ? athlete.membership.registrationDate : null,
    paymentDay: normalizedPaymentDay(Number(athlete.membership.paymentDay)),
    emergencyContact: emergencyContact
      ? {
        name: normalizedText(emergencyContact.name),
        phone: normalizedText(emergencyContact.phone),
        relationship: normalizedText(emergencyContact.relationship),
      }
      : null,
  }
}

export const enrollmentSheetFilename = (sheet: EnrollmentSheetData) => `ficha-inscripcion-${sheet.folio.toLowerCase()}.pdf`
