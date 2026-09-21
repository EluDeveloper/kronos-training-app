export type OptOutKeyword = 'BAJA' | 'STOP' | 'CANCELAR' | 'NO RECIBIR'

export interface OptOutPatch {
  receiptStatus: 'opted-out'
  reminderStatus: 'opted-out'
  optedOutAt: number
  optOutSource: 'webhook'
}

export function recognizeOptOutKeyword(input: unknown): OptOutKeyword | null {
  // eslint-disable-next-line regexp/use-ignore-case -- Keep the ASCII-only allowlist explicit at this input boundary.
  if (typeof input !== 'string' || input.length > 128 || !/^[A-Za-z ]+$/.test(input))
    return null

  // Validate ASCII before trim/case conversion so Unicode lookalikes stay rejected.
  const keyword = input.trim().replace(/ +/g, ' ').toUpperCase()

  return keyword === 'BAJA' || keyword === 'STOP' || keyword === 'CANCELAR' || keyword === 'NO RECIBIR'
    ? keyword
    : null
}

// Pure proposal only: callers still need verified sender identity and durable deduplication.
export function buildOptOutPatch(input: unknown, receivedAt: unknown): OptOutPatch | null {
  if (!recognizeOptOutKeyword(input) || typeof receivedAt !== 'number'
    || !Number.isSafeInteger(receivedAt) || receivedAt < 0)
    return null

  return {
    receiptStatus: 'opted-out',
    reminderStatus: 'opted-out',
    optedOutAt: receivedAt,
    optOutSource: 'webhook',
  }
}
