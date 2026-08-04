<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import { useAthletesStore } from '@/stores/athletes'
import { useNotificationsStore } from '@/stores/notifications'
import { usePerformanceStore } from '@/stores/performance'
import { useSessionStore } from '@/stores/session'
import type { PerformanceRecord } from '@/types/domain'
import { formatDate, timestampValue } from '@/utils/kronos'

const athletesStore = useAthletesStore()
const performanceStore = usePerformanceStore()
const notifications = useNotificationsStore()
const session = useSessionStore()
const canManage = computed(() => session.can('performanceManage'))

const dialog = ref(false)
const saving = ref(false)
const editingRecord = ref<PerformanceRecord | null>(null)
const search = ref('')
const selectedAthleteId = ref<string | null>(null)
const selectedSkillId = ref<string | null>(null)
const page = ref(1)
const perPage = 15
const form = reactive({ athleteId: '', skillId: '', type: '1RM', recordedAt: new Date().toISOString().slice(0, 10), valueLbs: 0 })

const activeSkills = computed(() => performanceStore.skills.filter(skill => skill.status === 'active'))
const athleteItems = computed(() => athletesStore.sorted.map(athlete => ({ title: athlete.profile.name, value: athlete.id })))
const skillItems = computed(() => activeSkills.value.map(skill => ({ title: skill.name, value: skill.id })))
const athleteName = (id: string) => athletesStore.items.find(item => item.id === id)?.profile.name ?? 'Atleta eliminado'
const skillName = (id: string) => performanceStore.skills.find(item => item.id === id)?.name ?? 'Skill eliminado'

const athleteSkillItems = computed(() => {
  const usedSkills = new Set(performanceStore.records.filter(record => !selectedAthleteId.value || record.athleteId === selectedAthleteId.value).map(record => record.skillId))

  return performanceStore.skills
    .filter(skill => skill.status === 'active' || usedSkills.has(skill.id))
    .map(skill => ({ title: skill.name, value: skill.id, hasRecords: usedSkills.has(skill.id) }))
    .sort((a, b) => Number(b.hasRecords) - Number(a.hasRecords) || a.title.localeCompare(b.title, 'es'))
})

const comparisonRecords = computed(() => performanceStore.records
  .filter(record => record.athleteId === selectedAthleteId.value && record.skillId === selectedSkillId.value)
  .sort((a, b) => timestampValue(a.recordedAt) - timestampValue(b.recordedAt)))

const comparisonLatest = computed(() => comparisonRecords.value.at(-1) ?? null)
const comparisonBest = computed(() => comparisonRecords.value.reduce<PerformanceRecord | null>((best, record) => !best || record.valueLbs > best.valueLbs ? record : best, null))
const comparisonChange = computed(() => comparisonRecords.value.length > 1 ? Number((comparisonRecords.value.at(-1)!.valueLbs - comparisonRecords.value[0].valueLbs).toFixed(1)) : 0)
const chartSeries = computed(() => [{ name: selectedSkillId.value ? skillName(selectedSkillId.value) : 'Marca', data: comparisonRecords.value.map(record => record.valueLbs) }])

const chartOptions = computed(() => ({
  chart: { toolbar: { show: false }, background: 'transparent', zoom: { enabled: false } },
  colors: ['#97D5DE'],
  dataLabels: { enabled: false },
  grid: { borderColor: 'rgba(235,235,235,.08)' },
  markers: { size: 5, colors: ['#FF401B'], strokeColors: '#1B1D1A', strokeWidth: 2 },
  stroke: { curve: 'smooth', width: 3 },
  theme: { mode: 'dark' },
  tooltip: { y: { formatter: (value: number) => `${value} lb` } },
  xaxis: { categories: comparisonRecords.value.map(record => formatDate(record.recordedAt)), labels: { style: { colors: '#A9AAA8' } } },
  yaxis: { labels: { style: { colors: '#A9AAA8' }, formatter: (value: number) => `${Math.round(value)} lb` } },
}))

