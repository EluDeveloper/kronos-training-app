export const notificationStatusLabels = {
  pending: 'Pendiente', accepted: 'Aceptado', sent: 'Enviado', delivered: 'Entregado',
  read: 'Leído', omitted: 'Omitido', error: 'Error de notificación', unknown: 'Por confirmar',
} as const

export interface NotificationStatusRow {
  jobId: string
  type: 'payment-receipt' | 'payment-reminder'
  status: keyof typeof notificationStatusLabels
  updatedAt: number
  folio?: string
  period?: string
}

export interface NotificationPanelState {
  phase: 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden'
  items: NotificationStatusRow[]
}

export type NotificationStatusSubscribe = (athleteId: string, onData: (value: unknown) => void, onError: (error: unknown) => void) => () => void

export function parseNotificationStatuses(value: unknown): NotificationStatusRow[] {
  if (value === null)
    return []
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 20)
    throw new Error('Invalid notification status data')

  return Object.entries(value).map(([jobId, data]) => {
    if (!/^job-[a-f\d]{32}$/.test(jobId) || !data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid notification status row')
    const row = data as Record<string, unknown>

    if (Object.keys(row).some(key => !['type', 'status', 'updatedAt', 'folio', 'period'].includes(key))
      || (row.type !== 'payment-receipt' && row.type !== 'payment-reminder')
      || typeof row.status !== 'string' || !Object.hasOwn(notificationStatusLabels, row.status)
      || typeof row.updatedAt !== 'number' || !Number.isSafeInteger(row.updatedAt) || row.updatedAt < 0 || row.updatedAt > 8.64e15
      || ('period' in row && (typeof row.period !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.period)))
      || ('folio' in row && row.folio !== `${row.type === 'payment-receipt' ? 'REC' : 'AVS'}-${jobId.slice(4).toUpperCase()}`))
      throw new Error('Invalid notification status fields')

    return { jobId, ...row } as NotificationStatusRow
  }).sort((a, b) => b.updatedAt - a.updatedAt || b.jobId.localeCompare(a.jobId))
}

// This owns subscription lifecycle independently of Vue and financial actions.
export function createNotificationStatusController(subscribe: NotificationStatusSubscribe, publish: (state: NotificationPanelState) => void) {
  let version = 0
  let stop: (() => void) | undefined

  const cancel = () => {
    version += 1
    stop?.()
    stop = undefined
  }

  return {
    select(open: boolean, athleteId: string, canRead: boolean) {
      cancel()
      if (!open || !canRead || !/^[\w-]{1,128}$/.test(athleteId)) {
        publish({ phase: !open ? 'idle' : !canRead ? 'forbidden' : 'error', items: [] })

        return
      }
      const current = version

      const fail = (error: unknown) => {
        if (version !== current)
          return
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code).toLowerCase() : ''

        cancel()
        publish({ phase: code.includes('permission_denied') || code.includes('permission-denied') ? 'forbidden' : 'error', items: [] })
      }

      publish({ phase: 'loading', items: [] })
      try {
        const unsubscribe = subscribe(athleteId, value => {
          if (version !== current)
            return
          try {
            const items = parseNotificationStatuses(value)

            publish({ phase: items.length ? 'ready' : 'empty', items })
          }
          catch (error) { fail(error) }
        }, fail)

        // A synchronous failure may invalidate this listener before it returns.
        if (version !== current)
          unsubscribe()
        else
          stop = unsubscribe
      }
      catch (error) { fail(error) }
    },
    dispose() {
      cancel()
      publish({ phase: 'idle', items: [] })
    },
  }
}
