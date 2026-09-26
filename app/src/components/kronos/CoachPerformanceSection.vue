<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import TablePaginator from '@/components/kronos/TablePaginator.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { usePerformanceStore } from '@/stores/performance'
import { useSessionStore } from '@/stores/session'
import type { CoachPerformanceRecord } from '@/types/domain'
import { formatCalendarDate, timestampValue } from '@/utils/kronos'

const performance = usePerformanceStore()
const notifications = useNotificationsStore()
const session = useSessionStore()
const canManage = computed(() => session.can('performanceManage'))
const selectedCoachId = ref<string | null>(null)
const selectedSkillId = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(15)
const dialog = ref(false)
const saving = ref(false)
const editing = ref<CoachPerformanceRecord | null>(null)
const form = reactive({ employeeId: '', skillId: '', type: '1RM', recordedAt: new Date().toISOString().slice(0, 10), valueLbs: 0 })

const coachItems = computed(() => performance.coaches.map(coach => ({ title: coach.name, value: coach.id, subtitle: coach.status === 'inactive' ? 'Inactivo · histórico' : 'Activo' })))
const activeCoachItems = computed(() => coachItems.value.filter(coach => performance.coaches.find(item => item.id === coach.value)?.status === 'active'))
const skillItems = computed(() => performance.skills.filter(skill => skill.status === 'active').map(skill => ({ title: skill.name, value: skill.id })))
const formCoachItems = computed(() => editing.value ? coachItems.value : activeCoachItems.value)
const formSkillItems = computed(() => editing.value ? performance.skills.map(skill => ({ title: skill.name, value: skill.id })) : skillItems.value)
const coachName = (id: string) => performance.coaches.find(coach => coach.id === id)?.name ?? 'Coach no disponible'
const skillName = (id: string) => performance.skills.find(skill => skill.id === id)?.name ?? 'Skill no disponible'

const filtered = computed(() => performance.coachRecords
  .filter(record => !selectedCoachId.value || record.employeeId === selectedCoachId.value)
  .filter(record => !selectedSkillId.value || record.skillId === selectedSkillId.value)
  .slice().sort((a, b) => timestampValue(b.recordedAt) - timestampValue(a.recordedAt)))

const paginated = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const comparison = computed(() => filtered.value.filter(record => selectedCoachId.value && selectedSkillId.value && record.employeeId === selectedCoachId.value && record.skillId === selectedSkillId.value).slice().reverse())
const best = computed(() => comparison.value.reduce<CoachPerformanceRecord | null>((winner, record) => !winner || record.valueLbs > winner.valueLbs ? record : winner, null))
const uniquePRs = computed(() => new Set(filtered.value.map(record => `${record.employeeId}:${record.skillId}`)).size)
const chartSeries = computed(() => [{ name: selectedSkillId.value ? skillName(selectedSkillId.value) : 'Marca', data: comparison.value.map(record => record.valueLbs) }])

const chartOptions = computed(() => ({
  chart: { toolbar: { show: false }, background: 'transparent' },
  colors: ['#97D5DE'], dataLabels: { enabled: false },
  xaxis: { categories: comparison.value.map(record => formatCalendarDate(record.recordedAt)) },
  yaxis: { labels: { formatter: (value: number) => `${Math.round(value)} lb` } },
}))

watch([selectedCoachId, selectedSkillId], () => { page.value = 1 })

function openCreate() {
  editing.value = null
  Object.assign(form, { employeeId: selectedCoachId.value && activeCoachItems.value.some(coach => coach.value === selectedCoachId.value) ? selectedCoachId.value : '', skillId: selectedSkillId.value ?? skillItems.value[0]?.value ?? '', type: '1RM', recordedAt: new Date().toISOString().slice(0, 10), valueLbs: 0 })
  dialog.value = true
}

function openEdit(record: CoachPerformanceRecord) {
  editing.value = record
  Object.assign(form, { employeeId: record.employeeId, skillId: record.skillId, type: record.type, recordedAt: record.recordedAt, valueLbs: record.valueLbs })
  dialog.value = true
}

async function save() {
  const coach = performance.coaches.find(item => item.id === form.employeeId)
  if (!form.skillId || !form.type.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(form.recordedAt) || !Number.isFinite(Number(form.valueLbs)) || Number(form.valueLbs) <= 0 || (!editing.value && coach?.status !== 'active')) {
    notifications.show('Selecciona un coach activo, skill, fecha y marca mayor a cero.', 'warning')

    return
  }
  saving.value = true
  try {
    const valueLbs = Number(form.valueLbs)
    const values = { type: form.type.trim(), recordedAt: form.recordedAt, valueLbs, valueKg: Number((valueLbs * 0.45359237).toFixed(2)) }
    if (editing.value) await performance.updateCoach(editing.value, values)
    else await performance.createCoach({ employeeId: form.employeeId, skillId: form.skillId, ...values })
    selectedCoachId.value = form.employeeId
    selectedSkillId.value = form.skillId
    notifications.show(editing.value ? 'PR de coach actualizado.' : 'PR de coach registrado.')
    dialog.value = false
  }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No fue posible guardar el PR.', 'error') }
  finally { saving.value = false }
}

