import type { Athlete, BirthdayGreeting } from '@/types/domain'

export interface BirthdayQueueEntry {
  id: string
  athlete: Athlete
  year: number
  occurrence: string
  days: number
  status: 'overdue' | 'today' | 'upcoming'
  greeting?: BirthdayGreeting
}

const dayNumber = (date: string) => Math.floor(new Date(`${date}T12:00:00`).getTime() / 86400000)
const greetingId = (athleteId: string, year: number) => `${athleteId}_${year}`

function occurrenceDate(birthDate: string, year: number) {
  const [, month, day] = birthDate.split('-').map(Number)
  const date = new Date(year, month! - 1, day, 12)
  if (month === 2 && day === 29 && date.getMonth() !== 1)
    date.setDate(0)

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function buildBirthdayQueue(athletes: Athlete[], greetings: BirthdayGreeting[], today: string, upcomingDays = 60): BirthdayQueueEntry[] {
  const year = Number(today.slice(0, 4))
  const byId = new Map(greetings.map(item => [item.id, item]))
  const queue: BirthdayQueueEntry[] = []

  athletes.filter(athlete => athlete.status !== 'inactive' && athlete.profile.birthDate).forEach(athlete => {
    const currentOccurrence = occurrenceDate(athlete.profile.birthDate!, year)
    const years = currentOccurrence > today ? [year - 1, year] : [year]
    for (const candidateYear of years) {
      const occurrence = occurrenceDate(athlete.profile.birthDate!, candidateYear)
      const days = dayNumber(occurrence) - dayNumber(today)
      const id = greetingId(athlete.id, candidateYear)
      const greeting = byId.get(id)
      if (greeting?.status === 'greeted')
        continue
      if (candidateYear === year - 1 && days < -upcomingDays)
        continue
      if (days > upcomingDays)
        continue
      queue.push({ id, athlete, year: candidateYear, occurrence, days, status: days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming', greeting })
    }
  })

  return queue.sort((left, right) => {
    const rank = { overdue: 0, today: 1, upcoming: 2 }

    return rank[left.status] - rank[right.status] || left.days - right.days || left.athlete.profile.name.localeCompare(right.athlete.profile.name, 'es')
  })
}

export const safeBirthdayFilename = (name: string) => `feliz-cumpleanos-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'atleta'}.png`
