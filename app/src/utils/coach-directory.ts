import type { CoachDirectoryEntry, Employee } from '@/types/workforce'

export function coachDirectoryEntry(employee: Pick<Employee, 'id' | 'name' | 'kind' | 'status'>): CoachDirectoryEntry | null {
  return employee.kind === 'coach'
    ? { id: employee.id, name: employee.name.trim(), status: employee.status }
    : null
}
