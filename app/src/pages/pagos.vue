<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MembershipPaymentDialog from '@/components/kronos/MembershipPaymentDialog.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { useCommerceStore } from '@/stores/commerce'
import { usePaymentsStore } from '@/stores/payments'
import { usePlansStore } from '@/stores/plans'
import { useSessionStore } from '@/stores/session'
import { useVisitorsStore } from '@/stores/visitors'
import { currentPeriod, type CombinedStorePayment, type MembershipPaymentInstallment, type Payment } from '@/types/domain'
import { buildMembershipReceipt, buildVisitorVisitReceipt, combinedStorePaymentsForInstallment, type ReceiptData } from '@/utils/receipts'
import { formatCurrency, formatDate, membershipBalance, membershipInstallments, membershipPaidAmount, membershipTotalAmount, timestampValue } from '@/utils/kronos'

const athletes = useAthletesStore()
const commerce = useCommerceStore()
const payments = usePaymentsStore()
const plans = usePlansStore()
const visitors = useVisitorsStore()
const session = useSessionStore()
const canManage = computed(() => session.can('paymentsManage'))
const { failure } = useNotifications()
const route = useRoute()
const router = useRouter()
const dialog = ref(false)
const selectedAthleteId = ref('')
const selectedPeriod = ref(currentPeriod())
const receiptDialog = ref(false)
const activeReceipt = ref<ReceiptData | null>(null)
const search = ref('')
const periodFilter = ref('')
const page = ref(1)
const perPage = 15

const payerName = (payment: Payment) => payment.visitorId ? visitors.items.find(item => item.id === payment.visitorId)?.name ?? 'Visitante' : athletes.items.find(item => item.id === payment.athleteId)?.profile.name ?? 'Atleta'

const filtered = computed(() => [...payments.items]
  .filter(payment => !periodFilter.value || payment.period === periodFilter.value)
  .filter(payment => `${payerName(payment)} ${payment.period} ${payment.method ?? ''}`.toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es')))
  .sort((a, b) => timestampValue(b.appliedAt) - timestampValue(a.appliedAt)))

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage)))
const paginated = computed(() => filtered.value.slice((page.value - 1) * perPage, page.value * perPage))

watch([search, periodFilter], () => { page.value = 1 })

const paymentAthlete = (payment: Payment) => athletes.items.find(item => item.id === payment.athleteId)
const totalFor = (payment: Payment) => membershipTotalAmount(payment, paymentAthlete(payment)?.membership.agreedAmount)
const balanceFor = (payment: Payment) => membershipBalance(payment, paymentAthlete(payment)?.membership.agreedAmount)
const installmentsFor = (payment: Payment) => membershipInstallments(payment)

function showReceipt(payment: Payment, installment?: MembershipPaymentInstallment, settledStorePayments: CombinedStorePayment[] = []) {
  if (payment.visitorId) {
    const visitor = visitors.items.find(item => item.id === payment.visitorId)
    if (visitor) {
      activeReceipt.value = buildVisitorVisitReceipt(payment, visitor)
      receiptDialog.value = true

      return
    }
  }
  const athlete = paymentAthlete(payment)

  if (!athlete) {
    failure('No fue posible relacionar el recibo con el atleta.')

    return
  }

  const planName = plans.items.find(plan => plan.id === athlete.membership.planId)?.name

  const combinedStorePayments = settledStorePayments.length
    ? settledStorePayments
    : combinedStorePaymentsForInstallment(commerce.sales, athlete.id, payment.period, installment)

  activeReceipt.value = buildMembershipReceipt(payment, athlete, planName, installment, combinedStorePayments)
  receiptDialog.value = true
}

function openForm(athleteId = '', paymentPeriod = currentPeriod()) {
  selectedAthleteId.value = athletes.active.some(athlete => athlete.id === athleteId) ? athleteId : ''
  selectedPeriod.value = paymentPeriod
  dialog.value = true
}

function openEmptyForm() {
  openForm()
}

function openCollectionFromRoute() {
  const athleteId = typeof route.query.athleteId === 'string' ? route.query.athleteId : ''
  const requestedPeriod = typeof route.query.period === 'string' ? route.query.period : currentPeriod()
  const athlete = athletes.active.find(item => item.id === athleteId)

  if (route.query.collect !== '1' || !athlete || !canManage.value)
    return

  selectedAthleteId.value = athlete.id
  selectedPeriod.value = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : currentPeriod()
  dialog.value = true
  router.replace({ path: '/pagos' })
}

