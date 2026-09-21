/* eslint-disable import/extensions */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment
const users = ['qa-inbox-admin', 'qa-inbox-reader', 'qa-inbox-coach', 'qa-inbox-disabled']
const path = 'v1/notificationStatusInbox/' + 'a'.repeat(64) + '/' + 'b'.repeat(64)

before(async () => {
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:9010')
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-kronos-training')
  env = await initializeTestEnvironment({ projectId: 'demo-kronos-training', database: {
    host: '127.0.0.1', port: 9010, rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
  } })
  await env.withSecurityRulesDisabled(async context => {
    for (const [i, uid] of users.entries()) await context.database().ref('v1/users/' + uid).set({
      role: i === 0 || i === 3 ? 'admin' : i === 2 ? 'coach' : 'staff',
      enabled: i !== 3, permissions: i === 1 ? { payments: true } : {},
    })
    await context.database().ref(path).set({ processingStatus: 'pending' })
  })
})
after(async () => {
  if (!env) return
  await env.withSecurityRulesDisabled(async context => {
    for (const uid of users) await context.database().ref('v1/users/' + uid).remove()
    await context.database().ref(path).remove()
  })
  await env.cleanup()
})
test('inbox indexes are scoped and access remains private for every application role', async () => {
  const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8'))

  assert.deepEqual(rules.rules.v1.notificationStatusInbox.$scope['.indexOn'], ['messageKey', 'expiresAt'])
  for (const context of [...users.map(uid => env.authenticatedContext(uid)), env.unauthenticatedContext()]) {
    const db = context.database()

    await assertFails(db.ref(path).get())
    await assertFails(db.ref('v1/notificationStatusInbox').get())
    await assertFails(db.ref(path).set({ processingStatus: 'completed' }))
    await assertFails(db.ref(path).remove())
    await assertFails(db.ref(path).parent!.orderByChild('messageKey').equalTo('a'.repeat(64)).get())
  }
})
