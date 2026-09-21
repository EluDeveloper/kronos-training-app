/* eslint-disable import/extensions -- Node tests import TypeScript sources. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { runStatusMaintenanceCli } from '../src/whatsapp/status-maintenance-cli.ts'

const cycle = { status: 'completed' as const, visited: 25, pending: 1, deleted: 50, durationMs: 2, hasMorePages: true }

test('CLI rejects missing apply, duplicate modes and unknown input without opening runtime', async () => {
  for (const args of [[],
    ['--once'],
    ['--apply'],
    ['--once', '--watch', '--apply'],
    ['--once', '--once', '--apply'],
    ['--once', '--apply', 'private-value'],
    ['--apply', '--apply']]) {
    let opened = 0
    const output: string[] = []

    const code = await runStatusMaintenanceCli(args, { create: () => { opened++

      return async () => cycle },
    write: line => output.push(line), close: async () => { opened++ } })

    assert.equal(code, 2)
    assert.equal(opened, 0)
    assert.equal(output.join('').includes('private-value'), false)
  }
})

test('once runs exactly one cycle, removes signal handlers and closes after completion', async () => {
  const events: string[] = []
  const output: string[] = []

  const code = await runStatusMaintenanceCli(['--apply', '--once'], {
    create: () => async () => { events.push('cycle')

      return cycle },
    registerStop: () => () => { events.push('unregister') },
    close: async () => { events.push('close') }, write: line => output.push(line),
    wait: async () => { throw new Error('once must not wait') },
  })

  assert.equal(code, 0)
  assert.deepEqual(events, ['cycle', 'unregister', 'close'])
  assert.deepEqual(JSON.parse(output[0]!), cycle)
})

test('watch waits sixty seconds after each completed cycle and stops without starting another', async () => {
  let stop = () => {}
  let running = false
  let cycles = 0
  let waits = 0

  const code = await runStatusMaintenanceCli(['--watch', '--apply'], {
    create: () => async () => {
      assert.equal(running, false)
      running = true
      await Promise.resolve()
      cycles++
      running = false

      return cycle
    }, registerStop: listener => { stop = listener

      return () => {} },
    wait: async (ms, signal) => {
      assert.equal(ms, 60000)
      assert.equal(running, false)
      assert.equal(signal.aborted, false)
      if (++waits === 2) stop()
    }, close: async () => {}, write: () => {},
  })

  assert.equal(code, 0)
  assert.equal(cycles, 2)
})

test('stop during an active cycle waits for it before closing the database', async () => {
  let stop = () => {}
  let release = () => {}
  let started = () => {}
  const ready = new Promise<void>(resolve => { started = resolve })
  const pending = new Promise<void>(resolve => { release = resolve })
  let finished = false
  let closed = false

  const run = runStatusMaintenanceCli(['--watch', '--apply'], {
    create: () => async () => { started(); await pending; finished = true

      return cycle },
    registerStop: listener => { stop = listener

      return () => {} },
    close: async () => { assert.equal(finished, true); closed = true }, write: () => {},
    wait: async () => { throw new Error('must not wait after stopping') },
  })

  await ready
  stop()
  assert.equal(closed, false)
  release()
  assert.equal(await run, 0)
  assert.equal(closed, true)
})

test('runtime and wait errors are sanitized and stop watch with nonzero status', async () => {
  for (const failure of ['create', 'cycle', 'wait']) {
    const output: string[] = []
    const fail = () => { throw new Error('private-phone-and-stack') }

    const code = await runStatusMaintenanceCli(['--watch', '--apply'], {
      create: () => {
        if (failure === 'create') fail()

        return async () => { if (failure === 'cycle') fail()

          return cycle }
      }, registerStop: () => () => {}, write: line => output.push(line),
      wait: async () => { if (failure === 'wait') fail() },
      close: async () => {},
    })

    assert.equal(code, 1)
    assert.equal(output.join('').includes('private-phone'), false)
    assert.ok(output.some(line => JSON.parse(line).status === 'failed'))
  }
})

test('close failure alone changes a successful once run to sanitized failure', async () => {
  const output: string[] = []

  const code = await runStatusMaintenanceCli(['--once', '--apply'], {
    create: () => async () => cycle, registerStop: () => () => {}, write: line => output.push(line),
    close: async () => { throw new Error('private closing failure') },
  })

  assert.equal(code, 1)
  assert.deepEqual(output.map(line => JSON.parse(line)), [cycle, { status: 'failed', code: 'maintenance-failed' }])
})

test('stop cancels the actual timer without reporting AbortError or starting another cycle', async () => {
  let stop = () => {}
  let cycles = 0
  const output: string[] = []

  const code = await runStatusMaintenanceCli(['--watch', '--apply'], {
    create: () => async () => { cycles++

      return cycle },
    registerStop: listener => { stop = listener

      return () => {} }, close: async () => {},
    write: line => {
      output.push(line)
      if (JSON.parse(line).status === 'completed') setImmediate(() => stop())
    },
  })

  assert.equal(code, 0)
  assert.equal(cycles, 1)
  assert.deepEqual(JSON.parse(output.at(-1)!), { status: 'stopped' })
})
