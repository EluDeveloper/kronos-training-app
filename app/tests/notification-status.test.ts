import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNotificationStatusController, parseNotificationStatuses, notificationStatusLabels, type NotificationPanelState } from '../src/utils/notification-status'

const id = `job-${'a'.repeat(32)}`
const row = { type: 'payment-receipt', status: 'accepted', updatedAt: 20 }

test('status parser is closed, bounded, validates optional values and sorts newest first', () => {
  assert.deepEqual(parseNotificationStatuses(null), [])
  assert.equal(parseNotificationStatuses({ [id]: row })[0].status, 'accepted')
  for (const data of [[],
    true,
    { invalid: row },
    { [id]: { ...row, phone: 'private' } },
    { [id]: { ...row, updatedAt: NaN } },
    { [id]: { ...row, status: 'toString' } },
    { [id]: { ...row, period: '2026-13' } },
    { [id]: { ...row, folio: 'private' } },
    Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`job-${String(i).padStart(32, '0')}`, row]))])
    assert.throws(() => parseNotificationStatuses(data))
  assert.equal(parseNotificationStatuses({ [id]: row, [`job-${'b'.repeat(32)}`]: { ...row, updatedAt: 30 } })[0].updatedAt, 30)
  assert.equal(notificationStatusLabels.accepted, 'Aceptado')
  assert.equal(notificationStatusLabels.unknown, 'Por confirmar')
})

test('changing athlete, closing and permission revocation clear stale rows and callbacks', () => {
  const states: NotificationPanelState[] = []
  const subscriptions: { data: (value: unknown) => void; error: (value: unknown) => void; stopped: boolean }[] = []

  const controller = createNotificationStatusController((_athleteId, data, error) => {
    const subscription = { data, error, stopped: false }

    subscriptions.push(subscription)

    return () => { subscription.stopped = true }
  }, state => states.push(state))

  controller.select(true, 'athlete-a', true)
  assert.equal(states.at(-1)?.phase, 'loading')
  subscriptions[0].data({ [id]: row })
  assert.equal(states.at(-1)?.phase, 'ready')
  controller.select(true, 'athlete-b', true)
  assert.equal(subscriptions[0].stopped, true)
  subscriptions[0].data({ [id]: row })
  subscriptions[0].error(new Error('old'))
  assert.deepEqual(states.at(-1), { phase: 'loading', items: [] })
  subscriptions[1].data(null)
  assert.equal(states.at(-1)?.phase, 'empty')
  controller.select(true, 'athlete-b', false)
  assert.deepEqual(states.at(-1), { phase: 'forbidden', items: [] })
  assert.equal(subscriptions[1].stopped, true)
  controller.select(false, 'athlete-b', true)
  assert.deepEqual(states.at(-1), { phase: 'idle', items: [] })
  controller.dispose()
})

test('invalid payload and errors fail closed; later callbacks cannot repopulate rows', () => {
  let latest: NotificationPanelState
  let data!: (value: unknown) => void
  let error!: (value: unknown) => void
  let stopped = false

  const controller = createNotificationStatusController((_id, onData, onError) => {
    data = onData
    error = onError

    return () => { stopped = true }
  }, value => { latest = value })

  controller.select(true, 'qa', true)
  data({ [id]: { ...row, phone: 'secret' } })
  assert.deepEqual(latest!, { phase: 'error', items: [] })
  assert.equal(stopped, true)
  data({ [id]: row })
  assert.equal(latest!.phase, 'error')
  controller.select(true, 'qa', true)
  error({ code: 'PERMISSION_DENIED', message: 'internal private error' })
  assert.deepEqual(latest!, { phase: 'forbidden', items: [] })
})

test('invalid athlete IDs never create subscriptions and sync subscription errors are contained', () => {
  let count = 0
  let latest: NotificationPanelState

  const controller = createNotificationStatusController(() => {
    count++
    throw new Error('private')
  }, value => { latest = value })

  controller.select(true, '../qa', true)
  assert.equal(count, 0)
  assert.equal(latest!.phase, 'error')
  controller.select(true, 'qa', true)
  assert.equal(latest!.phase, 'error')
})

test('an array type fails closed and cannot be rendered as a different notification kind', () => {
  let latest: NotificationPanelState
  let stopped = false

  const controller = createNotificationStatusController((_id, data) => {
    data({ [id]: { ...row, type: ['payment-receipt'] } })

    return () => { stopped = true }
  }, value => { latest = value })

  controller.select(true, 'qa', true)
  assert.deepEqual(latest!, { phase: 'error', items: [] })
  assert.equal(stopped, true)
})
