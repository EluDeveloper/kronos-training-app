<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { usePlansStore } from '@/stores/plans'
import { useSessionStore } from '@/stores/session'
import type { Athlete } from '@/types/domain'
import { calculateAge } from '@/types/domain'
import { formatCurrency } from '@/utils/kronos'

const athletes = useAthletesStore()
const plans = usePlansStore()
const session = useSessionStore()
const canManage = computed(() => session.can('athletesManage'))
const { success, failure } = useNotifications()
const search = ref('')
const statusFilter = ref<string | null>(null)
const planFilter = ref<string | null>(null)
const page = ref(1)
const perPage = 15
const dialog = ref(false)
const kioskCodeDialog = ref(false)
const saving = ref(false)
const kioskCodeSaving = ref(false)
const editingId = ref<string | null>(null)
const kioskCodeAthlete = ref<Athlete | null>(null)
const kioskCode = ref('')
const kioskCodePersisted = ref(false)
const kioskCodeCopied = ref(false)

const form = reactive({
  name: '', phone: '', birthDate: '', schedule: '06:00 AM', planId: '', agreedAmount: 0,
  paymentDay: 1, registrationDate: new Date().toISOString().slice(0, 10),
})

const filtered = computed(() => athletes.sorted
  .filter(athlete => !statusFilter.value || athlete.status === statusFilter.value)
  .filter(athlete => !planFilter.value || athlete.membership.planId === planFilter.value)
  .filter(athlete => `${athlete.profile.name} ${athlete.profile.phone} ${athlete.membership.schedule}`.toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es'))))

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage)))
const paginated = computed(() => filtered.value.slice((page.value - 1) * perPage, page.value * perPage))
const planItems = computed(() => plans.active.map(plan => ({ title: `${plan.name} · ${formatCurrency(plan.price)}`, value: plan.id })))
const planFilterItems = computed(() => plans.items.map(plan => ({ title: plan.name, value: plan.id })))
const planName = (id: string) => plans.items.find(plan => plan.id === id)?.name ?? 'Plan no disponible'

watch(() => form.planId, id => {
  const plan = plans.items.find(item => item.id === id)
  if (plan && !editingId.value)
    form.agreedAmount = plan.price
})
watch([search, statusFilter, planFilter], () => { page.value = 1 })

function openForm(athlete?: Athlete) {
  editingId.value = athlete?.id ?? null
  form.name = athlete?.profile.name ?? ''
  form.phone = athlete?.profile.phone ?? ''
  form.birthDate = athlete?.profile.birthDate ?? ''
  form.schedule = athlete?.membership.schedule ?? '06:00 AM'
  form.planId = athlete?.membership.planId ?? plans.active[0]?.id ?? ''
  form.agreedAmount = athlete?.membership.agreedAmount ?? plans.active[0]?.price ?? 0
  form.paymentDay = athlete?.membership.paymentDay ?? 1
  form.registrationDate = athlete?.membership.registrationDate ?? new Date().toISOString().slice(0, 10)
  dialog.value = true
}

function openCreateForm() {
  openForm()
}

async function save() {
  const phone = form.phone.replace(/\D/g, '')
  if (!form.name.trim() || phone.length !== 10 || !form.planId || form.agreedAmount <= 0 || form.paymentDay < 1 || form.paymentDay > 31) {
    failure('Revisa nombre, teléfono, plan, monto y día de pago.')

    return
  }

  const existing = athletes.items.find(item => item.id === editingId.value)

  const payload = {
    profile: { name: form.name.trim(), phone, birthDate: form.birthDate || null },
    membership: {
      schedule: form.schedule, planId: form.planId, agreedAmount: Number(form.agreedAmount),
      paymentDay: Number(form.paymentDay), registrationDate: form.registrationDate,
    },
    status: existing?.status ?? 'active' as const,
    inactiveAt: existing?.inactiveAt ?? null,
    inactiveReason: existing?.inactiveReason ?? null,
  }

  saving.value = true
  try {
    if (editingId.value)
      await athletes.update(editingId.value, payload)
    else
      await athletes.create(payload)
    success(editingId.value ? 'Atleta actualizado.' : 'Atleta registrado.')
    dialog.value = false
  }
  catch (error) { failure(error instanceof Error ? error.message : 'No fue posible guardar el atleta.') }
  finally { saving.value = false }
}

async function toggleStatus(athlete: Athlete) {
  try {
    const next = athlete.status === 'active' ? 'inactive' : 'active'

    await athletes.setStatus(athlete.id, next)
    success(next === 'active' ? 'Atleta reactivado.' : 'Atleta pausado.')
  }
  catch (error) { failure(error instanceof Error ? error.message : 'No fue posible cambiar el estado.') }
}

function generateKioskCode() {
  const values = new Uint32Array(1)
  let candidate = ''

  do {
    crypto.getRandomValues(values)
    candidate = String(values[0] % 1_000_000).padStart(6, '0')
  } while (athletes.items.some(athlete => athlete.id !== kioskCodeAthlete.value?.id && athlete.kioskCode === candidate))

  kioskCode.value = candidate
  kioskCodePersisted.value = false
}

