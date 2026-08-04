<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MembershipPaymentDialog from '@/components/kronos/MembershipPaymentDialog.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import VisitorPaymentDialog from '@/components/kronos/VisitorPaymentDialog.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { useCommerceStore } from '@/stores/commerce'
import { usePaymentsStore } from '@/stores/payments'
import { usePlansStore } from '@/stores/plans'
import { useVisitorsStore } from '@/stores/visitors'
import { useVisitsStore } from '@/stores/visits'
import { currentPeriod, planAccessType, planVisitLimit, planVisitPrice, type Payment, type Visit } from '@/types/domain'
import { formatCurrency, formatDate, saleBalance, timestampValue } from '@/utils/kronos'
import { buildMembershipReceipt, buildRenewalReminder, buildVisitorVisitReceipt, buildVisitStatement, type ReceiptData } from '@/utils/receipts'

const athletes = useAthletesStore()
const visitors = useVisitorsStore()
const plans = usePlansStore()
const visits = useVisitsStore()
const commerce = useCommerceStore()
const payments = usePaymentsStore()
const route = useRoute()
const { success, failure } = useNotifications()
const period = ref(currentPeriod())
const selectedSubjectKey = ref('')
const visitDialog = ref(false)
const saving = ref(false)
const page = ref(1)
const perPage = 15
const receiptDialog = ref(false)
const activeReceipt = ref<ReceiptData | null>(null)
const memberPaymentDialog = ref(false)
const visitorPaymentDialog = ref(false)
const paymentAmount = ref(0)
const paymentConcept = ref('')
const paymentVisitCount = ref(0)

const localDateTimeValue = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

const form = reactive({
  subjectType: 'athlete' as 'athlete' | 'visitor',
  athleteId: '',
  visitorId: '',
  visitorName: '',
  visitorPhone: '',
  pricePerVisit: 0,
  visitedAt: localDateTimeValue(),
  note: '',
})

const athleteItems = computed(() => athletes.active.map(athlete => ({ title: athlete.profile.name, value: athlete.id, subtitle: plans.items.find(plan => plan.id === athlete.membership.planId)?.name ?? 'Miembro' })))
const visitorItems = computed(() => visitors.sorted.map(visitor => ({ title: visitor.name, value: visitor.id, subtitle: `${visitor.phone} · ${formatCurrency(visitor.pricePerVisit)} por visita` })))
const subjectItems = computed(() => [
  ...athleteItems.value.map(item => ({ ...item, value: `athlete:${item.value}`, subtitle: `Miembro · ${item.subtitle}` })),
  ...visitorItems.value.map(item => ({ ...item, value: `visitor:${item.value}`, subtitle: `Visitante · ${item.subtitle}` })),
])
const selectedAthleteId = computed(() => selectedSubjectKey.value.startsWith('athlete:') ? selectedSubjectKey.value.slice(8) : '')
const selectedVisitorId = computed(() => selectedSubjectKey.value.startsWith('visitor:') ? selectedSubjectKey.value.slice(8) : '')
const selectedAthlete = computed(() => athletes.items.find(athlete => athlete.id === selectedAthleteId.value) ?? null)
const selectedVisitor = computed(() => visitors.items.find(visitor => visitor.id === selectedVisitorId.value) ?? null)
const selectedCustomer = computed(() => selectedVisitor.value ?? selectedAthlete.value)
const selectedSubjectId = computed(() => selectedVisitorId.value || selectedAthleteId.value)
const selectedPlan = computed(() => plans.items.find(plan => plan.id === selectedAthlete.value?.membership.planId) ?? null)
const selectedAccessType = computed(() => selectedVisitor.value ? 'pay-per-visit' : planAccessType(selectedPlan.value))
const selectedVisitLimit = computed(() => selectedVisitor.value ? null : planVisitLimit(selectedPlan.value))
const selectedUnitPrice = computed(() => selectedVisitor.value?.pricePerVisit ?? planVisitPrice(selectedPlan.value))
const selectedVisits = computed(() => visits.items
  .filter(visit => (selectedVisitorId.value ? visit.visitorId === selectedVisitorId.value : visit.athleteId === selectedAthleteId.value) && visit.period === period.value)
  .sort((a, b) => timestampValue(b.visitedAt) - timestampValue(a.visitedAt)))
