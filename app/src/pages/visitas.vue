<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MembershipPaymentDialog from '@/components/kronos/MembershipPaymentDialog.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { useCommerceStore } from '@/stores/commerce'
import { usePaymentsStore } from '@/stores/payments'
import { usePlansStore } from '@/stores/plans'
import { useVisitsStore } from '@/stores/visits'
import { currentPeriod, planAccessType, planVisitLimit, planVisitPrice, type Payment, type Visit } from '@/types/domain'
import { formatCurrency, formatDate, saleBalance, timestampValue } from '@/utils/kronos'
import { buildMembershipReceipt, buildRenewalReminder, buildVisitStatement, type ReceiptData } from '@/utils/receipts'

const athletes = useAthletesStore()
const plans = usePlansStore()
const visits = useVisitsStore()
const commerce = useCommerceStore()
const payments = usePaymentsStore()
const { success, failure } = useNotifications()
const period = ref(currentPeriod())
const selectedAthleteId = ref('')
const visitDialog = ref(false)
const saving = ref(false)
const page = ref(1)
const perPage = 15
const receiptDialog = ref(false)
const activeReceipt = ref<ReceiptData | null>(null)
const paymentDialog = ref(false)
const paymentAmount = ref(0)
const paymentConcept = ref('')
const paymentVisitCount = ref(0)
const form = reactive({ athleteId: '', visitedAt: new Date().toISOString().slice(0, 16), note: '' })

const athleteItems = computed(() => athletes.active.map(athlete => ({ title: athlete.profile.name, value: athlete.id, subtitle: plans.items.find(plan => plan.id === athlete.membership.planId)?.name ?? 'Plan no disponible' })))
const selectedAthlete = computed(() => athletes.items.find(athlete => athlete.id === selectedAthleteId.value) ?? null)
const selectedPlan = computed(() => plans.items.find(plan => plan.id === selectedAthlete.value?.membership.planId) ?? null)
const selectedAccessType = computed(() => planAccessType(selectedPlan.value))
const selectedVisitLimit = computed(() => planVisitLimit(selectedPlan.value))
const selectedUnitPrice = computed(() => planVisitPrice(selectedPlan.value))
const selectedVisits = computed(() => visits.items
  .filter(visit => visit.athleteId === selectedAthleteId.value && visit.period === period.value)
  .sort((a, b) => timestampValue(b.visitedAt) - timestampValue(a.visitedAt)))
const remainingVisits = computed(() => selectedVisitLimit.value === null ? null : Math.max(0, selectedVisitLimit.value - selectedVisits.value.length))
const accumulatedAmount = computed(() => selectedVisits.value.length * selectedUnitPrice.value)
const athleteOpenSales = computed(() => commerce.openCredit.filter(sale => sale.athleteId === selectedAthleteId.value))
const athleteStoreDebt = computed(() => athleteOpenSales.value.reduce((sum, sale) => sum + saleBalance(sale), 0))
const periodPaid = computed(() => payments.paid.some(payment => payment.athleteId === selectedAthleteId.value && payment.period === period.value))
const filteredHistory = computed(() => visits.items
  .filter(visit => visit.period === period.value)
  .filter(visit => !selectedAthleteId.value || visit.athleteId === selectedAthleteId.value)
  .sort((a, b) => timestampValue(b.visitedAt) - timestampValue(a.visitedAt)))
const pageCount = computed(() => Math.max(1, Math.ceil(filteredHistory.value.length / perPage)))
const paginatedHistory = computed(() => filteredHistory.value.slice((page.value - 1) * perPage, page.value * perPage))

watch(() => athletes.active.length, () => {
  if (!selectedAthleteId.value)
    selectedAthleteId.value = athletes.active[0]?.id ?? ''
}, { immediate: true })
watch([selectedAthleteId, period], () => { page.value = 1 })

const athleteName = (id: string) => athletes.items.find(athlete => athlete.id === id)?.profile.name ?? 'Atleta'

function nextPeriod(value: string) {
  const [year, month] = value.split('-').map(Number)
  const date = new Date(year, month, 1)

  return currentPeriod(date)
}

function openVisitForm() {
  form.athleteId = selectedAthleteId.value || athletes.active[0]?.id || ''
  form.visitedAt = new Date().toISOString().slice(0, 16)
  form.note = ''
  visitDialog.value = true
}

async function saveVisit() {
  const athlete = athletes.items.find(item => item.id === form.athleteId)
  const plan = plans.items.find(item => item.id === athlete?.membership.planId)
  const visitedAt = new Date(form.visitedAt)
  if (!athlete || !plan || Number.isNaN(visitedAt.getTime())) {
    failure('Selecciona atleta, plan y fecha válidos.')
    return
  }

  const visitPeriod = currentPeriod(visitedAt)
  const accessType = planAccessType(plan)
  const limit = planVisitLimit(plan)
  const used = visits.items.filter(visit => visit.athleteId === athlete.id && visit.period === visitPeriod).length
  if (accessType === 'visit-pack' && limit !== null && used >= limit) {
    failure(`La cuponera ya alcanzó sus ${limit} visitas en ${visitPeriod}.`)
    return
  }

  saving.value = true
  try {
    await visits.create({
      athleteId: athlete.id,
      period: visitPeriod,
      visitedAt: visitedAt.getTime(),
      planId: plan.id,
      accessType,
      unitPrice: planVisitPrice(plan),
      note: form.note.trim() || null,
    })
    selectedAthleteId.value = athlete.id
    period.value = visitPeriod
    success('Visita registrada.')
    visitDialog.value = false
  }
  catch (error) {
    failure(error instanceof Error ? error.message : 'No fue posible registrar la visita.')
  }
  finally {
    saving.value = false
  }
}