function openKioskCode(athlete: Athlete) {
  kioskCodeAthlete.value = athlete
  kioskCode.value = athlete.kioskCode ?? ''
  kioskCodePersisted.value = Boolean(athlete.kioskCode)
  kioskCodeCopied.value = false
  kioskCodeDialog.value = true
}

async function saveKioskCode() {
  const athlete = kioskCodeAthlete.value
  if (!athlete || !/^\d{6}$/.test(kioskCode.value)) {
    failure('El código personal debe contener exactamente 6 dígitos.')

    return
  }
  if (athletes.items.some(item => item.id !== athlete.id && item.kioskCode === kioskCode.value)) {
    failure('Ese código ya pertenece a otro atleta. Genera uno nuevo.')

    return
  }

  kioskCodeSaving.value = true
  try {
    await athletes.update(athlete.id, { kioskCode: kioskCode.value })
    kioskCodeAthlete.value = { ...athlete, kioskCode: kioskCode.value }
    kioskCodePersisted.value = true
    success('Código personal guardado. Ya puedes compartirlo con el atleta.')
  }
  catch (error) { failure(error instanceof Error ? error.message : 'No fue posible guardar el código personal.') }
  finally { kioskCodeSaving.value = false }
}

async function copyKioskCode() {
  if (!kioskCodeAthlete.value || !kioskCodePersisted.value)
    return

  await navigator.clipboard.writeText(`Tu código personal para el kiosco de Kronos es: ${kioskCode.value}`)
  kioskCodeCopied.value = true
  window.setTimeout(() => { kioskCodeCopied.value = false }, 2200)
}

function sendKioskCodeByWhatsApp() {
  const athlete = kioskCodeAthlete.value
  if (!athlete || !kioskCodePersisted.value)
    return

  const phone = athlete.profile.phone.replace(/\D/g, '')
  const message = encodeURIComponent(`Hola ${athlete.profile.name}. Tu código personal para registrar compras en el kiosco de Kronos es: ${kioskCode.value}. No lo compartas con otras personas.`)

  window.open(`https://web.whatsapp.com/send?phone=52${phone}&text=${message}`, '_blank', 'noopener,noreferrer')
}

onMounted(() => { athletes.subscribe(); plans.subscribe() })
onBeforeUnmount(() => { athletes.dispose(); plans.dispose() })
</script>

