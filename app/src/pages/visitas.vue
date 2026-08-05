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
import { useSessionStore } from '@/stores/session'
import { useVisitPaymentsStore } from '@/stores/visit-payments'
import { useVisitorsStore } from '@/stores/visitors'
import { useVisitsStore } from '@/stores/visits'
import { currentPeriod, planAccessType, planVisitLimit, planVisitPrice, type CombinedStorePayment, type MembershipPaymentInstallment, type Payment, type Visit, type VisitPayment } from '@/types/domain'
import { formatCurrency, formatDate, saleBalance, timestampValue } from '@/utils/kronos'
import { buildAccumulatedVisitStatement, buildMembershipReceipt, buildRenewalReminder, buildVisitPaymentReceipt, buildVisitStatement, combinedStorePaymentsForInstallment, type ReceiptData } from '@/utils/receipts'

const athletes = useAthletesStore()
const visitors = useVisitorsStore()
const plans = usePlansStore()
const visits = useVisitsStore()
const commerce = useCommerceStore()
const payments = usePaymentsStore()
const visitPayments = useVisitPaymentsStore()
const session = useSessionStore()
const canRegister = computed(() => session.can('visitsRegister'))
const canCollect = computed(() => session.can('visitsCollect'))
const canDelete = computed(() => session.can('visitsDelete'))
const route = useRoute()
const { success, failure, confirmAction } = useNotifications()
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

const today = new Date()

const monthItems = [
  { title: 'Enero', value: 1 },
  { title: 'Febrero', value: 2 },
  { title: 'Marzo', value: 3 },
  { title: 'Abril', value: 4 },
  { title: 'Mayo', value: 5 },
  { title: 'Junio', value: 6 },
  { title: 'Julio', value: 7 },
  { title: 'Agosto', value: 8 },
  { title: 'Septiembre', value: 9 },
  { title: 'Octubre', value: 10 },
  { title: 'Noviembre', value: 11 },
  { title: 'Diciembre', value: 12 },
]

const yearItems = Array.from({ length: 12 }, (_, index) => today.getFullYear() + 1 - index)

const form = reactive({
  subjectType: 'athlete' as 'athlete' | 'visitor',
  athleteId: '',
  visitorId: '',
  visitorName: '',
  visitorPhone: '',
  pricePerVisit: 0,
  visitDay: today.getDate(),
  visitMonth: today.getMonth() + 1,
  visitYear: today.getFullYear(),
  visitTime: today.toTimeString().slice(0, 5),
  note: '',
})

const dayItems = computed(() => Array.from({ length: new Date(form.visitYear, form.visitMonth, 0).getDate() }, (_, index) => index + 1))

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

const legacyPaidVisitorPeriods = computed(() => new Set(payments.paid
  .filter(payment => payment.visitorId === selectedVisitorId.value)
  .map(payment => payment.period)))

const unpaidVisitorVisits = computed(() => selectedVisitorId.value
  ? visits.items
    .filter(visit => visit.visitorId === selectedVisitorId.value
        && visit.period <= period.value
        && !visit.paidAt
        && !legacyPaidVisitorPeriods.value.has(visit.period))
    .sort((a, b) => timestampValue(a.visitedAt) - timestampValue(b.visitedAt))
  : [])

const accumulatedAmount = computed(() => selectedVisitor.value
  ? unpaidVisitorVisits.value.reduce((total, visit) => total + Number(visit.unitPrice || 0), 0)
  : selectedVisits.value.length * selectedUnitPrice.value)

const selectedOpenSales = computed(() => commerce.openCredit.filter(sale => selectedVisitorId.value ? sale.visitorId === selectedVisitorId.value : sale.athleteId === selectedAthleteId.value))
const selectedStoreDebt = computed(() => selectedOpenSales.value.reduce((sum, sale) => sum + saleBalance(sale), 0))
const periodPaid = computed(() => payments.paid.some(payment => payment.athleteId === selectedSubjectId.value && payment.period === period.value && Boolean(payment.visitorId) === Boolean(selectedVisitorId.value)))