async function removeVisit(visit: Visit) {
  if (!confirm(`¿Eliminar la visita de ${athleteName(visit.athleteId)}?`))
    return
  try {
    await visits.remove(visit)
    success('Visita eliminada.',)
  }
  catch (error) {
    failure(error instanceof Error ? error.message : 'No fue posible eliminar la visita.')
  }
}

function showVisitStatement() {
  if (!selectedAthlete.value || selectedVisits.value.length === 0) {
    failure('Registra al menos una visita para generar el estado de cuenta.')
    return
  }
  activeReceipt.value = buildVisitStatement(selectedAthlete.value, period.value, selectedVisits.value.length, selectedUnitPrice.value, athleteOpenSales.value)
  receiptDialog.value = true
}

function showRenewalReminder() {
  if (!selectedAthlete.value || !selectedPlan.value || selectedVisitLimit.value === null)
    return
  activeReceipt.value = buildRenewalReminder(selectedAthlete.value, nextPeriod(period.value), selectedPlan.value.name, selectedVisitLimit.value, selectedPlan.value.price, athleteOpenSales.value)
  receiptDialog.value = true
}

function openVisitPayment() {
  if (accumulatedAmount.value <= 0 || !selectedAthlete.value) {
    failure('No hay visitas acumuladas por cobrar.')
    return
  }
  paymentAmount.value = accumulatedAmount.value
  paymentVisitCount.value = selectedVisits.value.length
  paymentConcept.value = `${selectedVisits.value.length} visitas acumuladas ${period.value}`
  paymentDialog.value = true
}

function showPaymentReceipt(payment: Payment) {
  const athlete = athletes.items.find(item => item.id === payment.athleteId)
  if (!athlete)
    return
  activeReceipt.value = buildMembershipReceipt(payment, athlete, selectedPlan.value?.name)
  receiptDialog.value = true
}

onMounted(() => { athletes.subscribe(); plans.subscribe(); visits.subscribe(); commerce.subscribe(); payments.subscribe() })
onBeforeUnmount(() => { athletes.dispose(); plans.dispose(); visits.dispose(); commerce.dispose(); payments.dispose() })
</script>

