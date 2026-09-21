import { onValueWritten } from 'firebase-functions/v2/database'
import { isLocalNotificationWorkerEnabled } from './local-worker.js'
import { getNotificationDatabase } from './realtime-job-store.js'
import { mergeNotificationStatus, syncNotificationStatus } from './status-projection.js'

export async function syncLocalNotificationStatus(jobId: string) {
  // No database or provider initialization until the local demo/fake guard passes.
  if (!isLocalNotificationWorkerEnabled())
    return 'disabled' as const

  return syncNotificationStatus(jobId, {
    readJob: async id => (await getNotificationDatabase().ref(`v1/notificationJobs/${id}`).get()).val(),
    writeProjection: async (athleteId, id, view) => {
      await getNotificationDatabase().ref(`v1/notificationStatus/${athleteId}/${id}`)
        .transaction(current => mergeNotificationStatus(current, view))
    },
  })
}

// Read the current job, never the event snapshot. Projection failure retries this
// consumer only; it cannot call the worker or mutate any financial record.
export const onNotificationJobStatusWritten = onValueWritten({ ref: 'v1/notificationJobs/{jobId}', retry: true },
  async event => syncLocalNotificationStatus(event.params.jobId))
