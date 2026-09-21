/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isLocalNotificationWorkerEnabled,
  onNotificationJobCreated,
} from '../src/notifications/local-worker.ts'

test('local worker requires explicit fake mode, the demo project and a loopback emulator', () => {
  const environment = {
    KRONOS_NOTIFICATION_WORKER_MODE: 'fake', GCLOUD_PROJECT: 'demo-kronos-training',
    FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000',
  }

  assert.equal(isLocalNotificationWorkerEnabled(environment), true)
  assert.equal(isLocalNotificationWorkerEnabled({
    ...environment,
    FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:1',
  }), true)
  assert.equal(isLocalNotificationWorkerEnabled({}), false)
  for (const overrides of [
    { KRONOS_NOTIFICATION_WORKER_MODE: 'real' },
    { KRONOS_NOTIFICATION_WORKER_MODE: '' },
    { GCLOUD_PROJECT: 'kronos-training-fd5e5' },
    { FIREBASE_DATABASE_EMULATOR_HOST: 'example.com:9000' },
    { FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1.example.com:9000' },
    { FIREBASE_DATABASE_EMULATOR_HOST: '' },
  ])
    assert.equal(isLocalNotificationWorkerEnabled({ ...environment, ...overrides }), false)
})

test('job trigger binds only the access-token secret and keeps one RTDB create event', () => {
  const endpoint = (onNotificationJobCreated as unknown as {
    __endpoint: {
      secretEnvironmentVariables?: Array<{ key: string }>
      eventTrigger?: {
        eventType?: string
        eventFilterPathPatterns?: Record<string, string>
      }
    }
  }).__endpoint

  assert.deepEqual(endpoint.secretEnvironmentVariables?.map(secret => secret.key), [
    'WHATSAPP_ACCESS_TOKEN',
  ])
  assert.equal(endpoint.eventTrigger?.eventType, 'google.firebase.database.ref.v1.created')
  assert.equal(
    endpoint.eventTrigger?.eventFilterPathPatterns?.ref,
    'v1/notificationJobs/{jobId}',
  )
})