const filtered = computed(() => [...performanceStore.records]
  .filter(record => !selectedAthleteId.value || record.athleteId === selectedAthleteId.value)
  .filter(record => !selectedSkillId.value || record.skillId === selectedSkillId.value)
  .filter(record => `${athleteName(record.athleteId)} ${skillName(record.skillId)} ${record.type}`.toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es')))
  .sort((a, b) => timestampValue(b.recordedAt) - timestampValue(a.recordedAt)))

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage)))
const paginated = computed(() => filtered.value.slice((page.value - 1) * perPage, page.value * perPage))
const personalBests = computed(() => new Set(performanceStore.records.map(record => `${record.athleteId}:${record.skillId}`)).size)
const latest = computed(() => [...performanceStore.records].sort((a, b) => timestampValue(b.recordedAt) - timestampValue(a.recordedAt))[0])

watch([search, selectedAthleteId, selectedSkillId], () => { page.value = 1 })
watch([() => athletesStore.items.length, () => performanceStore.records.length], () => {
  if (!selectedAthleteId.value)
    selectedAthleteId.value = performanceStore.records[0]?.athleteId ?? athletesStore.active[0]?.id ?? null
}, { immediate: true })
watch([selectedAthleteId, () => performanceStore.records.length], () => {
  const available = selectedSkillId.value && performanceStore.records.some(record => record.athleteId === selectedAthleteId.value && record.skillId === selectedSkillId.value)
  if (!available)
    selectedSkillId.value = performanceStore.records.find(record => record.athleteId === selectedAthleteId.value)?.skillId ?? athleteSkillItems.value[0]?.value ?? null
}, { immediate: true })

function openCreate() {
  editingRecord.value = null
  Object.assign(form, {
    athleteId: selectedAthleteId.value ?? athletesStore.active[0]?.id ?? '',
    skillId: selectedSkillId.value ?? activeSkills.value[0]?.id ?? '',
    type: '1RM',
    recordedAt: new Date().toISOString().slice(0, 10),
    valueLbs: 0,
  })
  dialog.value = true
}

function openEdit(record: PerformanceRecord) {
  editingRecord.value = record
  Object.assign(form, { athleteId: record.athleteId, skillId: record.skillId, type: record.type, recordedAt: record.recordedAt, valueLbs: record.valueLbs })
  dialog.value = true
}

async function save() {
  if (!form.athleteId || !form.skillId || !form.type.trim() || !form.recordedAt || Number(form.valueLbs) <= 0) {
    notifications.show('Completa atleta, skill, tipo, fecha y una marca mayor a cero.', 'warning')

    return
  }
  saving.value = true
  try {
    const valueLbs = Number(form.valueLbs)
    const values = { type: form.type.trim(), recordedAt: form.recordedAt, valueLbs, valueKg: Number((valueLbs * 0.45359237).toFixed(2)) }
    if (editingRecord.value)
      await performanceStore.update(editingRecord.value, values)
    else
      await performanceStore.create({ athleteId: form.athleteId, skillId: form.skillId, ...values })
    selectedAthleteId.value = form.athleteId
    selectedSkillId.value = form.skillId
    notifications.show(editingRecord.value ? 'Marca actualizada correctamente.' : 'Marca registrada correctamente.')
    dialog.value = false
  }
  catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No se pudo guardar la marca.', 'error')
  }
  finally { saving.value = false }
}

