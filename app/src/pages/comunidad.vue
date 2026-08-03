<script setup lang="ts">
import PageHeader from '@/components/kronos/PageHeader.vue'
import EmptyState from '@/components/kronos/EmptyState.vue'
import { useAthletesStore } from '@/stores/athletes'
import { usePerformanceStore } from '@/stores/performance'
import { formatDate, timestampValue } from '@/utils/kronos'

const athletes = useAthletesStore()
const performance = usePerformanceStore()
const today = new Date()

const athleteName = (id: string) => athletes.items.find(item => item.id === id)?.profile.name ?? 'Atleta'
const skillName = (id: string) => performance.skills.find(item => item.id === id)?.name ?? 'Skill'
const birthdays = computed(() => athletes.active.flatMap(athlete => {
  const birthDate = athlete.profile.birthDate
  if (!birthDate) return []
  const [, month, day] = birthDate.split('-').map(Number)
  let next = new Date(today.getFullYear(), month - 1, day)
  if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate()))
    next = new Date(today.getFullYear() + 1, month - 1, day)
  const days = Math.ceil((next.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
  return days <= 60 ? [{ athlete, next, days }] : []
}).sort((a, b) => a.days - b.days))

const recentPRs = computed(() => {
  const best = new Map<string, number>()
  performance.records.forEach(record => {
    const key = `${record.athleteId}:${record.skillId}`
    best.set(key, Math.max(best.get(key) ?? 0, Number(record.valueLbs)))
  })
  return [...performance.records]
    .filter(record => Number(record.valueLbs) === best.get(`${record.athleteId}:${record.skillId}`))
    .sort((a, b) => timestampValue(b.recordedAt) - timestampValue(a.recordedAt))
    .slice(0, 12)
})

onMounted(() => { athletes.subscribe(); performance.subscribe() })
onUnmounted(() => { athletes.dispose(); performance.dispose() })
</script>

<template>
  <PageHeader title="Comunidad" eyebrow="Kronos Family" description="Momentos que vale la pena celebrar: cumpleaños y nuevas marcas personales." />
  <VRow><VCol cols="12" lg="5"><VCard class="kronos-card h-100" rounded="xl"><VCardItem title="Próximos cumpleaños" subtitle="Siguientes 60 días"><template #prepend><VAvatar color="warning" variant="tonal" rounded="lg"><VIcon icon="ri-cake-2-line" /></VAvatar></template></VCardItem><VCardText><VList v-if="birthdays.length" bg-color="transparent"><VListItem v-for="entry in birthdays" :key="entry.athlete.id" :title="entry.athlete.profile.name" :subtitle="formatDate(entry.next.toISOString())"><template #prepend><VAvatar color="primary" variant="tonal">{{ entry.athlete.profile.name.charAt(0) }}</VAvatar></template><template #append><VChip size="small" color="warning">{{ entry.days === 0 ? 'Hoy' : `${entry.days} días` }}</VChip></template></VListItem></VList><EmptyState v-else icon="ri-cake-2-line" title="Sin cumpleaños próximos" description="No hay fechas registradas en los siguientes 60 días." /></VCardText></VCard></VCol>
    <VCol cols="12" lg="7"><VCard class="kronos-card h-100" rounded="xl"><VCardItem title="PRs recientes" subtitle="Mejores marcas vigentes"><template #prepend><VAvatar color="secondary" variant="tonal" rounded="lg"><VIcon icon="ri-trophy-line" /></VAvatar></template></VCardItem><VCardText><VTimeline v-if="recentPRs.length" side="end" density="compact" truncate-line="both"><VTimelineItem v-for="record in recentPRs" :key="record.id" dot-color="secondary" size="small"><div class="d-flex flex-column flex-sm-row justify-sm-space-between ga-1"><div><strong>{{ athleteName(record.athleteId) }}</strong><div class="text-body-2 text-medium-emphasis">{{ skillName(record.skillId) }} · {{ record.type }}</div></div><div class="text-sm-right"><span class="text-h6 text-kronos-cyan">{{ record.valueLbs }} lb</span><div class="text-caption text-medium-emphasis">{{ formatDate(record.recordedAt) }}</div></div></div></VTimelineItem></VTimeline><EmptyState v-else icon="ri-trophy-line" title="Sin PRs registrados" description="Las mejores marcas aparecerán cuando se capture rendimiento." /></VCardText></VCard></VCol></VRow>
</template>
