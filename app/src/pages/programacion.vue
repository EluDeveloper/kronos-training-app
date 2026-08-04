<script setup lang="ts">
import PageHeader from '@/components/kronos/PageHeader.vue'
import EmptyState from '@/components/kronos/EmptyState.vue'
import { useWorkoutsStore } from '@/stores/workouts'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import type { Workout } from '@/types/domain'
import { formatDate } from '@/utils/kronos'

const workouts = useWorkoutsStore()
const notifications = useNotificationsStore()
const session = useSessionStore()
const canManage = computed(() => session.can('workoutsManage'))
const dialog = ref(false)
const saving = ref(false)
const editingDate = ref<string | null>(null)
const form = reactive({ date: new Date().toISOString().slice(0, 10), focus: '', blocks: [] as Array<{ duration: string; title: string; detailsText: string }> })
const sorted = computed(() => [...workouts.items].sort((a, b) => b.date.localeCompare(a.date)))

function addBlock() { form.blocks.push({ duration: '', title: '', detailsText: '' }) }
function removeBlock(index: number) { form.blocks.splice(index, 1) }
function openCreate() {
  editingDate.value = null
  Object.assign(form, { date: new Date().toISOString().slice(0, 10), focus: '', blocks: [] })
  addBlock()
  dialog.value = true
}
function openEdit(workout: Workout) {
  editingDate.value = workout.date
  form.date = workout.date
  form.focus = workout.focus
  form.blocks = workout.blocks.map(block => ({ duration: block.duration, title: block.title, detailsText: block.details.join('\n') }))
  dialog.value = true
}
async function save() {
  const blocks = form.blocks.map(block => ({ duration: block.duration.trim(), title: block.title.trim(), details: block.detailsText.split('\n').map(item => item.trim()).filter(Boolean) })).filter(block => block.title)
  if (!form.date || !form.focus.trim() || !blocks.length) {
    notifications.show('Indica fecha, enfoque y al menos un bloque con título.', 'warning')

    return
  }
  saving.value = true
  try {
    if (editingDate.value && editingDate.value !== form.date)
      await workouts.remove(editingDate.value)
    await workouts.save({ date: form.date, focus: form.focus.trim(), blocks })
    notifications.show(editingDate.value ? 'Programación actualizada.' : 'WOD publicado.')
    dialog.value = false
  }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo guardar el WOD.', 'error') }
  finally { saving.value = false }
}
async function remove(workout: Workout) {
  const accepted = await notifications.requestConfirmation({
    title: 'Eliminar programación',
    message: `¿Deseas eliminar la programación del ${formatDate(workout.date)}?`,
    detail: 'Los bloques de entrenamiento de ese día se eliminarán para todos los dispositivos.',
    confirmText: 'Eliminar programación',
    color: 'error',
    icon: 'ri-calendar-close-line',
  })

  if (!accepted) return
  try { await workouts.remove(workout.date); notifications.show('Programación eliminada.', 'info') }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo eliminar.', 'error') }
}

onMounted(() => workouts.subscribe())
onUnmounted(() => workouts.dispose())
</script>

<template>
  <PageHeader
    title="Programación"
    eyebrow="Entrenamiento"
    description="WODs por fecha, enfoque y bloques de trabajo."
  >
    <template
      v-if="canManage"
      #actions
    >
      <VBtn
        prepend-icon="ri-add-line"
        @click="openCreate"
      >
        Programar WOD
      </VBtn>
    </template>
  </PageHeader>
  <VRow v-if="sorted.length">
    <VCol
      v-for="workout in sorted"
      :key="workout.id"
      cols="12"
      lg="6"
    >
      <VCard
        class="kronos-card h-100"
        rounded="xl"
      >
        <VCardItem>
          <template #prepend>
            <VAvatar
              color="primary"
              variant="tonal"
              rounded="lg"
            >
              <VIcon icon="ri-calendar-schedule-line" />
            </VAvatar>
          </template><VCardTitle>{{ formatDate(workout.date) }}</VCardTitle><VCardSubtitle>{{ workout.focus }}</VCardSubtitle><template
            v-if="canManage"
            #append
          >
            <VMenu>
              <template #activator="{ props }">
                <VBtn
                  v-bind="props"
                  icon="ri-more-2-fill"
                  variant="text"
                />
              </template><VList>
                <VListItem
                  prepend-icon="ri-edit-line"
                  title="Editar"
                  @click="openEdit(workout)"
                /><VListItem
                  prepend-icon="ri-delete-bin-line"
                  title="Eliminar"
                  base-color="error"
                  @click="remove(workout)"
                />
              </VList>
            </VMenu>
          </template>
        </VCardItem><VDivider /><VCardText>
          <div
            v-for="(block, index) in workout.blocks"
            :key="`${workout.id}-${index}`"
            class="mb-5"
          >
            <div class="d-flex align-center ga-3 mb-2">
              <VChip
                size="small"
                color="secondary"
              >
                {{ block.duration || 'Bloque' }}
              </VChip><strong>{{ block.title }}</strong>
            </div><ul class="text-body-2 text-medium-emphasis ps-6">
              <li
                v-for="detail in block.details"
                :key="detail"
              >
                {{ detail }}
              </li>
            </ul>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VCard
    v-else
    class="kronos-card"
    rounded="xl"
  >
    <EmptyState
      icon="ri-calendar-schedule-line"
      title="Sin programación"
      description="Publica el primer WOD para que quede disponible en todos los dispositivos."
    />
  </VCard>

  <VDialog
    v-model="dialog"
    max-width="760"
    scrollable
  >
    <VCard rounded="xl">
      <VCardTitle class="pa-6">
        {{ editingDate ? 'Editar WOD' : 'Programar WOD' }}
      </VCardTitle><VCardText>
        <VRow>
          <VCol
            cols="12"
            md="4"
          >
            <VTextField
              v-model="form.date"
              type="date"
              label="Fecha"
            />
          </VCol><VCol
            cols="12"
            md="8"
          >
            <VTextField
              v-model="form.focus"
              label="Enfoque del día"
              placeholder="Fuerza + acondicionamiento"
            />
          </VCol>
        </VRow><div
          v-for="(block, index) in form.blocks"
          :key="index"
          class="kronos-subtle pa-4 rounded-lg mb-4"
        >
          <div class="d-flex justify-space-between align-center mb-3">
            <strong>Bloque {{ index + 1 }}</strong><VBtn
              v-if="form.blocks.length > 1"
              icon="ri-close-line"
              size="small"
              variant="text"
              @click="removeBlock(index)"
            />
          </div><VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="block.duration"
                label="Duración"
                placeholder="15 min"
              />
            </VCol><VCol
              cols="12"
              md="8"
            >
              <VTextField
                v-model="block.title"
                label="Título"
                placeholder="Strength"
              />
            </VCol><VCol cols="12">
              <VTextarea
                v-model="block.detailsText"
                label="Ejercicios (uno por línea)"
                rows="3"
              />
            </VCol>
          </VRow>
        </div><VBtn
          variant="tonal"
          prepend-icon="ri-add-line"
          @click="addBlock"
        >
          Agregar bloque
        </VBtn>
      </VCardText><VCardActions class="pa-6">
        <VSpacer /><VBtn
          variant="text"
          @click="dialog=false"
        >
          Cancelar
        </VBtn><VBtn
          :loading="saving"
          @click="save"
        >
          Guardar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
