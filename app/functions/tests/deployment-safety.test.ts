/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as functionsIndex from '../src/index.ts'

const deploymentFunctions = [
  functionsIndex.onMembershipPaymentWritten,
  functionsIndex.onSaleWritten,
  functionsIndex.onReminderScheduled,
  functionsIndex.whatsappWebhook,
  functionsIndex.onNotificationProviderStatusWritten,
  functionsIndex.onNotificationJobCreated,
  functionsIndex.onNotificationRecoveryScheduled,
  functionsIndex.onWhatsAppMaintenanceScheduled,
  functionsIndex.onNotificationJobStatusWritten,
]

test('Functions predeploy runs typecheck and build from the selected source directory', () => {
  const firebaseConfig = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8')) as {
    functions?: { predeploy?: string[] }
  }

  assert.deepEqual(firebaseConfig.functions?.predeploy, [
    'npm --prefix "$RESOURCE_DIR" run typecheck',
    'npm --prefix "$RESOURCE_DIR" run build',
  ])
})

test('every deployed notification function is pinned to the database region and canary limits', () => {
  for (const deployedFunction of deploymentFunctions) {
    const endpoint = (deployedFunction as unknown as {
      __endpoint: { region?: string[]; maxInstances?: number | null; concurrency?: number | null }
    }).__endpoint

    assert.deepEqual(endpoint.region, ['us-central1'])
    assert.equal(endpoint.maxInstances, 1)
    assert.equal(endpoint.concurrency, 1)
  }
})

test('the public fake-provider health endpoint is not exported', () => {
  assert.equal(Object.hasOwn(functionsIndex, 'whatsappProviderHealth'), false)
})
