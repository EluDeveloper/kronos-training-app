import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import type { MaintenanceCycle } from './local-status-maintenance.js'

interface CliDependencies {
  create?: () => (() => Promise<MaintenanceCycle>) | Promise<() => Promise<MaintenanceCycle>>
  registerStop?: (stop: () => void) => () => void
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
  write?: (line: string) => void
  close?: () => Promise<void>
}

export async function runStatusMaintenanceCli(args: string[], dependencies: CliDependencies = {}): Promise<number> {
  const write = dependencies.write ?? (line => { process.stdout.write(line + '\n') })
  const mode = args.find(arg => arg === '--once' || arg === '--watch')
  if (args.length !== 2 || !mode || !args.includes('--apply')) {
    write(JSON.stringify({ status: 'invalid-arguments', usage: 'status-maintenance-cli (--once|--watch) --apply' }))

    return 2
  }

  const controller = new AbortController()
  const wait = dependencies.wait ?? waitForNextCycle
  const close = dependencies.close ?? closeRuntime
  let unregister = () => {}
  let exitCode = 0

  const failed = () => {
    exitCode = 1
    write(JSON.stringify({ status: 'failed', code: 'maintenance-failed' }))
  }

  try {
    unregister = (dependencies.registerStop ?? registerStop)(() => controller.abort())


    // No runtime import or initialization before explicit argument opt-in.
    const create = dependencies.create ?? (async () => (await import('./local-status-maintenance.js')).createStatusMaintenance())
    const cycle = await create()
    while (!controller.signal.aborted) {
      write(JSON.stringify(await cycle()))
      if (mode === '--once' || controller.signal.aborted)
        break
      await wait(60000, controller.signal)
    }
  } catch {
    failed()
  } finally {
    unregister()
    try {
      await close()
    } catch {
      failed()
    }
  }
  if (exitCode === 0 && controller.signal.aborted)
    write(JSON.stringify({ status: 'stopped' }))

  return exitCode
}

async function waitForNextCycle(ms: number, signal: AbortSignal): Promise<void> {
  try {
    await delay(ms, undefined, { signal })
  } catch (error) {
    if (!signal.aborted)
      throw error
  }
}

function registerStop(stop: () => void): () => void {
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  return () => {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}

async function closeRuntime(): Promise<void> {
  const { getApps, deleteApp } = await import('firebase-admin/app')
  const app = getApps().find(candidate => candidate.name === 'kronos-notification-runtime')
  if (app)
    await deleteApp(app)
}

// Importing this module for tests or from another module never starts the CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runStatusMaintenanceCli(process.argv.slice(2)).then(code => { process.exitCode = code }).catch(() => {
    process.stderr.write('maintenance-failed\n')
    process.exitCode = 1
  })
}
