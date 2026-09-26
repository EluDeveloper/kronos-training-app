import type { ISODate } from '@/types/domain'

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function businessDateInMexicoCity(date = new Date()): ISODate {
  return formatter.format(date)
}
