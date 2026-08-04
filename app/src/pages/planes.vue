<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import { useNotifications } from '@/composables/useNotifications'
import { usePlansStore } from '@/stores/plans'
import { useSessionStore } from '@/stores/session'
import { planAccessType, planVisitLimit, type MembershipPlan, type PlanAccessType } from '@/types/domain'
import { formatCurrency } from '@/utils/kronos'

const plans = usePlansStore()
const session = useSessionStore()
const canManage = computed(() => session.can('plansManage'))
const { success, failure } = useNotifications()
const dialog = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const search = ref('')
const page = ref(1)
const perPage = 15
const form = reactive({ name: '', billingPeriod: 'monthly' as MembershipPlan['billingPeriod'], price: 0, status: 'active' as MembershipPlan['status'], accessType: 'unlimited' as PlanAccessType, visitLimit: 10 })

const periods = [
  { title: 'Mensual', value: 'monthly' },
  { title: 'Trimestral', value: 'quarterly' },
  { title: 'Otro', value: 'other' },
]

const accessTypes = [
  { title: 'Acceso libre', value: 'unlimited', subtitle: 'Sin control de número de visitas' },
  { title: 'Cuponera / paquete', value: 'visit-pack', subtitle: 'Cantidad limitada de visitas por mes' },
  { title: 'Pago por visita', value: 'pay-per-visit', subtitle: 'Acumula visitas para cobrar al cierre del mes' },
]

const filtered = computed(() => plans.items.filter(plan => `${plan.name} ${planAccessLabel(plan)}`.toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es'))))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage)))
const paginated = computed(() => filtered.value.slice((page.value - 1) * perPage, page.value * perPage))

watch(search, () => { page.value = 1 })

function planAccessLabel(plan: MembershipPlan) {
  const type = planAccessType(plan)
  if (type === 'visit-pack')
    return `Cuponera de ${planVisitLimit(plan)} visitas`
  if (type === 'pay-per-visit')
    return 'Pago por visita'

  return 'Acceso libre'
}

function openForm(plan?: MembershipPlan) {
  editingId.value = plan?.id ?? null
  form.name = plan?.name ?? ''
  form.billingPeriod = plan?.billingPeriod ?? 'monthly'
  form.price = plan?.price ?? 0
  form.status = plan?.status ?? 'active'
  form.accessType = planAccessType(plan)
  form.visitLimit = planVisitLimit(plan) ?? 10
  dialog.value = true
}

async function save() {
  if (!form.name.trim() || form.price <= 0 || (form.accessType === 'visit-pack' && form.visitLimit < 1)) {
    failure('Captura nombre, precio y configuración de visitas válidos.')

    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      billingPeriod: form.billingPeriod,
      price: Number(form.price),
      status: form.status,
      accessType: form.accessType,
      visitLimit: form.accessType === 'visit-pack' ? Number(form.visitLimit) : null,
      pricePerVisit: form.accessType === 'pay-per-visit' ? Number(form.price) : null,
    }

    if (editingId.value)
      await plans.update(editingId.value, payload)
    else
      await plans.create(payload)
    success(editingId.value ? 'Plan actualizado.' : 'Plan creado.')
    dialog.value = false
  }
  catch (error) {
    failure(error instanceof Error ? error.message : 'No fue posible guardar el plan.')
  }
  finally {
    saving.value = false
  }
}

onMounted(() => plans.subscribe())
onBeforeUnmount(() => plans.dispose())
</script>

<template>
  <PageHeader
    title="Planes"
    eyebrow="Configuración"
    description="Precios, vigencias y reglas de acceso por visitas."
  >
    <template
      v-if="canManage"
      #actions
    >
      <VBtn
        prepend-icon="ri-add-line"
        @click="openForm"
      >
        Nuevo plan
      </VBtn>
    </template>
  </PageHeader>

  <VCard
    class="kronos-card"
    rounded="xl"
  >
    <VCardText>
      <VTextField
        v-model="search"
        label="Buscar plan o tipo de acceso"
        prepend-inner-icon="ri-search-line"
        clearable
        class="mb-5"
      />
      <EmptyState
        v-if="!filtered.length"
        title="Sin planes"
        description="Crea el primer plan o cambia la búsqueda."
        icon="ri-price-tag-3-line"
      />
      <template v-else>
        <VTable>
          <thead>
            <tr>
              <th>Plan</th><th>Vigencia</th><th>Acceso</th><th>Estado</th><th class="text-right">
                Precio
              </th><th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="plan in paginated"
              :key="plan.id"
            >
              <td class="font-weight-bold">
                {{ plan.name }}
              </td>
              <td>{{ periods.find(item => item.value === plan.billingPeriod)?.title }}</td>
              <td>{{ planAccessLabel(plan) }}</td>
              <td>
                <VChip
                  :color="plan.status === 'active' ? 'success' : 'default'"
                  variant="tonal"
                  size="small"
                >
                  {{ plan.status === 'active' ? 'Activo' : 'Inactivo' }}
                </VChip>
              </td>
              <td class="text-right">
                {{ formatCurrency(plan.price) }}<div
                  v-if="planAccessType(plan) === 'pay-per-visit'"
                  class="text-caption text-medium-emphasis"
                >
                  por visita
                </div>
              </td>
              <td class="text-right">
                <VBtn
                  v-if="canManage"
                  icon="ri-edit-line"
                  variant="text"
                  aria-label="Editar plan"
                  @click="openForm(plan)"
                />
              </td>
            </tr>
          </tbody>
        </VTable>
        <VPagination
          v-if="pageCount > 1"
          v-model="page"
          :length="pageCount"
          :total-visible="5"
          class="mt-5"
        />
      </template>
    </VCardText>
  </VCard>

  <VDialog
    v-model="dialog"
    max-width="640"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        title="Plan de membresía"
        subtitle="Configura precio y forma de controlar el acceso."
      />
      <VCardText class="pa-6 d-flex flex-column ga-5">
        <VTextField
          v-model="form.name"
          label="Nombre del plan"
        />
        <VRow>
          <VCol
            cols="12"
            sm="6"
          >
            <VSelect
              v-model="form.billingPeriod"
              :items="periods"
              label="Vigencia"
            />
          </VCol>
          <VCol
            cols="12"
            sm="6"
          >
            <VSelect
              v-model="form.accessType"
              :items="accessTypes"
              label="Tipo de acceso"
            />
          </VCol>
        </VRow>
        <VTextField
          v-model.number="form.price"
          type="number"
          min="1"
          :label="form.accessType === 'pay-per-visit' ? 'Precio por visita' : 'Precio del plan'"
          prefix="$"
        />
        <VTextField
          v-if="form.accessType === 'visit-pack'"
          v-model.number="form.visitLimit"
          type="number"
          min="1"
          label="Visitas incluidas por mes"
          suffix="visitas"
          hint="La cuponera Kronos utiliza 10 visitas."
          persistent-hint
        />
        <VSwitch
          v-model="form.status"
          true-value="active"
          false-value="inactive"
          label="Plan activo"
        />
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
</template>