const remainingVisits = computed(() => selectedVisitLimit.value === null ? null : Math.max(0, selectedVisitLimit.value - selectedVisits.value.length))
const accumulatedAmount = computed(() => selectedVisits.value.length * selectedUnitPrice.value)
const selectedOpenSales = computed(() => commerce.openCredit.filter(sale => selectedVisitorId.value ? sale.visitorId === selectedVisitorId.value : sale.athleteId === selectedAthleteId.value))
const selectedStoreDebt = computed(() => selectedOpenSales.value.reduce((sum, sale) => sum + saleBalance(sale), 0))
const periodPaid = computed(() => payments.paid.some(payment => payment.athleteId === selectedSubjectId.value && payment.period === period.value && Boolean(payment.visitorId) === Boolean(selectedVisitorId.value)))
const filteredHistory = computed(() => visits.items
  .filter(visit => visit.period === period.value)
  .filter(visit => !selectedSubjectKey.value || (selectedVisitorId.value ? visit.visitorId === selectedVisitorId.value : visit.athleteId === selectedAthleteId.value))
  .sort((a, b) => timestampValue(b.visitedAt) - timestampValue(a.visitedAt)))
const pageCount = computed(() => Math.max(1, Math.ceil(filteredHistory.value.length / perPage)))
const paginatedHistory = computed(() => filteredHistory.value.slice((page.value - 1) * perPage, page.value * perPage))

watch([() => athletes.active.length, () => visitors.items.length], () => {
  if (selectedSubjectKey.value)
    return
  const requestedAthlete = typeof route.query.athlete === 'string' ? route.query.athlete : ''
  if (athletes.active.some(athlete => athlete.id === requestedAthlete))
    selectedSubjectKey.value = `athlete:${requestedAthlete}`
  else if (athletes.active[0])
    selectedSubjectKey.value = `athlete:${athletes.active[0].id}`
  else if (visitors.sorted[0])
    selectedSubjectKey.value = `visitor:${visitors.sorted[0].id}`
}, { immediate: true })
watch([selectedSubjectKey, period], () => { page.value = 1 })
watch(() => form.visitorId, visitorId => {
  const visitor = visitors.items.find(item => item.id === visitorId)
  if (!visitor)
    return
  form.visitorName = visitor.name
  form.visitorPhone = visitor.phone
  form.pricePerVisit = visitor.pricePerVisit
})

function nextPeriod(value: string) {
  const [year, month] = value.split('-').map(Number)
  return currentPeriod(new Date(year, month, 1))
}

function visitSubjectName(visit: Visit) {
  if (visit.visitorId)
    return visitors.items.find(visitor => visitor.id === visit.visitorId)?.name ?? 'Visitante'
  return athletes.items.find(athlete => athlete.id === visit.athleteId)?.profile.name ?? 'Atleta'
}

function openVisitForm() {
  form.subjectType = selectedVisitor.value ? 'visitor' : 'athlete'
  form.athleteId = selectedAthleteId.value || athletes.active[0]?.id || ''
  form.visitorId = selectedVisitorId.value
  form.visitorName = selectedVisitor.value?.name ?? ''
  form.visitorPhone = selectedVisitor.value?.phone ?? ''
  form.pricePerVisit = selectedVisitor.value?.pricePerVisit ?? 0
  form.visitedAt = localDateTimeValue()
  form.note = ''
  visitDialog.value = true
}

function startNewVisitor() {
  form.visitorId = ''
  form.visitorName = ''
  form.visitorPhone = ''
  form.pricePerVisit = selectedVisitor.value?.pricePerVisit ?? 0
}

