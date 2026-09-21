/* eslint-disable import/extensions -- Node tests import TypeScript sources directly. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { getLocalStatusInboxConfig } from '../src/whatsapp/local-status-inbox-config.ts'
import { runLocalStatusInboxBatch, syncLocalStatusInbox } from '../src/whatsapp/local-status-inbox.ts'

const enabled = {
  GCLOUD_PROJECT: 'demo-kronos-training', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9010',
  KRONOS_NOTIFICATION_WORKER_MODE: 'fake', KRONOS_WHATSAPP_STATUS_INBOX_MODE: 'local',
  KRONOS_WHATSAPP_QA_ACCOUNT_ID: 'qa-business', KRONOS_WHATSAPP_QA_NUMBER_ID: 'qa-number',
}

test('inbox guard is independent of opt-out and rejects non-local/non-QA configurations', () => {
  assert.deepEqual(getLocalStatusInboxConfig(enabled), { accountId: 'qa-business', phoneNumberId: 'qa-number' })
  for (const override of [
    { GCLOUD_PROJECT: 'kronos-training-fd5e5' },
    { KRONOS_NOTIFICATION_WORKER_MODE: 'real' },
    { KRONOS_WHATSAPP_STATUS_INBOX_MODE: '' },
    { FIREBASE_DATABASE_EMULATOR_HOST: 'example.org:9010' },
    { FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:0' },
    { FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:65536' },
    { KRONOS_WHATSAPP_QA_ACCOUNT_ID: 'real' },
    { KRONOS_WHATSAPP_QA_NUMBER_ID: '123' },
  ]) assert.equal(getLocalStatusInboxConfig({ ...enabled, ...override }), null)
})

test('disabled local inbox consumers return without initializing database or inspecting the job', async () => {
  const previous = process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE

  process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = ''
  try {
    assert.equal((await runLocalStatusInboxBatch()).status, 'disabled')
    assert.equal((await syncLocalStatusInbox('not-a-job')).status, 'disabled')
  } finally {
    if (previous === undefined) delete process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE
    else process.env.KRONOS_WHATSAPP_STATUS_INBOX_MODE = previous
  }
})
