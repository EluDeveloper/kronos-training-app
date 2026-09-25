<script setup lang="ts">
import BirthdayCardDialog from '@/components/kronos/BirthdayCardDialog.vue'
import EmptyState from '@/components/kronos/EmptyState.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import { useAthletesStore } from '@/stores/athletes'
import { useBirthdayGreetingsStore } from '@/stores/birthday-greetings'
import { useNotificationsStore } from '@/stores/notifications'
import { usePerformanceStore } from '@/stores/performance'
import { useSessionStore } from '@/stores/session'
import type { BirthdayGreeting } from '@/types/domain'
import { buildBirthdayQueue, type BirthdayQueueEntry } from '@/utils/birthday-greetings'
import { formatDate, timestampValue } from '@/utils/kronos'

const athletes = useAthletesStore()
const greetings = useBirthdayGreetingsStore()
const performance = usePerformanceStore()
const notifications = useNotificationsStore()
const session = useSessionStore()
const today = new Date().toISOString().slice(0, 10)
const savingGreeting = ref<string | null>(null)
const cardDialog = ref(false)
const cardEntry = ref<BirthdayQueueEntry | null>(null)

const athleteName = (id: string) => athletes.items.find(item => item.id === id)?.profile.name ?? 'Atleta'
const skillName = (id: string) => performance.skills.find(item => item.id === id)?.name ?? 'Skill'
const birthdayQueue = computed(() => buildBirthdayQueue(athletes.community, greetings.items, today))

const greetedThisYear = computed(() => greetings.items
  .filter(item => item.status === 'greeted' && item.year === Number(today.slice(0, 4)))
  .map(greeting => ({ greeting, athlete: athletes.community.find(item => item.id === greeting.athleteId) }))
  .filter((item): item is { greeting: BirthdayGreeting; athlete: NonNullable<typeof item.athlete> } => Boolean(item.athlete)))

const recentPRs = computed(() => {
  const best = new Map<string, number>()

  performance.records.forEach(record => best.set(`${record.athleteId}:${record.skillId}`, Math.max(best.get(`${record.athleteId}:${record.skillId}`) ?? 0, Number(record.valueLbs))))

  return [...performance.records]
    .filter(record => Number(record.valueLbs) === best.get(`${record.athleteId}:${record.skillId}`))
    .sort((a, b) => timestampValue(b.recordedAt) - timestampValue(a.recordedAt))
    .slice(0, 12)
})

async function markGreeted(entry: BirthdayQueueEntry) {
  if (!session.uid || !session.isAdmin) return
  savingGreeting.value = entry.id
  try { await greetings.setStatus(entry.athlete.id, entry.year, 'greeted', session.uid); notifications.show('Cumpleaños marcado como felicitado.') }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No fue posible actualizar.', 'error') }
  finally { savingGreeting.value = null }
}

async function reopen(greeting: BirthdayGreeting) {
  if (!session.uid || !session.isAdmin) return

  const accepted = await notifications.requestConfirmation({
    title: 'Reabrir felicitación', message: '¿Deseas volver a mostrar este cumpleaños como pendiente?', detail: 'La acción quedará registrada en la bitácora anual.',
    confirmText: 'Volver a pendiente', color: 'warning', icon: 'ri-arrow-go-back-line',
  })

  if (!accepted) return
  savingGreeting.value = greeting.id
  try { await greetings.setStatus(greeting.athleteId, greeting.year, 'pending', session.uid); notifications.show('Felicitación reabierta.', 'info') }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No fue posible reabrir.', 'error') }
  finally { savingGreeting.value = null }
}

function openCard(entry: BirthdayQueueEntry) { cardEntry.value = entry; cardDialog.value = true }
async function recordCardAction(value: { action: 'downloadedAt' | 'sharedAt'; version: string }) {
  if (!session.uid || !cardEntry.value || !session.isAdmin) return
  try { await greetings.recordCardAction(cardEntry.value.athlete.id, cardEntry.value.year, value.action, session.uid, value.version) }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'La tarjeta se generó, pero no se guardó su telemetría.', 'warning') }
}

onMounted(() => { athletes.subscribe(); greetings.subscribe(); performance.subscribe() })
onUnmounted(() => { athletes.dispose(); greetings.dispose(); performance.dispose() })
</script>