async function remove(record: PerformanceRecord) {
  const accepted = await notifications.requestConfirmation({
    title: 'Eliminar marca',
    message: `¿Deseas eliminar esta marca de ${athleteName(record.athleteId)}?`,
    detail: 'La gráfica y los indicadores del atleta se recalcularán sin este registro.',
    confirmText: 'Eliminar marca',
    color: 'error',
    icon: 'ri-delete-bin-line',
  })

  if (!accepted)
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
  <PageHeader
    title="Rendimiento"
    eyebrow="Progreso"
    description="Marcas personales, edición y evolución comparativa por atleta."
  >
    <template
      v-if="canManage"
      #actions
    >
      <VBtn
        prepend-icon="ri-add-line"
        @click="openCreate"
      >
        Registrar marca
      </VBtn>
    </template>
  </PageHeader>

  <VRow class="mb-2">
    <VCol
      cols="12"
      md="4"
    >
      <MetricCard
        label="Registros"
        :value="performanceStore.records.length"
        icon="ri-line-chart-line"
      />
    </VCol>
    <VCol
      cols="12"
      md="4"
    >
      <MetricCard
        label="PR únicos"
        :value="personalBests"
        icon="ri-medal-line"
        color="secondary"
      />
    </VCol>
    <VCol
      cols="12"
      md="4"
    >
      <MetricCard
        label="Última marca"
        :value="latest ? `${latest.valueLbs} lb` : '—'"
        :detail="latest ? athleteName(latest.athleteId) : 'Sin registros'"
        icon="ri-trophy-line"
        color="warning"
      />
    </VCol>
  </VRow>

  <VCard
    class="kronos-card mb-5"
    rounded="xl"
  >
    <VCardItem
      title="Comparativo de marcas"
      subtitle="Selecciona atleta y movimiento para revisar su evolución."
    />
    <VCardText>
      <VRow class="mb-2">
        <VCol
          cols="12"
          md="7"
        >
          <VAutocomplete
            v-model="selectedAthleteId"
            :items="athleteItems"
            label="Buscar atleta"
            prepend-inner-icon="ri-search-line"
            clearable
            auto-select-first
          />
        </VCol>
        <VCol
          cols="12"
          md="5"
        >
          <VAutocomplete
            v-model="selectedSkillId"
            :items="athleteSkillItems"
            label="Buscar skill"
            prepend-inner-icon="ri-search-line"
            clearable
            auto-select-first
          />
        </VCol>
      </VRow>
      <EmptyState
        v-if="!comparisonRecords.length"
        icon="ri-line-chart-line"
        title="Sin comparativo disponible"
        description="Este atleta todavía no tiene marcas para el skill seleccionado."
      />
      <template v-else>
        <VRow class="mb-2">
          <VCol
            cols="12"
            sm="4"
          >
            <VCard
              variant="tonal"
              color="secondary"
              rounded="lg"
            >
              <VCardText>
                <div class="text-caption">
                  Última
                </div><div class="text-h5 font-weight-bold">
                  {{ comparisonLatest?.valueLbs }} lb
                </div><div>{{ comparisonLatest ? formatDate(comparisonLatest.recordedAt) : '' }}</div>
              </VCardText>
            </VCard>
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <VCard
              variant="tonal"
              color="warning"
              rounded="lg"
            >
              <VCardText>
                <div class="text-caption">
                  Mejor marca
                </div><div class="text-h5 font-weight-bold">
                  {{ comparisonBest?.valueLbs }} lb
                </div><div>{{ comparisonBest ? formatDate(comparisonBest.recordedAt) : '' }}</div>
              </VCardText>
            </VCard>
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <VCard
              variant="tonal"
              :color="comparisonChange >= 0 ? 'success' : 'error'"
              rounded="lg"
            >
              <VCardText>
                <div class="text-caption">
                  Variación total
                </div><div class="text-h5 font-weight-bold">
                  {{ comparisonChange > 0 ? '+' : '' }}{{ comparisonChange }} lb
                </div><div>primera vs. última</div>
              </VCardText>
            </VCard>
          </VCol>
        </VRow>
        <VueApexCharts
          type="line"
          height="340"
          :options="chartOptions"
          :series="chartSeries"
        />
      </template>
    </VCardText>
  </VCard>

  <VCard
    class="kronos-card"
    rounded="xl"
  >
    <VCardItem
      title="Historial de marcas"
      :subtitle="`${filtered.length} registros encontrados`"
    />
    <VCardText>
      <VTextField
        v-model="search"
        label="Buscar atleta, skill o tipo"
        prepend-inner-icon="ri-search-line"
        clearable
        class="mb-5"
      />
      <EmptyState
        v-if="!filtered.length"
        icon="ri-line-chart-line"
        title="Sin marcas registradas"
        description="Agrega el primer resultado o cambia los filtros."
      />
      <template v-else>
        <VTable class="text-no-wrap">
          <thead><tr><th>FECHA</th><th>ATLETA</th><th>SKILL</th><th>TIPO</th><th>MARCA</th><th /></tr></thead>
          <tbody>
            <tr
              v-for="record in paginated"
              :key="record.id"
            >
              <td>{{ formatDate(record.recordedAt) }}</td><td>{{ athleteName(record.athleteId) }}</td><td>{{ skillName(record.skillId) }}</td><td>
                <VChip
                  size="small"
                  color="primary"
                >
                  {{ record.type }}
                </VChip>
              </td><td><strong>{{ record.valueLbs }} lb</strong><span class="text-caption text-medium-emphasis ms-2">{{ record.valueKg }} kg</span></td><td class="text-end">
                <template v-if="canManage">
                  <VBtn
                    icon="ri-edit-line"
                    size="small"
                    variant="text"
                    title="Editar marca"
                    @click="openEdit(record)"
                  /><VBtn
                    icon="ri-delete-bin-line"
                    size="small"
                    variant="text"
                    color="error"
                    title="Eliminar marca"
                    @click="remove(record)"
                  />
                </template>
              </td>
            </tr>
          </tbody>
        </VTable>
        <div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-5">
          <span class="text-caption text-medium-emphasis">Máximo 15 registros por página</span><VPagination
            v-model="page"
            :length="pageCount"
            :total-visible="5"
          />
        </div>
      </template>
    </VCardText>
  </VCard>

  <VDialog
    v-model="dialog"
    max-width="620"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        :title="editingRecord ? 'Editar marca' : 'Nueva marca'"
        subtitle="Atleta, movimiento, fecha y resultado registrado."
      />
      <VForm @submit.prevent="save">
        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.athleteId"
                :items="athleteItems"
                label="Buscar atleta"
                prepend-inner-icon="ri-search-line"
                auto-select-first
                :disabled="Boolean(editingRecord)"
              />
            </VCol>
            <VCol
              cols="12"
              md="7"
            >
              <VAutocomplete
                v-model="form.skillId"
                :items="skillItems"
                label="Buscar skill"
                prepend-inner-icon="ri-search-line"
                auto-select-first
                :disabled="Boolean(editingRecord)"
              />
            </VCol>
            <VCol
              cols="12"
              md="5"
            >
              <VCombobox
                v-model="form.type"
                :items="['1RM', '3RM', '5RM', 'Tiempo', 'Repeticiones']"
                label="Tipo de marca"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="form.recordedAt"
                type="date"
                label="Fecha"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model.number="form.valueLbs"
                type="number"
                min="0.1"
                step="0.1"
                label="Marca"
                suffix="lb"
              />
            </VCol>
            <VCol
              v-if="editingRecord"
              cols="12"
            >
              <VAlert
                type="info"
                variant="tonal"
              >
                Para conservar el historial, atleta y skill permanecen fijos al editar. Puedes corregir tipo, fecha y valor.
              </VAlert>
            </VCol>
          </VRow>
        </VCardText>
        <VCardActions class="pa-6 pt-0">
          <VSpacer /><VBtn
            variant="text"
            @click="dialog = false"
          >
            Cancelar
          </VBtn><VBtn
            type="submit"
            :loading="saving"
          >
            {{ editingRecord ? 'Guardar cambios' : 'Guardar marca' }}
          </VBtn>
        </VCardActions>
      </VForm>
    </VCard>
  </VDialog>
</template>
