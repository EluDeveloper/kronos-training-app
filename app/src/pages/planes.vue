<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import TablePaginator from '@/components/kronos/TablePaginator.vue'
import { useNotifications } from '@/composables/useNotifications'
import { usePlansStore } from '@/stores/plans'
import { useSessionStore } from '@/stores/session'
import { planAccessType, planVisitLimit, type MembershipPlan, type PlanAccessType, type PlanPromotion, type PromotionDiscountType } from '@/types/domain'
import { businessDateInMexicoCity } from '@/utils/business-date'
import { formatCurrency } from '@/utils/kronos'

const plans = usePlansStore()
const session = useSessionStore()
const canManage = computed(() => session.can('plansManage'))
const { success, failure } = useNotifications()
const dialog = ref(false)
const promotionDialog = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const editingPromotionId = ref<string | null>(null)
const search = ref('')
const page = ref(1)
const perPage = ref(15)
const promotionPage = ref(1)
const promotionPerPage = ref(15)
const form = reactive({ name: '', billingPeriod: 'monthly' as MembershipPlan['billingPeriod'], price: 0, status: 'active' as MembershipPlan['status'], accessType: 'unlimited' as PlanAccessType, visitLimit: 10 })
const promotionForm = reactive({ name: '', discountType: 'percentage' as PromotionDiscountType, discountValue: 0, validFrom: businessDateInMexicoCity(), validThrough: businessDateInMexicoCity(), planIds: [] as string[], allSchedules: true, schedules: ['Matutino', 'Vespertino'] as string[], status: 'active' as PlanPromotion['status'] })

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
const paginated = computed(() => filtered.value.slice((page.value - 1) * perPage.value, page.value * perPage.value))
const paginatedPromotions = computed(() => plans.promotions.slice((promotionPage.value - 1) * promotionPerPage.value, promotionPage.value * promotionPerPage.value))

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

function openCreateForm() {
  openForm()
}

function openPromotionForm(promotion?: PlanPromotion) {
  editingPromotionId.value = promotion?.id ?? null
  Object.assign(promotionForm, promotion ? {
    name: promotion.name, discountType: promotion.discountType, discountValue: promotion.discountValue,
    validFrom: promotion.validFrom, validThrough: promotion.validThrough, planIds: Object.keys(promotion.planIds),
    allSchedules: promotion.schedules === 'all', schedules: promotion.schedules === 'all' ? ['Matutino', 'Vespertino'] : [...promotion.schedules], status: promotion.status,
  } : { name: '', discountType: 'percentage', discountValue: 0, validFrom: businessDateInMexicoCity(), validThrough: businessDateInMexicoCity(), planIds: [], allSchedules: true, schedules: ['Matutino', 'Vespertino'], status: 'active' })
  promotionDialog.value = true
}

