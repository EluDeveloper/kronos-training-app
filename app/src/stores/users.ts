import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { usersService, type ManagedUserInput } from '@/services/users.service'
import type { AppUser } from '@/types/access'

export const useUsersStore = defineStore('users', () => {
  const items = ref<AppUser[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null

  function subscribe() {
    if (stop)
      return

    loading.value = true
    error.value = null
    stop = usersService.subscribeAll(value => {
      items.value = value.sort((left, right) => left.displayName.localeCompare(right.displayName, 'es'))
      loading.value = false
    }, subscriptionError => {
      error.value = subscriptionError.message
      loading.value = false
    })
  }

  const create = (input: ManagedUserInput, password: string, createdBy: string) => usersService.create(input, password, createdBy)
  const update = (uid: string, input: Pick<ManagedUserInput, 'displayName' | 'role' | 'enabled' | 'permissions'>) => usersService.update(uid, input)

  function dispose() {
    stop?.()
    stop = null
  }

  return { items, loading, error, subscribe, create, update, dispose }
})
