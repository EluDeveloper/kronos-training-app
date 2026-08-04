import type { StoreCreditAccount } from '@/types/domain'
import { subscribeValue, type ErrorHandler } from './realtime.service'

type StoreCreditTree = Record<string, Omit<StoreCreditAccount, 'athleteId'>>

export const storeCreditsService = {
  subscribe(onChange: (items: StoreCreditAccount[]) => void, onError: ErrorHandler) {
    return subscribeValue<StoreCreditTree>('storeCredits', tree => {
      onChange(Object.entries(tree ?? {}).map(([athleteId, account]) => ({
        ...account,
        athleteId,
        entries: account.entries ?? {},
      })))
    }, onError)
  },
}