async function remove(record: CoachPerformanceRecord) {
  const accepted = await notifications.requestConfirmation({ title: 'Eliminar PR de coach', message: `¿Eliminar la marca de ${coachName(record.employeeId)}?`, detail: 'El comparativo se recalculará sin este registro.', confirmText: 'Eliminar marca', color: 'error', icon: 'ri-delete-bin-line' })
  if (!accepted) return
  try { await performance.removeCoach(record); notifications.show('PR de coach eliminado.', 'info') }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No fue posible eliminar la marca.', 'error') }
}
</script>

<template>
  <VCard
    class="kronos-card mt-5"
    rounded="xl"
  >
    <VCardItem
      title="PRs de coaches"
      subtitle="Marcas y evolución de empleados coach, separadas de las membresías."
    >
      <template
        v-if="canManage"
        #append
      >
        <VBtn
          prepend-icon="ri-add-line"
          :disabled="!activeCoachItems.length || !skillItems.length"
          @click="openCreate"
        >
          Registrar PR
        </VBtn>
      </template>
    </VCardItem>
    <VCardText>
      <div class="d-flex flex-wrap ga-4 mb-4">
        <span>Registros: <strong>{{ filtered.length }}</strong></span><span>PR únicos: <strong>{{ uniquePRs }}</strong></span>
      </div>
      <VRow>
        <VCol
          cols="12"
          md="6"
        >
          <VAutocomplete
            v-model="selectedCoachId"
            :items="coachItems"
            label="Buscar coach"
            clearable
          />
        </VCol>
        <VCol
          cols="12"
          md="6"
        >
          <VAutocomplete
            v-model="selectedSkillId"
            :items="performance.skills.map(skill => ({ title: skill.name, value: skill.id }))"
            label="Buscar skill"
            clearable
          />
        </VCol>
      </VRow>
      <VAlert
        v-if="performance.error"
        type="error"
        class="mb-4"
      >
        {{ performance.error }}
      </VAlert>
      <div
        v-if="comparison.length"
        class="mb-6"
      >
        <div class="d-flex flex-wrap justify-space-between ga-2 mb-2">
          <strong>Mejor marca: {{ best?.valueLbs }} lb</strong><span>Última: {{ comparison.at(-1)?.valueLbs }} lb</span>
        </div>
        <VueApexCharts
          type="line"
          height="280"
          :options="chartOptions"
          :series="chartSeries"
        />
      </div>
      <EmptyState
        v-else-if="selectedCoachId && selectedSkillId"
        icon="ri-line-chart-line"
        title="Sin comparativo"
        description="Este coach todavía no tiene marcas para el skill seleccionado."
      />
      <EmptyState
        v-if="!filtered.length"
        icon="ri-medal-line"
        title="Sin PRs de coaches"
        description="Selecciona otros filtros o registra la primera marca."
      />
      <template v-else>
        <div class="overflow-x-auto">
          <VTable>
            <thead><tr><th>FECHA</th><th>COACH</th><th>SKILL</th><th>TIPO</th><th>MARCA</th><th /></tr></thead><tbody>
              <tr
                v-for="record in paginated"
                :key="record.id"
              >
                <td>{{ formatCalendarDate(record.recordedAt) }}</td><td>{{ coachName(record.employeeId) }}</td><td>{{ skillName(record.skillId) }}</td><td>{{ record.type }}</td><td>{{ record.valueLbs }} lb</td><td class="text-end">
                  <template v-if="canManage">
                    <VBtn
                      icon="ri-edit-line"
                      variant="text"
                      size="small"
                      :aria-label="`Editar PR de ${coachName(record.employeeId)}`"
                      @click="openEdit(record)"
                    /><VBtn
                      icon="ri-delete-bin-line"
                      variant="text"
                      size="small"
                      color="error"
                      :aria-label="`Eliminar PR de ${coachName(record.employeeId)}`"
                      @click="remove(record)"
                    />
                  </template>
                </td>
              </tr>
            </tbody>
          </VTable>
        </div>
        <TablePaginator
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="filtered.length"
          label="PRs de coaches"
        />
      </template>
    </VCardText>
  </VCard>

  <VDialog
    v-model="dialog"
    max-width="620"
  >
    <VCard class="kronos-card">
      <VCardItem :title="editing ? 'Editar PR de coach' : 'Nuevo PR de coach'" /><VForm @submit.prevent="save">
        <VCardText>
          <VAutocomplete
            v-model="form.employeeId"
            :items="formCoachItems"
            label="Coach"
            :disabled="Boolean(editing)"
          />
          <VAutocomplete
            v-model="form.skillId"
            :items="formSkillItems"
            label="Skill"
            :disabled="Boolean(editing)"
          />
          <VTextField
            v-model="form.type"
            label="Tipo de marca"
          />
          <VTextField
            v-model="form.recordedAt"
            type="date"
            label="Fecha"
          />
          <VTextField
            v-model.number="form.valueLbs"
            type="number"
            min="0.1"
            step="0.1"
            label="Marca"
            suffix="lb"
          />
        </VCardText><VCardActions>
          <VSpacer /><VBtn
            variant="text"
            @click="dialog = false"
          >
            Cancelar
          </VBtn><VBtn
            type="submit"
            :loading="saving"
          >
            Guardar PR
          </VBtn>
        </VCardActions>
      </VForm>
    </VCard>
  </VDialog>
</template>
