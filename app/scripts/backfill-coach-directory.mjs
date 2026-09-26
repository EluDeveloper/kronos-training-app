import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url))
const project = 'kronos-training-fd5e5'

const sameEntry = (actual, expected) => actual?.id === expected.id && actual?.name === expected.name
  && actual?.status === expected.status && Object.keys(actual).length === 3

export function planCoachDirectoryBackfill(employees, directory) {
  const additions = {}
  let matched = 0

  for (const [id, employee] of Object.entries(employees ?? {})) {
    if (employee?.kind !== 'coach')
      continue
    if (!/^[\w-]+$/.test(id) || employee.id !== id || typeof employee.name !== 'string'
      || !employee.name.trim() || !['active', 'inactive'].includes(employee.status))
      throw new Error('Una ficha Coach no cumple el contrato del directorio.')

    const entry = { id, name: employee.name.trim(), status: employee.status }
    const existing = directory?.[id]
    if (existing) {
      if (!sameEntry(existing, entry))
        throw new Error('Existe una entrada de directorio distinta; se detuvo la carga.')
      matched++
    }
    else {
      additions[id] = entry
    }
  }

  return { additions, matched, total: matched + Object.keys(additions).length }
}

function firebase(command, path, data) {
  const args = [cli, `database:${command}`, path, '--project', project]
  if (data !== undefined)
    args.push('--data', JSON.stringify(data), '--force')
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  if (result.status !== 0)
    throw new Error(`Firebase ${command} falló; se omitió su salida para proteger datos.`)

  return result.stdout.trim()
}

function read(path) {
  return JSON.parse(firebase('get', path) || 'null')
}

function run() {
  const apply = process.argv.includes('--apply')
  if (!apply && !process.argv.includes('--dry-run'))
    throw new Error('Usa --dry-run para revisar conteos o --apply para ejecutar la carga autorizada.')

  const employees = read('/v1/employees')
  const directory = read('/v1/coachDirectory')
  const plan = planCoachDirectoryBackfill(employees, directory)
  if (!apply) {
    process.stdout.write(`Vista previa: ${plan.total} coaches; ${Object.keys(plan.additions).length} por crear; ${plan.matched} ya existentes.\n`)

    return
  }
  const created = []
  try {
    for (const [id, entry] of Object.entries(plan.additions)) {
      const existing = read(`/v1/coachDirectory/${id}`)
      if (existing !== null)
        throw new Error('El directorio cambió durante la carga; se detuvo.')
      firebase('update', `/v1/coachDirectory/${id}`, entry)
      created.push(id)
    }

    const verified = read('/v1/coachDirectory')
    const finalPlan = planCoachDirectoryBackfill(employees, verified)
    if (Object.keys(finalPlan.additions).length !== 0 || finalPlan.total !== plan.total)
      throw new Error('El conteo final no coincide.')
    process.stdout.write(`Carga verificada: ${plan.total} coaches; ${created.length} entradas creadas; ${plan.matched} ya existentes.\n`)
  }
  catch (error) {
    let reverted = 0
    for (const id of created) {
      try {
        if (sameEntry(read(`/v1/coachDirectory/${id}`), plan.additions[id])) {
          firebase('set', `/v1/coachDirectory/${id}`, null)
          reverted++
        }
      }
      catch { /* No modificar entradas que ya cambiaron o no pueden verificarse. */ }
    }
    throw new Error(`Carga interrumpida. Entradas creadas: ${created.length}; revertidas: ${reverted}. ${error.message}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    run()
  }
  catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
