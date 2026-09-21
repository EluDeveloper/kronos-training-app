<script setup lang="ts">
import PaymentNotificationStatusDialog from '../../src/components/kronos/PaymentNotificationStatusDialog.vue'
import { notificationStatusService } from '../../src/services/notification-status.service'

const open = ref(false)
const scenario = ref('ready')
const statuses = ['pending', 'accepted', 'sent', 'delivered', 'read', 'omitted', 'error', 'unknown']

// Isolated, synthetic component fixture. No login, Firebase subscription or writes.
notificationStatusService.subscribe = (_athleteId, onData, onError) => {
  if (scenario.value === 'loading')
    return () => {}

  const timer = window.setTimeout(() => {
    if (scenario.value === 'error')
      onError(new Error('Synthetic local error'))
    else if (scenario.value === 'forbidden')
      onError({ code: 'PERMISSION_DENIED' })
    else if (scenario.value === 'empty')
      onData(null)
    else
      onData(Object.fromEntries(Array.from({ length: 20 }, (_, i) => {
        const hash = i.toString(16).padStart(32, '0')

        return [`job-${hash}`, { type: 'payment-receipt', status: statuses[i % statuses.length],
          updatedAt: Date.parse('2026-09-09T15:00:00Z') - i * 60_000, folio: `REC-${hash.toUpperCase()}`, period: '2026-09' }]
      })))
  }, 25)

  return () => window.clearTimeout(timer)
}
</script>

<template>
  <VApp>
    <VMain class="pa-4">
      <h1 class="text-h5 mb-4">
        E8-UI · Fixture sintético local
      </h1>
      <p class="mb-4">
        Prueba aislada del componente. No sustituye el recorrido de Pagos con login manual.
      </p>
      <label for="scenario">Escenario de QA</label>
      <select
        id="scenario"
        v-model="scenario"
        class="ma-4 pa-2"
      >
        <option value="ready">
          20 notificaciones
        </option>
        <option value="loading">
          Cargando
        </option>
        <option value="empty">
          Vacío
        </option>
        <option value="error">
          Error
        </option>
        <option value="forbidden">
          Permiso revocado
        </option>
      </select>
      <VBtn @click="open = true">
        Abrir notificaciones de QA
      </VBtn>
      <PaymentNotificationStatusDialog
        v-model="open"
        athlete-id="qa"
        athlete-name="Atleta sintético con nombre largo para comprobar el ajuste en pantallas pequeñas"
        can-read
        identity-key="synthetic-no-session"
      />
    </VMain>
  </VApp>
</template>