watch([() => route.query.collect, () => athletes.active.length], openCollectionFromRoute, { immediate: true })

onMounted(() => { athletes.subscribe(); visitors.subscribe(); payments.subscribe(); plans.subscribe(); commerce.subscribe() })
onBeforeUnmount(() => { athletes.dispose(); visitors.dispose(); payments.dispose(); plans.dispose(); commerce.dispose() })
</script>

<template>
  <PageHeader
    title="Mensualidades"
    eyebrow="Cobranza"
    description="Pagos por periodo, recibos y búsqueda rápida de atletas."
  >
    <template
      v-if="canManage"
      #actions
    >
      <VBtn
        prepend-icon="ri-add-circle-line"
        :disabled="!athletes.active.length"
        @click="openEmptyForm"
      >
        Aplicar pago
      </VBtn>
    </template>
  </PageHeader>

  <VCard
    class="kronos-card"
    rounded="xl"
  >
    <VCardItem
      title="Historial de pagos"
      :subtitle="`${filtered.length} registros encontrados`"
    />
    <VCardText>
      <VRow class="mb-2">
        <VCol
          cols="12"
          md="8"
        >
          <VTextField
            v-model="search"
            label="Buscar atleta, periodo o método"
            prepend-inner-icon="ri-search-line"
            clearable
          />
        </VCol>
        <VCol
          cols="12"
          md="4"
        >
          <VTextField
            v-model="periodFilter"
            type="month"
            label="Filtrar periodo"
            clearable
          />
        </VCol>
      </VRow>

      <EmptyState
        v-if="!filtered.length"
        title="Sin pagos aplicados"
        description="Registra la primera mensualidad o cambia los filtros. Los abonos pendientes aparecerán con su saldo."
        icon="ri-wallet-line"
      />
      <template v-else>
        <VTable>
          <thead>
            <tr>
              <th>Cliente</th><th>Periodo</th><th>Estado</th><th>Último abono</th><th class="text-right">
                Abonado
              </th><th class="text-right">
                Restante
              </th><th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="payment in paginated"
              :key="`${payment.athleteId}-${payment.period}`"
            >
              <td class="font-weight-bold">
                {{ payerName(payment) }}<div
                  v-if="payment.visitorId"
                  class="text-caption text-medium-emphasis"
                >
                  Visitante
                </div>
              </td>
              <td>{{ payment.period }}</td>
              <td>
                <VChip
                  :color="balanceFor(payment) > 0 ? 'warning' : 'success'"
                  variant="tonal"
                  size="small"
                >
                  {{ balanceFor(payment) > 0 ? 'Pendiente' : 'Liquidado' }}
                </VChip>
              </td>
              <td>
                {{ formatDate(payment.appliedAt) }}
                <div class="text-caption text-medium-emphasis">
                  {{ installmentsFor(payment).length }} {{ installmentsFor(payment).length === 1 ? 'abono' : 'abonos' }}
                </div>
              </td>
              <td class="text-right text-success font-weight-bold">
                {{ formatCurrency(membershipPaidAmount(payment)) }}
                <div class="text-caption text-medium-emphasis">
                  de {{ formatCurrency(totalFor(payment)) }}
                </div>
              </td>
              <td
                class="text-right font-weight-bold"
                :class="balanceFor(payment) > 0 ? 'text-warning' : 'text-success'"
              >
                {{ formatCurrency(balanceFor(payment)) }}
              </td>
              <td class="text-right">
                <VBtn
                  v-if="canManage && !payment.visitorId && balanceFor(payment) > 0"
                  icon="ri-add-circle-line"
                  variant="text"
                  title="Aplicar otro abono"
                  @click="openForm(payment.athleteId, payment.period)"
                />
                <VBtn
                  icon="ri-receipt-line"
                  variant="text"
                  title="Generar recibo"
                  @click="showReceipt(payment)"
                />
              </td>
            </tr>
          </tbody>
        </VTable>
        <div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-5">
          <span class="text-caption text-medium-emphasis">Máximo 15 registros por página</span>
          <VPagination
            v-model="page"
            :length="pageCount"
            :total-visible="5"
            density="comfortable"
          />
        </div>
      </template>
    </VCardText>
  </VCard>

  <MembershipPaymentDialog
    v-model="dialog"
    :athlete-id="selectedAthleteId"
    :period="selectedPeriod"
    :store-sales="commerce.openCredit.filter(sale => sale.athleteId === selectedAthleteId)"
    @saved="showReceipt"
  />
  <ReceiptDialog
    v-model="receiptDialog"
    :receipt="activeReceipt"
  />
</template>