<template>
  <PageHeader title="Comunidad" eyebrow="Kronos Family" description="Cumpleaños pendientes hasta confirmar la felicitación y nuevas marcas personales." />
  <VRow>
    <VCol cols="12" lg="5">
      <VCard class="kronos-card h-100" rounded="xl">
        <VCardItem title="Cumpleaños por felicitar" subtitle="Vencidos, hoy y próximos 60 días">
          <template #prepend><VAvatar color="warning" variant="tonal" rounded="lg"><VIcon icon="ri-cake-2-line" /></VAvatar></template>
        </VCardItem>
        <VCardText>
          <VAlert v-if="greetings.error" type="error" variant="tonal" class="mb-4">{{ greetings.error }}</VAlert>
          <VList v-if="birthdayQueue.length" bg-color="transparent" lines="three">
            <VListItem v-for="entry in birthdayQueue" :key="entry.id" :title="entry.athlete.profile.name" :subtitle="formatDate(entry.occurrence)">
              <template #prepend><VAvatar color="primary" variant="tonal">{{ entry.athlete.profile.name.charAt(0) }}</VAvatar></template>
              <template #append>
                <div class="d-flex flex-column align-end ga-2">
                  <VChip size="small" :color="entry.status === 'overdue' ? 'error' : entry.status === 'today' ? 'warning' : 'info'">{{ entry.status === 'overdue' ? `${Math.abs(entry.days)} día(s) pendiente` : entry.status === 'today' ? 'Hoy' : `${entry.days} días` }}</VChip>
                  <div class="d-flex ga-1">
                    <VBtn size="small" variant="tonal" icon="ri-image-line" :aria-label="`Crear tarjeta para ${entry.athlete.profile.name}`" @click="openCard(entry)" />
                    <VBtn v-if="session.isAdmin" size="small" color="success" variant="tonal" icon="ri-check-line" :loading="savingGreeting === entry.id" :aria-label="`Marcar felicitado a ${entry.athlete.profile.name}`" @click="markGreeted(entry)" />
                  </div>
                </div>
              </template>
            </VListItem>
          </VList>
          <EmptyState v-else icon="ri-cake-2-line" title="Todo al día" description="No hay cumpleaños pendientes ni próximos en 60 días." />
          <template v-if="session.isAdmin && greetedThisYear.length">
            <VDivider class="my-4" /><div class="text-subtitle-2 mb-2">Felicitados este año</div>
            <VList density="compact" bg-color="transparent">
              <VListItem v-for="item in greetedThisYear" :key="item.greeting.id" :title="item.athlete.profile.name" :subtitle="item.greeting.greetedAt ? `Confirmado ${formatDate(item.greeting.greetedAt)}` : 'Confirmado'">
                <template #append><VBtn size="small" variant="text" prepend-icon="ri-arrow-go-back-line" :loading="savingGreeting === item.greeting.id" @click="reopen(item.greeting)">Desmarcar</VBtn></template>
              </VListItem>
            </VList>
          </template>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12" lg="7">
      <VCard class="kronos-card h-100" rounded="xl"><VCardItem title="PRs recientes" subtitle="Mejores marcas vigentes"><template #prepend><VAvatar color="secondary" variant="tonal" rounded="lg"><VIcon icon="ri-trophy-line" /></VAvatar></template></VCardItem><VCardText><VTimeline v-if="recentPRs.length" side="end" density="compact" truncate-line="both"><VTimelineItem v-for="record in recentPRs" :key="record.id" dot-color="secondary" size="small"><div class="d-flex flex-column flex-sm-row justify-sm-space-between ga-1"><div><strong>{{ athleteName(record.athleteId) }}</strong><div class="text-body-2 text-medium-emphasis">{{ skillName(record.skillId) }} · {{ record.type }}</div></div><div class="text-sm-right"><span class="text-h6 text-kronos-cyan">{{ record.valueLbs }} lb</span><div class="text-caption text-medium-emphasis">{{ formatDate(record.recordedAt) }}</div></div></div></VTimelineItem></VTimeline><EmptyState v-else icon="ri-trophy-line" title="Sin PRs registrados" description="Las mejores marcas aparecerán cuando se capture rendimiento." /></VCardText></VCard>
    </VCol>
  </VRow>
  <BirthdayCardDialog v-model="cardDialog" :athlete-name="cardEntry?.athlete.profile.name ?? ''" @card-action="recordCardAction" />
</template>