async function saveVisit() {
  const visitedAt = new Date(form.visitedAt)
  if (Number.isNaN(visitedAt.getTime())) {
    failure('Selecciona una fecha y hora válidas.')
    return
  }
  const visitPeriod = currentPeriod(visitedAt)
  saving.value = true
  try {
    if (form.subjectType === 'visitor') {
      const phone = form.visitorPhone.replace(/\D/g, '')
      if (!form.visitorName.trim() || phone.length !== 10 || Number(form.pricePerVisit) <= 0) {
        failure('Captura nombre completo, celular de 10 dígitos y tarifa por visita.')
        return
      }
      let visitorId = form.visitorId
      if (visitorId) {
        await visitors.update(visitorId, { name: form.visitorName.trim(), phone, pricePerVisit: Number(form.pricePerVisit) })
      }
      else {
        const duplicate = visitors.items.find(visitor => visitor.phone === phone)
        visitorId = duplicate?.id ?? await visitors.create({ name: form.visitorName.trim(), phone, pricePerVisit: Number(form.pricePerVisit) })
      }
      await visits.create({
        visitorId,
        athleteId: null,
        period: visitPeriod,
        visitedAt: visitedAt.getTime(),
        planId: null,
        accessType: 'pay-per-visit',
        unitPrice: Number(form.pricePerVisit),
        note: form.note.trim() || null,
      })
      selectedSubjectKey.value = `visitor:${visitorId}`
    }
    else {
      const athlete = athletes.items.find(item => item.id === form.athleteId)
      const plan = plans.items.find(item => item.id === athlete?.membership.planId)
      if (!athlete || !plan) {
        failure('Selecciona un atleta con plan válido.')
        return
      }
      const accessType = planAccessType(plan)
      const limit = planVisitLimit(plan)
      const used = visits.items.filter(visit => visit.athleteId === athlete.id && visit.period === visitPeriod).length
      if (accessType === 'visit-pack' && limit !== null && used >= limit) {
        failure(`La cuponera ya alcanzó sus ${limit} visitas en ${visitPeriod}.`)
        return
      }
      await visits.create({ athleteId: athlete.id, visitorId: null, period: visitPeriod, visitedAt: visitedAt.getTime(), planId: plan.id, accessType, unitPrice: planVisitPrice(plan), note: form.note.trim() || null })
      selectedSubjectKey.value = `athlete:${athlete.id}`
    }
    period.value = visitPeriod
    success('Visita registrada en la fecha seleccionada.')
    visitDialog.value = false
  }
  catch (error) {
    failure(error instanceof Error ? error.message : 'No fue posible registrar la visita.')
  }
  finally { saving.value = false }
}

async function removeVisit(visit: Visit) {
  if (!confirm(`¿Eliminar la visita de ${visitSubjectName(visit)}?`))
    return
  try { await visits.remove(visit); success('Visita eliminada.') }
  catch (error) { failure(error instanceof Error ? error.message : 'No fue posible eliminar la visita.') }
}

function showVisitStatement() {
  if (!selectedCustomer.value || !selectedVisits.value.length) {
    failure('Registra al menos una visita para generar el estado de cuenta.')
    return
  }
  activeReceipt.value = buildVisitStatement(selectedCustomer.value, period.value, selectedVisits.value.length, selectedUnitPrice.value, selectedOpenSales.value)
  receiptDialog.value = true
}

function showRenewalReminder() {
  if (!selectedAthlete.value || !selectedPlan.value || selectedVisitLimit.value === null)
    return
  activeReceipt.value = buildRenewalReminder(selectedAthlete.value, nextPeriod(period.value), selectedPlan.value.name, selectedVisitLimit.value, selectedPlan.value.price, selectedOpenSales.value)
  receiptDialog.value = true
}

function openVisitPayment() {
  if (accumulatedAmount.value <= 0 || !selectedCustomer.value) {
    failure('No hay visitas acumuladas por cobrar.')
    return
  }
  paymentAmount.value = accumulatedAmount.value
  paymentVisitCount.value = selectedVisits.value.length
  paymentConcept.value = `${selectedVisits.value.length} visitas acumuladas ${period.value}`
  if (selectedVisitor.value)
    visitorPaymentDialog.value = true
  else
    memberPaymentDialog.value = true
}

function showPaymentReceipt(payment: Payment) {
  if (payment.visitorId) {
    const visitor = visitors.items.find(item => item.id === payment.visitorId)
    if (visitor)
      activeReceipt.value = buildVisitorVisitReceipt(payment, visitor)
  }
  else if (selectedAthlete.value) {
    activeReceipt.value = buildMembershipReceipt(payment, selectedAthlete.value, selectedPlan.value?.name)
  }
  if (activeReceipt.value)
    receiptDialog.value = true
}

onMounted(() => { athletes.subscribe(); visitors.subscribe(); plans.subscribe(); visits.subscribe(); commerce.subscribe(); payments.subscribe() })
onBeforeUnmount(() => { athletes.dispose(); visitors.dispose(); plans.dispose(); visits.dispose(); commerce.dispose(); payments.dispose() })
</script>