<template>
  <PageHeader
    title="Atletas"
    eyebrow="Directorio"
    description="Perfiles, planes y estado de las membresías."
  >
    <template
      v-if="canManage"
      #actions
    >
      <VBtn
        prepend-icon="ri-user-add-line"
        @click="openCreateForm"
      >
        Nuevo atleta
      </VBtn>
    </template>
  </PageHeader>

  <VCard
    class="kronos-card"
    rounded="xl"
  >
    <VCardText>
      <VRow class="mb-2">
        <VCol
          cols="12"
          lg="6"
        >
          <VTextField
            v-model="search"
            prepend-inner-icon="ri-search-line"
            label="Buscar nombre, teléfono u horario"
            clearable
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <VAutocomplete
            v-model="planFilter"
            :items="planFilterItems"
            label="Plan"
            clearable
            auto-select-first
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <VSelect
            v-model="statusFilter"
            :items="[{ title: 'Activos', value: 'active' }, { title: 'Inactivos', value: 'inactive' }]"
            label="Estado"
            clearable
          />
        </VCol>
      </VRow>
      <EmptyState
        v-if="!filtered.length"
        title="Sin atletas"
        description="Registra el primer atleta o cambia la búsqueda."
        icon="ri-team-line"
      />
      <template v-else>
        <VTable>
          <thead><tr><th>Atleta</th><th>Plan</th><th>Horario</th><th>Día de pago</th><th>Estado</th><th /></tr></thead>
          <tbody>
            <tr
              v-for="athlete in paginated"
              :key="athlete.id"
            >
              <td>
                <p class="font-weight-bold mb-0">
                  {{ athlete.profile.name }}
                </p><span class="text-caption text-medium-emphasis">{{ athlete.profile.phone }}<template v-if="calculateAge(athlete.profile.birthDate) !== null"> · {{ calculateAge(athlete.profile.birthDate) }} años</template></span>
              </td>
              <td>{{ planName(athlete.membership.planId) }}<br><span class="text-caption text-medium-emphasis">{{ formatCurrency(athlete.membership.agreedAmount) }}</span></td>
              <td>{{ athlete.membership.schedule }}</td>
              <td>Día {{ athlete.membership.paymentDay }}</td>
              <td>
                <VChip
                  :color="athlete.status === 'active' ? 'success' : 'default'"
                  size="small"
                  variant="tonal"
                >
                  {{ athlete.status === 'active' ? 'Activo' : 'Inactivo' }}
                </VChip>
              </td>
              <td class="text-right">
                <template v-if="canManage">
                  <VBtn
                    v-if="session.isAdmin"
                    icon="ri-key-2-line"
                    variant="text"
                    aria-label="Código de kiosco"
                    @click="openKioskCode(athlete)"
                  />
                  <VBtn
                    icon="ri-edit-line"
                    variant="text"
                    aria-label="Editar atleta"
                    @click="openForm(athlete)"
                  /><VBtn
                    :icon="athlete.status === 'active' ? 'ri-pause-circle-line' : 'ri-play-circle-line'"
                    variant="text"
                    :aria-label="athlete.status === 'active' ? 'Pausar atleta' : 'Activar atleta'"
                    @click="toggleStatus(athlete)"
                  />
                </template>
              </td>
            </tr>
          </tbody>
        </VTable>
        <div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-5">
          <span class="text-caption text-medium-emphasis">{{ filtered.length }} atletas · máximo 15 por página</span><VPagination
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
    max-width="760"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        :title="editingId ? 'Editar atleta' : 'Nuevo atleta'"
        subtitle="Datos personales y configuración de la membresía."
      />
      <VCardText class="pa-6">
        <VRow>
          <VCol
            cols="12"
            md="7"
          >
            <VTextField
              v-model="form.name"
              label="Nombre completo"
            />
          </VCol>
          <VCol
            cols="12"
            md="5"
          >
            <VTextField
              v-model="form.phone"
              label="Teléfono"
              maxlength="10"
            />
          </VCol>
          <VCol
            cols="12"
            md="4"
          >
            <VTextField
              v-model="form.birthDate"
              type="date"
              label="Fecha de nacimiento"
            />
          </VCol>
          <VCol
            cols="12"
            md="4"
          >
            <VTextField
              v-model="form.schedule"
              label="Horario base"
            />
          </VCol>
          <VCol
            cols="12"
            md="4"
          >
            <VTextField
              v-model="form.registrationDate"
              type="date"
              label="Fecha de registro"
            />
          </VCol>
          <VCol
            cols="12"
            md="6"
          >
            <VAutocomplete
              v-model="form.planId"
              :items="planItems"
              label="Buscar plan"
              prepend-inner-icon="ri-search-line"
              auto-select-first
            />
          </VCol>
          <VCol
            cols="6"
            md="3"
          >
            <VTextField
              v-model.number="form.agreedAmount"
              type="number"
              min="1"
              label="Monto"
              prefix="$"
            />
          </VCol>
          <VCol
            cols="6"
            md="3"
          >
            <VTextField
              v-model.number="form.paymentDay"
              type="number"
              min="1"
              max="31"
              label="Día de pago"
            />
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
          :loading="saving"
          @click="save"
        >
          Guardar
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

  <VDialog
    v-model="kioskCodeDialog"
    max-width="560"
    persistent
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        title="Código personal del kiosco"
        :subtitle="kioskCodeAthlete?.profile.name"
      />
      <VCardText class="pa-6 d-flex flex-column ga-5">
        <VAlert
          color="info"
          variant="tonal"
          icon="ri-shield-keyhole-line"
        >
          El atleta utilizará este código para asignar sus compras. Puedes regenerarlo si deja de ser privado.
        </VAlert>
        <VTextField
          v-model="kioskCode"
          inputmode="numeric"
          maxlength="6"
          label="Código de 6 dígitos"
          prepend-inner-icon="ri-key-2-line"
          :hint="kioskCodePersisted ? 'Código guardado y listo para compartir.' : 'Guarda el código antes de compartirlo.'"
          persistent-hint
          @update:model-value="kioskCodePersisted = false"
        >
          <template #append>
            <VBtn
              icon="ri-magic-line"
              variant="text"
              aria-label="Generar código"
              @click="generateKioskCode"
            />
          </template>
        </VTextField>
        <div
          v-if="kioskCodePersisted"
          class="d-flex flex-column flex-sm-row ga-3"
        >
          <VBtn
            variant="tonal"
            :prepend-icon="kioskCodeCopied ? 'ri-check-line' : 'ri-file-copy-line'"
            @click="copyKioskCode"
          >
            {{ kioskCodeCopied ? 'Copiado' : 'Copiar mensaje' }}
          </VBtn>
          <VBtn
            color="success"
            variant="tonal"
            prepend-icon="ri-whatsapp-line"
            @click="sendKioskCodeByWhatsApp"
          >
            Enviar por WhatsApp
          </VBtn>
        </div>
      </VCardText>
      <VCardActions class="pa-6 pt-0">
        <VSpacer />
        <VBtn
          variant="text"
          :disabled="kioskCodeSaving"
          @click="kioskCodeDialog = false"
        >
          Cerrar
        </VBtn>
        <VBtn
          :loading="kioskCodeSaving"
          @click="saveKioskCode"
        >
          Guardar código
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