const pendingVisitPeriods = computed(() => {
  const counts = new Map<string, number>()

  unpaidVisitorVisits.value.forEach(visit => counts.set(visit.period, (counts.get(visit.period) ?? 0) + 1))

  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([pendingPeriod, count]) => `${count} de ${pendingPeriod}`).join(' + ')
})

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
watch([() => form.visitYear, () => form.visitMonth], () => {
  form.visitDay = Math.min(form.visitDay, dayItems.value.length)
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
  form.athleteId = selectedAthleteId.value
  form.visitorId = selectedVisitorId.value
  form.visitorName = selectedVisitor.value?.name ?? ''
  form.visitorPhone = selectedVisitor.value?.phone ?? ''
  form.pricePerVisit = selectedVisitor.value?.pricePerVisit ?? 0

  const now = new Date()

  form.visitDay = now.getDate()
  form.visitMonth = now.getMonth() + 1
  form.visitYear = now.getFullYear()
  form.visitTime = now.toTimeString().slice(0, 5)
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
  const [hour, minute] = form.visitTime.split(':').map(Number)
  const visitedAt = new Date(form.visitYear, form.visitMonth - 1, form.visitDay, hour, minute)

  const validDate = visitedAt.getFullYear() === form.visitYear
    && visitedAt.getMonth() === form.visitMonth - 1
    && visitedAt.getDate() === form.visitDay
    && visitedAt.getHours() === hour
    && visitedAt.getMinutes() === minute

  if (!validDate) {
    failure('Selecciona día, mes, año y hora válidos.')

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
  if (visit.paidAt || (visit.visitorId && legacyPaidVisitorPeriods.value.has(visit.period))) {
    failure('Una visita liquidada no puede eliminarse porque forma parte de un recibo.')

    return
  }

  const accepted = await confirmAction({
    title: 'Eliminar visita',
    message: `¿Deseas eliminar la visita de ${visitSubjectName(visit)}?`,
    detail: 'El conteo de visitas del periodo se actualizará inmediatamente.',
    confirmText: 'Eliminar visita',
    color: 'error',
    icon: 'ri-delete-bin-line',
  })

  if (!accepted)
    return
  try { await visits.remove(visit); success('Visita eliminada.') }
  catch (error) { failure(error instanceof Error ? error.message : 'No fue posible eliminar la visita.') }
}

function showVisitStatement() {
  const statementVisits = selectedVisitor.value ? unpaidVisitorVisits.value : selectedVisits.value
  if (!selectedCustomer.value || !statementVisits.length) {
    failure('No hay visitas pendientes para generar el estado de cuenta.')

    return
  }
  activeReceipt.value = selectedVisitor.value
    ? buildAccumulatedVisitStatement(selectedCustomer.value, period.value, statementVisits, selectedOpenSales.value)
    : buildVisitStatement(selectedCustomer.value, period.value, statementVisits.length, selectedUnitPrice.value, selectedOpenSales.value)
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
  paymentVisitCount.value = selectedVisitor.value ? unpaidVisitorVisits.value.length : selectedVisits.value.length
  paymentConcept.value = `${paymentVisitCount.value} visitas acumuladas hasta ${period.value}`
  if (selectedVisitor.value)
    visitorPaymentDialog.value = true
  else
    memberPaymentDialog.value = true
}

function showPaymentReceipt(payment: Payment | VisitPayment, installment?: MembershipPaymentInstallment, settledStorePayments: CombinedStorePayment[] = []) {
  if ('visitRefs' in payment) {
    const visitor = visitors.items.find(item => item.id === payment.visitorId)
    if (visitor)
      activeReceipt.value = buildVisitPaymentReceipt(payment, visitor)
  }
  else if (selectedAthlete.value) {
    const combinedStorePayments = settledStorePayments.length
      ? settledStorePayments
      : combinedStorePaymentsForInstallment(commerce.sales, selectedAthlete.value.id, payment.period, installment)

    activeReceipt.value = buildMembershipReceipt(payment, selectedAthlete.value, selectedPlan.value?.name, installment, combinedStorePayments)
  }
  if (activeReceipt.value)
    receiptDialog.value = true
}

onMounted(() => { athletes.subscribe(); visitors.subscribe(); plans.subscribe(); visits.subscribe(); commerce.subscribe(); payments.subscribe(); visitPayments.subscribe() })
onBeforeUnmount(() => { athletes.dispose(); visitors.dispose(); plans.dispose(); visits.dispose(); commerce.dispose(); payments.dispose(); visitPayments.dispose() })
</script>

<template>
  <PageHeader
    title="Visitas"
    eyebrow="Asistencia"
    description="Miembros, visitantes externos, cobro acumulado y cuponeras."
  >
    <template
      v-if="canRegister"
      #actions
    >
      <VBtn
        prepend-icon="ri-user-follow-line"
        @click="openVisitForm"
      >
        Registrar visita
      </VBtn>
    </template>
  </PageHeader>

  <VCard
    class="kronos-card mb-5"
    rounded="xl"
  >
    <VCardText>
      <VRow>
        <VCol
          cols="12"
          md="8"
        >
          <VAutocomplete
            v-model="selectedSubjectKey"
            :items="subjectItems"
            label="Buscar miembro o visitante"
            prepend-inner-icon="ri-search-line"
            clearable
          />
        </VCol><VCol
          cols="12"
          md="4"
        >
          <VTextField
            v-model="period"
            type="month"
            label="Periodo"
          />
        </VCol>
      </VRow>
    </VCardText>
  </VCard>

  <template v-if="selectedCustomer">
    <VRow class="mb-2">
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <MetricCard
          label="Visitas del mes"
          :value="selectedVisits.length"
          icon="ri-footprint-line"
          :detail="selectedVisitor ? 'Visitante externo' : selectedPlan?.name ?? 'Sin plan'"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <MetricCard
          label="Visitas restantes"
          :value="selectedVisitor ? 'No aplica' : remainingVisits === null ? 'Sin límite' : remainingVisits"
          icon="ri-coupon-3-line"
          :color="remainingVisits !== null && remainingVisits <= 2 ? 'warning' : 'secondary'"
          :detail="selectedVisitor ? 'Cobro por visita' : selectedVisitLimit ? `de ${selectedVisitLimit}` : 'Acceso libre'"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <MetricCard
          label="Pendiente por visitas"
          :value="formatCurrency(accumulatedAmount)"
          icon="ri-hand-coin-line"
          :color="accumulatedAmount > 0 ? 'warning' : 'success'"
          :detail="selectedVisitor ? `${unpaidVisitorVisits.length} pendientes hasta ${period}` : selectedAccessType === 'pay-per-visit' ? `${formatCurrency(selectedUnitPrice)} por visita` : 'No aplica cobro individual'"
        />
      </VCol>
      <VCol
        cols="12"
        sm="6"
        lg="3"
      >
        <MetricCard
          label="Adeudo de tienda"
          :value="formatCurrency(selectedStoreDebt)"
          icon="ri-shopping-bag-3-line"
          :color="selectedStoreDebt > 0 ? 'error' : 'success'"
          detail="Incluido en avisos"
        />
      </VCol>
    </VRow>

    <VCard
      v-if="selectedAccessType === 'visit-pack'"
      class="kronos-card mb-5"
      rounded="xl"
    >
      <VCardText>
        <div class="d-flex flex-wrap justify-space-between align-center ga-4 mb-4">
          <div>
            <div class="text-h6 font-weight-bold">
              Cuponera {{ selectedVisits.length }} / {{ selectedVisitLimit }}
            </div><div class="text-body-2 text-medium-emphasis">
              Las visitas se reinician al cambiar de periodo.
            </div>
          </div><VBtn
            v-if="remainingVisits !== null && remainingVisits <= 2"
            prepend-icon="ri-whatsapp-line"
            color="warning"
            @click="showRenewalReminder"
          >
            Enviar renovación
          </VBtn>
        </div><VProgressLinear
          :model-value="selectedVisitLimit ? selectedVisits.length / selectedVisitLimit * 100 : 0"
          height="14"
          rounded
          color="secondary"
        /><VAlert
          v-if="remainingVisits !== null && remainingVisits <= 2"
          color="warning"
          variant="tonal"
          class="mt-4"
        >
          {{ remainingVisits === 0 ? 'La cuponera agotó sus visitas.' : `Sólo quedan ${remainingVisits} visitas. Es momento de enviar el recordatorio de renovación.` }}
        </VAlert>
      </VCardText>
    </VCard>

    <VAlert
      v-else-if="selectedAccessType === 'unlimited'"
      color="info"
      variant="tonal"
      class="mb-5"
    >
      Este plan tiene acceso libre. Las visitas se registran como asistencia, sin límite ni cobro individual.
    </VAlert>

    <VCard
      v-else
      class="kronos-card mb-5"
      rounded="xl"
    >
      <VCardText class="d-flex flex-wrap align-center justify-space-between ga-4">
        <div>
          <div class="text-h6 font-weight-bold">
            {{ selectedVisitor ? 'Visitante sin membresía' : 'Cobro por visitas' }}
          </div><div class="text-body-2 text-medium-emphasis">
            <template v-if="selectedVisitor">
              {{ unpaidVisitorVisits.length }} visitas pendientes hasta {{ period }} · {{ pendingVisitPeriods || 'Todo liquidado' }} · {{ selectedVisitor.phone }}
            </template><template v-else>
              {{ selectedVisits.length }} visitas × {{ formatCurrency(selectedUnitPrice) }} = {{ formatCurrency(accumulatedAmount) }}
            </template>
          </div><div
            v-if="selectedVisitor && unpaidVisitorVisits.some(visit => visit.period < period)"
            class="text-caption text-warning mt-1"
          >
            Incluye visitas pendientes de meses anteriores.
          </div>
        </div><div class="d-flex flex-wrap ga-2">
          <VBtn
            variant="tonal"
            prepend-icon="ri-whatsapp-line"
            :disabled="selectedVisitor ? !unpaidVisitorVisits.length : !selectedVisits.length"
            @click="showVisitStatement"
          >
            Enviar estado de cuenta
          </VBtn><VBtn
            v-if="canCollect"
            prepend-icon="ri-wallet-3-line"
            :disabled="selectedVisitor ? !unpaidVisitorVisits.length : !selectedVisits.length || periodPaid"
            @click="openVisitPayment"
          >
            {{ selectedVisitor ? unpaidVisitorVisits.length ? 'Cobrar pendientes' : 'Todo liquidado' : periodPaid ? 'Periodo pagado' : 'Cobrar visitas' }}
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </template>

  <VCard
    class="kronos-card"
    rounded="xl"
  >
    <VCardItem
      title="Historial de visitas"
      :subtitle="`${filteredHistory.length} registros en ${period}`"
    /><VCardText>
      <EmptyState
        v-if="!filteredHistory.length"
        title="Sin visitas en este periodo"
        description="Registra la primera asistencia del cliente."
        icon="ri-footprint-line"
      /><template v-else>
        <VTable>
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Nota</th><th /></tr></thead><tbody>
            <tr
              v-for="visit in paginatedHistory"
              :key="visit.id"
            >
              <td>{{ formatDate(visit.visitedAt) }}</td><td class="font-weight-bold">
                {{ visitSubjectName(visit) }}<div
                  v-if="visit.visitorId"
                  class="text-caption text-medium-emphasis"
                >
                  Visitante
                </div>
              </td><td>
                <VChip
                  size="small"
                  variant="tonal"
                >
                  {{ visit.accessType === 'visit-pack' ? 'Cuponera' : visit.accessType === 'pay-per-visit' ? 'Por visita' : 'Libre' }}
                </VChip>
              </td><td>
                <VChip
                  v-if="visit.accessType === 'pay-per-visit'"
                  size="small"
                  variant="tonal"
                  :color="visit.paidAt || (visit.visitorId && legacyPaidVisitorPeriods.has(visit.period)) ? 'success' : 'warning'"
                >
                  {{ visit.paidAt || (visit.visitorId && legacyPaidVisitorPeriods.has(visit.period)) ? 'Pagada' : 'Pendiente' }}
                </VChip><span v-else>—</span>
              </td><td>{{ visit.note || '—' }}</td><td class="text-right">
                <VBtn
                  v-if="canDelete"
                  icon="ri-delete-bin-line"
                  color="error"
                  variant="text"
                  title="Eliminar visita"
                  :disabled="Boolean(visit.paidAt || (visit.visitorId && legacyPaidVisitorPeriods.has(visit.period)))"
                  @click="removeVisit(visit)"
                />
              </td>
            </tr>
          </tbody>
        </VTable><VPagination
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
    v-model="visitDialog"
    max-width="700"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        title="Registrar visita"
        subtitle="Selecciona la fecha real y distingue miembros de visitantes sin membresía."
      /><VCardText class="pa-6 d-flex flex-column ga-5">
        <div>
          <div class="text-caption text-medium-emphasis mb-2">
            Tipo de cliente
          </div><VRow dense>
            <VCol cols="6">
              <VBtn
                block
                height="54"
                prepend-icon="ri-team-line"
                :color="form.subjectType === 'athlete' ? 'secondary' : undefined"
                :variant="form.subjectType === 'athlete' ? 'flat' : 'outlined'"
                @click="form.subjectType = 'athlete'"
              >
                Miembro
              </VBtn>
            </VCol><VCol cols="6">
              <VBtn
                block
                height="54"
                prepend-icon="ri-user-line"
                :color="form.subjectType === 'visitor' ? 'secondary' : undefined"
                :variant="form.subjectType === 'visitor' ? 'flat' : 'outlined'"
                @click="form.subjectType = 'visitor'"
              >
                Visitante
              </VBtn>
            </VCol>
          </VRow>
        </div><VAutocomplete
          v-if="form.subjectType === 'athlete'"
          v-model="form.athleteId"
          :items="athleteItems"
          label="Buscar atleta"
          prepend-inner-icon="ri-search-line"
          clearable
        /><template v-else>
          <div class="d-flex flex-column flex-sm-row align-sm-center ga-2">
            <VAutocomplete
              v-model="form.visitorId"
              :items="visitorItems"
              label="Buscar visitante existente"
              prepend-inner-icon="ri-search-line"
              clearable
              class="flex-grow-1"
            /><VBtn
              height="56"
              variant="tonal"
              prepend-icon="ri-user-add-line"
              @click="startNewVisitor"
            >
              Nuevo visitante
            </VBtn>
          </div><VRow>
            <VCol
              cols="12"
              md="7"
            >
              <VTextField
                v-model="form.visitorName"
                label="Nombre completo"
              />
            </VCol><VCol
              cols="12"
              md="5"
            >
              <VTextField
                v-model="form.visitorPhone"
                label="Celular"
                maxlength="10"
                inputmode="tel"
              />
            </VCol><VCol cols="12">
              <VTextField
                v-model.number="form.pricePerVisit"
                type="number"
                min="1"
                label="Tarifa por visita"
                prefix="$"
              />
            </VCol>
          </VRow>
        </template><div>
          <div class="text-caption text-medium-emphasis mb-2">
            Fecha de la visita
          </div><VRow>
            <VCol
              cols="12"
              sm="3"
            >
              <VSelect
                v-model="form.visitDay"
                :items="dayItems"
                label="Día"
              />
            </VCol><VCol
              cols="12"
              sm="5"
            >
              <VSelect
                v-model="form.visitMonth"
                :items="monthItems"
                label="Mes"
              />
            </VCol><VCol
              cols="12"
              sm="4"
            >
              <VSelect
                v-model="form.visitYear"
                :items="yearItems"
                label="Año"
              />
            </VCol><VCol cols="12">
              <VTextField
                v-model="form.visitTime"
                type="time"
                label="Hora"
                hint="Puedes registrar una visita de una fecha anterior."
                persistent-hint
              />
            </VCol>
          </VRow>
        </div><VTextField
          v-model="form.note"
          label="Nota (opcional)"
        />
      </VCardText><VCardActions class="pa-6 pt-0 flex-wrap ga-2">
        <VSpacer /><VBtn
          variant="text"
          @click="visitDialog = false"
        >
          Cancelar
        </VBtn><VBtn
          :loading="saving"
          @click="saveVisit"
        >
          Registrar visita
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

  <MembershipPaymentDialog
    v-model="memberPaymentDialog"
    :athlete-id="selectedAthleteId"
    :period="period"
    :amount="paymentAmount"
    :concept="paymentConcept"
    :visit-count="paymentVisitCount"
    :store-sales="selectedOpenSales"
    title="Cobrar visitas acumuladas"
    subtitle="El pago se registrará en el periodo seleccionado y generará su recibo."
    lock-athlete
    @saved="showPaymentReceipt"
  />
  <VisitorPaymentDialog
    v-model="visitorPaymentDialog"
    :visitor-id="selectedVisitorId"
    :period="period"
    :visits="unpaidVisitorVisits"
    @saved="showPaymentReceipt"
  />
  <ReceiptDialog
    v-model="receiptDialog"
    :receipt="activeReceipt"
  />
</template>
