import type { ISODate } from '@/types/domain'
import type { Employee } from '@/types/workforce'
import { businessDateInMexicoCity } from '@/utils/business-date'

export interface EmployeeBirthdayQueueEntry { id: string; employee: Employee; occurrence: ISODate; days: number; status: 'overdue' | 'today' | 'upcoming' }

const validDate = (value: string) => {
  if (!/^\d{4}-(?:0[1-9]|1[012])-(?:0[1-9]|[12]\d|3[01])$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateEmployeeBirthDate(value: string, today = businessDateInMexicoCity()) {
  if (!validDate(value)) throw new Error('La fecha de nacimiento no es válida.')
  if (value > today) throw new Error('La fecha de nacimiento no puede ser futura.')
}

function occurrenceDate(birthDate: string, year: number): ISODate {
  const [, month, day] = birthDate.split('-').map(Number)
  if (month === 2 && day === 29 && new Date(year, 1, 29).getMonth() !== 1) return `${year}-02-28`

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function buildEmployeeBirthdayQueue(employees: Employee[], today: ISODate, upcomingDays = 60): EmployeeBirthdayQueueEntry[] {
  const start = new Date(`${today}T12:00:00`)
  const year = start.getFullYear()
  const result: EmployeeBirthdayQueueEntry[] = []

  employees.filter(employee => employee.status === 'active' && employee.birthDate && validDate(employee.birthDate)).forEach(employee => {
    for (const candidateYear of [year, year + 1]) {
      const occurrence = occurrenceDate(employee.birthDate!, candidateYear)
      const days = Math.round((new Date(`${occurrence}T12:00:00`).getTime() - start.getTime()) / 86_400_000)
      if ((candidateYear === year && days < 0) || (days >= 0 && days <= upcomingDays)) {
        result.push({ id: `${employee.id}-${candidateYear}`, employee, occurrence, days, status: days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming' })
        break
      }
    }
  })

  return result.sort((left, right) => left.days - right.days || left.employee.name.localeCompare(right.employee.name, 'es'))
}
