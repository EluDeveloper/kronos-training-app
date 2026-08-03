<script setup lang="ts">
import PageHeader from '@/components/kronos/PageHeader.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import EmptyState from '@/components/kronos/EmptyState.vue'
import { useAthletesStore } from '@/stores/athletes'
import { usePerformanceStore } from '@/stores/performance'
import { useNotificationsStore } from '@/stores/notifications'
import { formatDate, timestampValue } from '@/utils/kronos'

const athletesStore = useAthletesStore()
const performanceStore = usePerformanceStore()
const notifications = useNotificationsStore()

const dialog = ref(false)
const saving = ref(false)
const search = ref('')
const athleteFilter = ref<string | null>(null)
const form = reactive({ athleteId: '', skillId: '', type: '1RM', recordedAt: new Date().toISOString().slice(0, 10), valueLbs: 0 })

const activeSkills = computed(() => performanceStore.skills.filter(skill => skill.status === 'active'))
const athleteName = (id: string) => athletesStore.items.find(item => item.id === id)?.profile.name ?? 'Atleta eliminado'
const skillName = (id: string) => performanceStore.skills.find(item => item.id === id)?.name ?? 'Skill eliminado'
const filtered = computed(() => [...performanceStore.records]
  .filter(record => !athleteFilter.value || record.athleteId === athleteFilter.value)
  .filter(record => `${athleteName(record.athleteId)} ${skillName(record.skillId)} ${record.type}`.toLowerCase().includes(search.value.toLowerCase()))
  .sort((a, b) => timestampValue(b.recordedAt) - timestampValue(a.recordedAt)))
const personalBests = computed(() => {
  const best = new Map<string, number>()
  performanceStore.records.forEach(record => {
    const key = `${record.athleteId}:${record.skillId}`
    best.set(key, Math.max(best.get(key) ?? 0, Number(record.valueLbs)))
  })
  return best.size
})
const latest = computed(() => [...performanceStore.records].sort((a, b) => timestampValue(b.recordedAt) - timestampValue(a.recordedAt))[0])

function openCreate() {
  Object.assign(form, { athleteId: athletesStore.active[0]?.id ?? '', skillId: activeSkills.value[0]?.id ?? '', type: '1RM', recordedAt: new Date().toISOString().slice(0, 10), valueLbs: 0 })
  dialog.value = true
}

async function save() {
  if (!form.athleteId || !form.skillId || !form.recordedAt || Number(form.valueLbs) <= 0) {
    notifications.show('Completa atleta, skill, fecha y una marca mayor a cero.', 'warning')
    return
  }
  saving.value = true
  try {
    const valueLbs = Number(form.valueLbs)
    await performanceStore.create({ ...form, valueLbs, valueKg: Number((valueLbs * 0.45359237).toFixed(2)) })
    notifications.show('Marca registrada correctamente.')
    dialog.value = false
  }
  catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No se pudo guardar la marca.', 'error')
  }
  finally { saving.value = false }
}

async function remove(record: typeof performanceStore.records[number]) {
  if (!confirm(`¿Eliminar la marca de ${athleteName(record.athleteId)}?`))
    return
  try {
    await performanceStore.remove(record)
    notifications.show('Marca eliminada.', 'info')
  }
  catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No se pudo eliminar.', 'error')
  }
}

onMounted(() => { athletesStore.subscribe(); performanceStore.subscribe() })
onUnmounted(() => { athletesStore.dispose(); performanceStore.dispose() })
</script>

<template>
  <PageHeader title="Rendimiento" eyebrow="Progreso" description="Marcas personales y evolución deportiva en tiempo real.">
    <template #actions><VBtn prepend-icon="ri-add-line" @click="openCreate">Registrar marca</VBtn></template>
  </PageHeader>

  <VRow class="mb-2">
    <VCol cols="12" md="4"><MetricCard label="Registros" :value="performanceStore.records.length" icon="ri-line-chart-line" /></VCol>
    <VCol cols="12" md="4"><MetricCard label="PR únicos" :value="personalBests" icon="ri-medal-line" color="secondary" /></VCol>
    <VCol cols="12" md="4"><MetricCard label="Última marca" :value="latest ? `${latest.valueLbs} lb` : '—'" :detail="latest ? athleteName(latest.athleteId) : 'Sin registros'" icon="ri-trophy-line" color="warning" /></VCol>
  </VRow>

  <VCard class="kronos-card" rounded="xl">
    <VCardText>
      <VRow><VCol cols="12" md="7"><VTextField v-model="search" label="Buscar atleta o skill" prepend-inner-icon="ri-search-line" clearable /></VCol><VCol cols="12" md="5"><VSelect v-model="athleteFilter" :items="athletesStore.sorted" item-title="profile.name" item-value="id" label="Filtrar atleta" clearable /></VCol></VRow>
    </VCardText>
    <VTable v-if="filtered.length" class="text-no-wrap">
      <thead><tr><th>FECHA</th><th>ATLETA</th><th>SKILL</th><th>TIPO</th><th>MARCA</th><th></th></tr></thead>
      <tbody><tr v-for="record in filtered" :key="record.id"><td>{{ formatDate(record.recordedAt) }}</td><td>{{ athleteName(record.athleteId) }}</td><td>{{ skillName(record.skillId) }}</td><td><VChip size="small" color="primary">{{ record.type }}</VChip></td><td><strong>{{ record.valueLbs }} lb</strong><span class="text-caption text-medium-emphasis ms-2">{{ record.valueKg }} kg</span></td><td class="text-end"><VBtn icon="ri-delete-bin-line" size="small" variant="text" color="error" @click="remove(record)" /></td></tr></tbody>
    </VTable>
    <EmptyState v-else icon="ri-line-chart-line" title="Sin marcas registradas" description="Agrega el primer resultado para comenzar el historial deportivo." />
  </VCard>

  <VDialog v-model="dialog" max-width="560"><VCard rounded="xl"><VCardTitle class="pa-6">Nueva marca</VCardTitle><VCardText><VForm @submit.prevent="save"><VRow><VCol cols="12"><VSelect v-model="form.athleteId" :items="athletesStore.active" item-title="profile.name" item-value="id" label="Atleta" /></VCol><VCol cols="12" md="7"><VSelect v-model="form.skillId" :items="activeSkills" item-title="name" item-value="id" label="Skill" /></VCol><VCol cols="12" md="5"><VTextField v-model="form.type" label="Tipo" placeholder="1RM" /></VCol><VCol cols="12" md="6"><VTextField v-model="form.recordedAt" type="date" label="Fecha" /></VCol><VCol cols="12" md="6"><VTextField v-model.number="form.valueLbs" type="number" min="0" step="0.1" label="Marca (lb)" suffix="lb" /></VCol></VRow></VForm></VCardText><VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="dialog = false">Cancelar</VBtn><VBtn :loading="saving" @click="save">Guardar</VBtn></VCardActions></VCard></VDialog>
</template>
