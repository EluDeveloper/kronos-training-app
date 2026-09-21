import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryNotificationJobStore } from '../src/notifications/jobs.ts'
import { processMembershipPaymentWrite, processSaleWrite } from '../src/notifications/triggers.ts'

test('membership write creates one queued receipt job for a newly applied installment', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const results = await processMembershipPaymentWrite({
    athleteId: 'athlete-1',
    period: '2026-09',
    before: { installments: { first: { status: 'pending' } } },
    after: { installments: { first: { status: 'paid', amountApplied: 500 } } },
  }, jobs, 100)

  assert.equal(results.length, 1)
  assert.equal(results[0]?.created, true)
  assert.equal(results[0]?.job.status, 'queued')
  assert.equal(results[0]?.job.idempotencyKey, 'membership:athlete-1:2026-09:first')
})

test('sale write is idempotent when the same paid transition is delivered twice', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const input = {
    saleId: 'sale-1',
    before: null,
    after: { status: 'paid', athleteId: 'athlete-1', total: 800 },
  }

  const first = await processSaleWrite(input, jobs, 100)
  const second = await processSaleWrite(input, jobs, 101)

  assert.equal(first[0]?.created, true)
  assert.equal(second[0]?.created, false)
  assert.equal((await jobs.getByIdempotencyKey('sale-initial:sale-1'))?.createdAt, 100)
})

test('membership and combined source triggers reuse one notification job', async () => {
  const jobs = new InMemoryNotificationJobStore()
  const membership = await processMembershipPaymentWrite({
    athleteId: 'athlete-1',
    period: '2026-09',
    before: { installments: { first: { status: 'pending' } } },
    after: { installments: { first: { status: 'paid', amountApplied: 500 } } },
  }, jobs, 100)
  const combined = await processSaleWrite({
    saleId: 'sale-1',
    before: { status: 'credit', payments: {} },
    after: {
      athleteId: 'athlete-1',
      status: 'paid',
      payments: {
        payment: {
          amountApplied: 200,
          membershipPeriod: '2026-09',
          membershipInstallmentId: 'first',
        },
      },
    },
  }, jobs, 101)

  assert.equal(membership.length, 1)
  assert.equal(membership[0]?.created, true)
  assert.equal(combined.length, 1)
  assert.equal(combined[0]?.created, false)
  assert.equal((await jobs.getByIdempotencyKey('combined:athlete-1:2026-09:first'))?.jobId, membership[0]?.job.jobId)
})