<template>
  <PageHeader title="Visitas" eyebrow="Asistencia" description="Control mensual, cobro acumulado y renovación de cuponeras.">
    <template #actions><VBtn prepend-icon="ri-user-follow-line" :disabled="!athletes.active.length" @click="openVisitForm">Registrar visita</VBtn></template>
  </PageHeader>

  <VCard class="kronos-card mb-5" rounded="xl">
    <VCardText>
      <VRow>
        <VCol cols="12" md="8"><VAutocomplete v-model="selectedAthleteId" :items="athleteItems" label="Buscar atleta" prepend-inner-icon="ri-search-line" clearable auto-select-first /></VCol>
        <VCol cols="12" md="4"><VTextField v-model="period" type="month" label="Periodo" /></VCol>
      </VRow>
    </VCardText>
  </VCard>

  <template v-if="selectedAthlete">
    <VRow class="mb-2">
      <VCol cols="12" sm="6" lg="3"><MetricCard label="Visitas del mes" :value="selectedVisits.length" icon="ri-footprint-line" :detail="selectedPlan?.name ?? 'Sin plan'" /></VCol>
      <VCol cols="12" sm="6" lg="3"><MetricCard label="Visitas restantes" :value="remainingVisits === null ? 'Sin límite' : remainingVisits" icon="ri-coupon-3-line" :color="remainingVisits !== null && remainingVisits <= 2 ? 'warning' : 'secondary'" :detail="selectedVisitLimit ? `de ${selectedVisitLimit}` : 'Acceso libre'" /></VCol>
      <VCol cols="12" sm="6" lg="3"><MetricCard label="Acumulado por visitas" :value="formatCurrency(accumulatedAmount)" icon="ri-hand-coin-line" color="success" :detail="selectedAccessType === 'pay-per-visit' ? `${formatCurrency(selectedUnitPrice)} por visita` : 'No aplica cobro individual'" /></VCol>
      <VCol cols="12" sm="6" lg="3"><MetricCard label="Adeudo de tienda" :value="formatCurrency(athleteStoreDebt)" icon="ri-shopping-bag-3-line" :color="athleteStoreDebt > 0 ? 'error' : 'success'" detail="Incluido en avisos" /></VCol>
    </VRow>

    <VCard v-if="selectedAccessType === 'visit-pack'" class="kronos-card mb-5" rounded="xl">
      <VCardText>
        <div class="d-flex flex-wrap justify-space-between align-center ga-4 mb-4">
          <div><div class="text-h6 font-weight-bold">Cuponera {{ selectedVisits.length }} / {{ selectedVisitLimit }}</div><div class="text-body-2 text-medium-emphasis">Las visitas se reinician al cambiar de periodo.</div></div>
          <VBtn v-if="remainingVisits !== null && remainingVisits <= 2" prepend-icon="ri-whatsapp-line" color="warning" @click="showRenewalReminder">Enviar renovación</VBtn>
        </div>
        <VProgressLinear :model-value="selectedVisitLimit ? selectedVisits.length / selectedVisitLimit * 100 : 0" height="14" rounded color="secondary" />
        <VAlert v-if="remainingVisits !== null && remainingVisits <= 2" color="warning" variant="tonal" class="mt-4">{{ remainingVisits === 0 ? 'La cuponera agotó sus visitas.' : `Sólo quedan ${remainingVisits} visitas. Es momento de enviar el recordatorio de renovación.` }}</VAlert>
      </VCardText>
    </VCard>

    <VAlert v-else-if="selectedAccessType === 'unlimited'" color="info" variant="tonal" class="mb-5">Este plan tiene acceso libre. Las visitas se registran como asistencia, sin límite ni cobro individual. Puedes cambiar el tipo desde <RouterLink to="/planes">Planes</RouterLink>.</VAlert>

    <VCard v-else class="kronos-card mb-5" rounded="xl">
      <VCardText class="d-flex flex-wrap align-center justify-space-between ga-4">
        <div><div class="text-h6 font-weight-bold">Cobro por visitas</div><div class="text-body-2 text-medium-emphasis">{{ selectedVisits.length }} visitas × {{ formatCurrency(selectedUnitPrice) }} = {{ formatCurrency(accumulatedAmount) }}</div></div>
        <div class="d-flex flex-wrap ga-2"><VBtn variant="tonal" prepend-icon="ri-whatsapp-line" :disabled="!selectedVisits.length" @click="showVisitStatement">Enviar estado de cuenta</VBtn><VBtn prepend-icon="ri-wallet-3-line" :disabled="!selectedVisits.length || periodPaid" @click="openVisitPayment">{{ periodPaid ? 'Periodo pagado' : 'Cobrar visitas' }}</VBtn></div>
      </VCardText>
    </VCard>
  </template>

  <VCard class="kronos-card" rounded="xl">
    <VCardItem title="Historial de visitas" :subtitle="`${filteredHistory.length} registros en ${period}`" />
    <VCardText>
      <EmptyState v-if="!filteredHistory.length" title="Sin visitas en este periodo" description="Registra la primera asistencia del atleta." icon="ri-footprint-line" />
      <template v-else>
        <VTable>
          <thead><tr><th>Fecha</th><th>Atleta</th><th>Tipo</th><th>Nota</th><th></th></tr></thead>
          <tbody><tr v-for="visit in paginatedHistory" :key="visit.id"><td>{{ formatDate(visit.visitedAt) }}</td><td class="font-weight-bold">{{ athleteName(visit.athleteId) }}</td><td><VChip size="small" variant="tonal">{{ visit.accessType === 'visit-pack' ? 'Cuponera' : visit.accessType === 'pay-per-visit' ? 'Por visita' : 'Libre' }}</VChip></td><td>{{ visit.note || '—' }}</td><td class="text-right"><VBtn icon="ri-delete-bin-line" color="error" variant="text" title="Eliminar visita" @click="removeVisit(visit)" /></td></tr></tbody>
        </VTable>
        <VPagination v-if="pageCount > 1" v-model="page" :length="pageCount" :total-visible="5" class="mt-5" />
      </template>
    </VCardText>
  </VCard>

  <VDialog v-model="visitDialog" max-width="620">
    <VCard class="kronos-card" rounded="xl">
      <VCardItem class="pa-6 pb-2" title="Registrar visita" subtitle="La visita se asignará al periodo correspondiente a su fecha." />
      <VCardText class="pa-6 d-flex flex-column ga-5">
        <VAutocomplete v-model="form.athleteId" :items="athleteItems" label="Buscar atleta" prepend-inner-icon="ri-search-line" clearable auto-select-first />
        <VTextField v-model="form.visitedAt" type="datetime-local" label="Fecha y hora" />
        <VTextField v-model="form.note" label="Nota (opcional)" />
      </VCardText>
      <VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="visitDialog = false">Cancelar</VBtn><VBtn :loading="saving" @click="saveVisit">Registrar visita</VBtn></VCardActions>
    </VCard>
  </VDialog>

  <MembershipPaymentDialog v-model="paymentDialog" :athlete-id="selectedAthleteId" :period="period" :amount="paymentAmount" :concept="paymentConcept" :visit-count="paymentVisitCount" title="Cobrar visitas acumuladas" subtitle="El pago se registrará en el periodo seleccionado y generará su recibo." lock-athlete @saved="showPaymentReceipt" />
  <ReceiptDialog v-model="receiptDialog" :receipt="activeReceipt" />
</template>