<template>
  <PageHeader title="Visitas" eyebrow="Asistencia" description="Miembros, visitantes externos, cobro acumulado y cuponeras.">
    <template #actions><VBtn prepend-icon="ri-user-follow-line" @click="openVisitForm">Registrar visita</VBtn></template>
  </PageHeader>

  <VCard class="kronos-card mb-5" rounded="xl"><VCardText><VRow><VCol cols="12" md="8"><VAutocomplete v-model="selectedSubjectKey" :items="subjectItems" label="Buscar miembro o visitante" prepend-inner-icon="ri-search-line" clearable auto-select-first /></VCol><VCol cols="12" md="4"><VTextField v-model="period" type="month" label="Periodo" /></VCol></VRow></VCardText></VCard>

  <template v-if="selectedCustomer">
    <VRow class="mb-2">
      <VCol cols="12" sm="6" lg="3"><MetricCard label="Visitas del mes" :value="selectedVisits.length" icon="ri-footprint-line" :detail="selectedVisitor ? 'Visitante externo' : selectedPlan?.name ?? 'Sin plan'" /></VCol>
      <VCol cols="12" sm="6" lg="3"><MetricCard label="Visitas restantes" :value="selectedVisitor ? 'No aplica' : remainingVisits === null ? 'Sin límite' : remainingVisits" icon="ri-coupon-3-line" :color="remainingVisits !== null && remainingVisits <= 2 ? 'warning' : 'secondary'" :detail="selectedVisitor ? 'Cobro por visita' : selectedVisitLimit ? `de ${selectedVisitLimit}` : 'Acceso libre'" /></VCol>
      <VCol cols="12" sm="6" lg="3"><MetricCard label="Acumulado por visitas" :value="formatCurrency(accumulatedAmount)" icon="ri-hand-coin-line" color="success" :detail="selectedAccessType === 'pay-per-visit' ? `${formatCurrency(selectedUnitPrice)} por visita` : 'No aplica cobro individual'" /></VCol>
      <VCol cols="12" sm="6" lg="3"><MetricCard label="Adeudo de tienda" :value="formatCurrency(selectedStoreDebt)" icon="ri-shopping-bag-3-line" :color="selectedStoreDebt > 0 ? 'error' : 'success'" detail="Incluido en avisos" /></VCol>
    </VRow>

    <VCard v-if="selectedAccessType === 'visit-pack'" class="kronos-card mb-5" rounded="xl"><VCardText><div class="d-flex flex-wrap justify-space-between align-center ga-4 mb-4"><div><div class="text-h6 font-weight-bold">Cuponera {{ selectedVisits.length }} / {{ selectedVisitLimit }}</div><div class="text-body-2 text-medium-emphasis">Las visitas se reinician al cambiar de periodo.</div></div><VBtn v-if="remainingVisits !== null && remainingVisits <= 2" prepend-icon="ri-whatsapp-line" color="warning" @click="showRenewalReminder">Enviar renovación</VBtn></div><VProgressLinear :model-value="selectedVisitLimit ? selectedVisits.length / selectedVisitLimit * 100 : 0" height="14" rounded color="secondary" /><VAlert v-if="remainingVisits !== null && remainingVisits <= 2" color="warning" variant="tonal" class="mt-4">{{ remainingVisits === 0 ? 'La cuponera agotó sus visitas.' : `Sólo quedan ${remainingVisits} visitas. Es momento de enviar el recordatorio de renovación.` }}</VAlert></VCardText></VCard>

    <VAlert v-else-if="selectedAccessType === 'unlimited'" color="info" variant="tonal" class="mb-5">Este plan tiene acceso libre. Las visitas se registran como asistencia, sin límite ni cobro individual.</VAlert>

    <VCard v-else class="kronos-card mb-5" rounded="xl"><VCardText class="d-flex flex-wrap align-center justify-space-between ga-4"><div><div class="text-h6 font-weight-bold">{{ selectedVisitor ? 'Visitante sin membresía' : 'Cobro por visitas' }}</div><div class="text-body-2 text-medium-emphasis">{{ selectedVisits.length }} visitas × {{ formatCurrency(selectedUnitPrice) }} = {{ formatCurrency(accumulatedAmount) }}<template v-if="selectedVisitor"> · {{ selectedVisitor.phone }}</template></div></div><div class="d-flex flex-wrap ga-2"><VBtn variant="tonal" prepend-icon="ri-whatsapp-line" :disabled="!selectedVisits.length" @click="showVisitStatement">Enviar estado de cuenta</VBtn><VBtn prepend-icon="ri-wallet-3-line" :disabled="!selectedVisits.length || periodPaid" @click="openVisitPayment">{{ periodPaid ? 'Periodo pagado' : 'Cobrar visitas' }}</VBtn></div></VCardText></VCard>
  </template>

  <VCard class="kronos-card" rounded="xl"><VCardItem title="Historial de visitas" :subtitle="`${filteredHistory.length} registros en ${period}`" /><VCardText><EmptyState v-if="!filteredHistory.length" title="Sin visitas en este periodo" description="Registra la primera asistencia del cliente." icon="ri-footprint-line" /><template v-else><VTable><thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Nota</th><th></th></tr></thead><tbody><tr v-for="visit in paginatedHistory" :key="visit.id"><td>{{ formatDate(visit.visitedAt) }}</td><td class="font-weight-bold">{{ visitSubjectName(visit) }}<div v-if="visit.visitorId" class="text-caption text-medium-emphasis">Visitante</div></td><td><VChip size="small" variant="tonal">{{ visit.accessType === 'visit-pack' ? 'Cuponera' : visit.accessType === 'pay-per-visit' ? 'Por visita' : 'Libre' }}</VChip></td><td>{{ visit.note || '—' }}</td><td class="text-right"><VBtn icon="ri-delete-bin-line" color="error" variant="text" title="Eliminar visita" @click="removeVisit(visit)" /></td></tr></tbody></VTable><VPagination v-if="pageCount > 1" v-model="page" :length="pageCount" :total-visible="5" class="mt-5" /></template></VCardText></VCard>

  <VDialog v-model="visitDialog" max-width="700"><VCard class="kronos-card" rounded="xl"><VCardItem class="pa-6 pb-2" title="Registrar visita" subtitle="Selecciona la fecha real y distingue miembros de visitantes sin membresía." /><VCardText class="pa-6 d-flex flex-column ga-5"><VBtnToggle v-model="form.subjectType" mandatory color="secondary" divided><VBtn value="athlete" prepend-icon="ri-team-line">Miembro</VBtn><VBtn value="visitor" prepend-icon="ri-user-line">Visitante</VBtn></VBtnToggle><VAutocomplete v-if="form.subjectType === 'athlete'" v-model="form.athleteId" :items="athleteItems" label="Buscar atleta" prepend-inner-icon="ri-search-line" clearable auto-select-first /><template v-else><div class="d-flex flex-wrap align-center ga-2"><VAutocomplete v-model="form.visitorId" :items="visitorItems" label="Buscar visitante existente" prepend-inner-icon="ri-search-line" clearable auto-select-first class="flex-grow-1" /><VBtn variant="tonal" prepend-icon="ri-user-add-line" @click="startNewVisitor">Nuevo</VBtn></div><VRow><VCol cols="12" md="7"><VTextField v-model="form.visitorName" label="Nombre completo" /></VCol><VCol cols="12" md="5"><VTextField v-model="form.visitorPhone" label="Celular" maxlength="10" inputmode="tel" /></VCol><VCol cols="12"><VTextField v-model.number="form.pricePerVisit" type="number" min="1" label="Tarifa por visita" prefix="$" /></VCol></VRow></template><VTextField v-model="form.visitedAt" type="datetime-local" label="Fecha y hora de la visita" hint="Puedes registrar una visita de una fecha anterior." persistent-hint /><VTextField v-model="form.note" label="Nota (opcional)" /></VCardText><VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="visitDialog = false">Cancelar</VBtn><VBtn :loading="saving" @click="saveVisit">Registrar visita</VBtn></VCardActions></VCard></VDialog>

  <MembershipPaymentDialog v-model="memberPaymentDialog" :athlete-id="selectedAthleteId" :period="period" :amount="paymentAmount" :concept="paymentConcept" :visit-count="paymentVisitCount" title="Cobrar visitas acumuladas" subtitle="El pago se registrará en el periodo seleccionado y generará su recibo." lock-athlete @saved="showPaymentReceipt" />
  <VisitorPaymentDialog v-model="visitorPaymentDialog" :visitor-id="selectedVisitorId" :period="period" :amount="paymentAmount" :concept="paymentConcept" :visit-count="paymentVisitCount" @saved="showPaymentReceipt" />
  <ReceiptDialog v-model="receiptDialog" :receipt="activeReceipt" />
</template>