async function savePromotion() {
  if (!promotionForm.name.trim() || !promotionForm.planIds.length || promotionForm.validFrom > promotionForm.validThrough || promotionForm.discountValue <= 0 || (promotionForm.discountType === 'percentage' && promotionForm.discountValue >= 100) || (!promotionForm.allSchedules && !promotionForm.schedules.length)) {
    failure('Captura nombre, descuento, vigencia, planes y horarios válidos.')

    return
  }
  const selectedPrices = promotionForm.planIds.map(id => plans.items.find(plan => plan.id === id)?.price).filter((price): price is number => typeof price === 'number')
  if (promotionForm.discountType === 'fixed-amount' && selectedPrices.length && promotionForm.discountValue > Math.min(...selectedPrices)) {
    failure('El descuento fijo no puede superar el precio del plan aplicable más económico.')

    return
  }
  saving.value = true
  try {
    const payload = { name: promotionForm.name.trim(), discountType: promotionForm.discountType, discountValue: Number(promotionForm.discountValue), validFrom: promotionForm.validFrom, validThrough: promotionForm.validThrough, planIds: Object.fromEntries(promotionForm.planIds.map(id => [id, true])) as Record<string, true>, schedules: promotionForm.allSchedules ? 'all' as const : [...promotionForm.schedules], status: promotionForm.status }
    if (editingPromotionId.value) await plans.updatePromotion(editingPromotionId.value, payload)
    else await plans.createPromotion(payload)
    success(editingPromotionId.value ? 'Promoción actualizada.' : 'Promoción creada.')
    promotionDialog.value = false
  }
  catch (error) { failure(error instanceof Error ? error.message : 'No fue posible guardar la promoción.') }
  finally { saving.value = false }
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
        variant="tonal"
        prepend-icon="ri-coupon-3-line"
        @click="() => openPromotionForm()"
      >
        Nueva promoción
      </VBtn>
      <VBtn
        prepend-icon="ri-add-line"
        @click="openCreateForm"
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
        <TablePaginator v-model:page="page" v-model:page-size="perPage" :total="filtered.length" label="planes" />
      </template>
    </VCardText>
  </VCard>

  <VCard class="kronos-card mt-5" rounded="xl">
    <VCardItem title="Promociones" subtitle="Vigencia, planes y horarios elegibles" />
    <VCardText>
      <EmptyState v-if="!plans.promotions.length" title="Sin promociones" description="Configura descuentos porcentuales o de monto fijo." icon="ri-coupon-3-line" />
      <template v-else>
        <VTable class="text-no-wrap">
          <thead><tr><th>Promoción</th><th>Descuento</th><th>Vigencia</th><th>Horarios</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody><tr v-for="promotion in paginatedPromotions" :key="promotion.id">
            <td><strong>{{ promotion.name }}</strong><div class="text-caption">{{ Object.keys(promotion.planIds).map(id => plans.items.find(plan => plan.id === id)?.name ?? id).join(', ') }}</div></td>
            <td>{{ promotion.discountType === 'percentage' ? `${promotion.discountValue}%` : formatCurrency(promotion.discountValue) }}</td>
            <td>{{ promotion.validFrom }}–{{ promotion.validThrough }}</td><td>{{ promotion.schedules === 'all' ? 'Todos' : promotion.schedules.join(', ') }}</td>
            <td><VChip size="small" :color="promotion.status === 'active' ? 'success' : 'default'">{{ promotion.status === 'active' ? 'Activa' : 'Inactiva' }}</VChip></td>
            <td><VBtn v-if="canManage" icon="ri-edit-line" variant="text" :aria-label="`Editar promoción ${promotion.name}`" @click="openPromotionForm(promotion)" /></td>
          </tr></tbody>
        </VTable>
        <TablePaginator v-model:page="promotionPage" v-model:page-size="promotionPerPage" :total="plans.promotions.length" label="promociones" />
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
  <VDialog v-model="promotionDialog" max-width="720">
    <VCard class="kronos-card" rounded="xl">
      <VCardItem class="pa-6 pb-2" :title="editingPromotionId ? 'Editar promoción' : 'Nueva promoción'" subtitle="No se acumula con otras promociones; se aplicará el mayor ahorro." />
      <VCardText class="pa-6 d-flex flex-column ga-4">
        <VTextField v-model="promotionForm.name" label="Nombre de la promoción" />
        <VRow><VCol cols="12" sm="6"><VSelect v-model="promotionForm.discountType" :items="[{ title: 'Porcentaje', value: 'percentage' }, { title: 'Monto fijo', value: 'fixed-amount' }]" label="Tipo de descuento" /></VCol><VCol cols="12" sm="6"><VTextField v-model.number="promotionForm.discountValue" type="number" min="0.01" :max="promotionForm.discountType === 'percentage' ? 99.99 : undefined" :prefix="promotionForm.discountType === 'fixed-amount' ? '$' : undefined" :suffix="promotionForm.discountType === 'percentage' ? '%' : undefined" label="Descuento" /></VCol></VRow>
        <VRow><VCol cols="12" sm="6"><VTextField v-model="promotionForm.validFrom" type="date" label="Vigente desde" /></VCol><VCol cols="12" sm="6"><VTextField v-model="promotionForm.validThrough" type="date" label="Vigente hasta" /></VCol></VRow>
        <VSelect v-model="promotionForm.planIds" :items="plans.items.map(plan => ({ title: plan.name, value: plan.id }))" label="Planes aplicables" multiple chips closable-chips />
        <VSwitch v-model="promotionForm.allSchedules" label="Aplica a todos los horarios" color="secondary" />
        <VSelect v-if="!promotionForm.allSchedules" v-model="promotionForm.schedules" :items="['Matutino', 'Vespertino']" label="Horarios aplicables" multiple chips />
        <VSwitch v-model="promotionForm.status" true-value="active" false-value="inactive" label="Promoción activa" />
      </VCardText>
      <VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="promotionDialog = false">Cancelar</VBtn><VBtn :loading="saving" @click="savePromotion">Guardar promoción</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>
