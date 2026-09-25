import { defineStore } from 'pinia'
import type { Unsubscribe } from 'firebase/database'
import { birthdayGreetingsService } from '@/services/birthday-greetings.service'
import type { BirthdayGreeting } from '@/types/domain'

export const useBirthdayGreetingsStore = defineStore('birthday-greetings', () => {
  const items = ref<BirthdayGreeting[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let stop: Unsubscribe | null = null
  function subscribe() {
    if (stop) return
    loading.value = true
    stop = birthdayGreetingsService.subscribe(value => { items.value = value; loading.value = false }, cause => { error.value = cause.message; loading.value = false })
  }
  const dispose = () => { stop?.(); stop = null }

  return { items, loading, error, subscribe, dispose, setStatus: birthdayGreetingsService.setStatus, recordCardAction: birthdayGreetingsService.recordCardAction }
})
