import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const esbuildCommand = join(appDirectory, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild')

test('el generador de iconos funciona con la versión ESM de Iconify Tools', () => {
  const compiledScript = join(appDirectory, 'node_modules', `.kronos-iconify-build-${process.pid}.mjs`)

  try {
    const compileResult = spawnSync(esbuildCommand, [
      'src/plugins/iconify/build-icons.ts',
      '--platform=node',
      '--format=esm',
      '--packages=external',
      `--outfile=${compiledScript}`,
    ], { cwd: appDirectory, encoding: 'utf8', shell: process.platform === 'win32' })

    assert.equal(compileResult.status, 0, `${compileResult.error?.message ?? ''}\n${compileResult.stdout}\n${compileResult.stderr}`)

    const runResult = spawnSync(process.execPath, [compiledScript], { cwd: appDirectory, encoding: 'utf8' })

    assert.equal(runResult.status, 0, `${runResult.error?.message ?? ''}\n${runResult.stdout}\n${runResult.stderr}`)
    assert.equal(existsSync(join(appDirectory, 'node_modules', 'icons.css')), true)
  }
  finally {
    rmSync(compiledScript, { force: true })
    rmSync(join(appDirectory, 'node_modules', 'icons.css'), { force: true })
  }
})
