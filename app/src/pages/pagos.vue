<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MembershipPaymentDialog from '@/components/kronos/MembershipPaymentDialog.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import PaymentNotificationStatusDialog from '@/components/kronos/PaymentNotificationStatusDialog.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import TablePaginator from '@/components/kronos/TablePaginator.vue'
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
import { membershipCollectionState, membershipDueDate } from '@/utils/membership-periods'

const athletes = useAthletesStore()
const commerce = useCommerceStore()
const payments = usePaymentsStore()
const plans = usePlansStore()
const visitors = useVisitorsStore()
const session = useSessionStore()
const canManage = computed(() => session.can('paymentsManage'))
const canReadNotifications = computed(() => session.isReady && session.canAccess('payments'))
const notificationDialog = ref(false)
const notificationAthleteId = ref('')
const notificationAthlete = computed(() => athletes.items.find(item => item.id === notificationAthleteId.value))
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
const perPage = ref(15)

const payerName = (payment: Payment) => payment.visitorId ? visitors.items.find(item => item.id === payment.visitorId)?.name ?? 'Visitante' : athletes.items.find(item => item.id === payment.athleteId)?.profile.name ?? 'Atleta'

const filtered = computed(() => [...payments.items]
  .filter(payment => !periodFilter.value || payment.period === periodFilter.value)
  .filter(payment => `${payerName(payment)} ${payment.period} ${payment.method ?? ''}`.toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es')))
  .sort((a, b) => timestampValue(b.appliedAt) - timestampValue(a.appliedAt)))

const paginated = computed(() => filtered.value.slice((page.value - 1) * perPage.value, page.value * perPage.value))

watch([search, periodFilter], () => { page.value = 1 })

const paymentAthlete = (payment: Payment) => athletes.items.find(item => item.id === payment.athleteId)
const totalFor = (payment: Payment) => membershipTotalAmount(payment, paymentAthlete(payment)?.membership.agreedAmount)
const balanceFor = (payment: Payment) => membershipBalance(payment, paymentAthlete(payment)?.membership.agreedAmount)
const installmentsFor = (payment: Payment) => membershipInstallments(payment)

const collectionStateFor = (payment: Payment) => membershipCollectionState({
  dueDate: payment.snapshot?.dueDate ?? membershipDueDate(payment.period, paymentAthlete(payment)?.membership.paymentDay ?? 1),
  balance: balanceFor(payment),
  paidAt: payment.appliedAt,
})

const collectionStateLabel = (payment: Payment) => ({ advance: 'Adelantado', pending: 'Pendiente', overdue: 'Vencido', paid: 'Liquidado' })[collectionStateFor(payment)]
const collectionStateColor = (payment: Payment) => ({ advance: 'info', pending: 'warning', overdue: 'error', paid: 'success' })[collectionStateFor(payment)]

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

  const planName = plans.items.find(plan => plan.id === (payment.snapshot?.planId ?? athlete.membership.planId))?.name

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

function openNotifications(payment: Payment) {
  if (!canReadNotifications.value || payment.visitorId || !paymentAthlete(payment))
    return
  notificationAthleteId.value = payment.athleteId
  notificationDialog.value = true
}

watch(notificationDialog, open => {
  if (!open)
    notificationAthleteId.value = ''
})

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
        Abonar mensualidad
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
                  :color="collectionStateColor(payment)"
                  variant="tonal"
                  size="small"
                >
                  {{ collectionStateLabel(payment) }}
                </VChip>
              </td>
              <td>
                {{ formatDate(payment.appliedAt) }}
                <div class="text-caption text-medium-emphasis">
                  {{ payment.totalAmount === 0 && payment.snapshot?.promotion ? 'Gratis · sin abono' : `${installmentsFor(payment).length} ${installmentsFor(payment).length === 1 ? 'abono' : 'abonos'}` }}
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
                  v-if="canReadNotifications && !payment.visitorId && paymentAthlete(payment)"
                  icon="ri-notification-3-line"
                  variant="text"
                  title="Notificaciones del atleta"
                  :aria-label="`Notificaciones de ${payerName(payment)}`"
                  @click="openNotifications(payment)"
                />
                <VBtn
                  v-if="canManage && !payment.visitorId && balanceFor(payment) > 0"
                  icon="ri-add-circle-line"
                  variant="text"
                  title="Aplicar otro abono"
                  @click="openForm(payment.athleteId, payment.period)"
                />
                <VBtn
                  v-if="installmentsFor(payment).length <= 1"
                  icon="ri-receipt-line"
                  variant="text"
                  :title="payment.totalAmount === 0 ? 'Ver constancia' : 'Ver recibo'"
                  :aria-label="`${payment.totalAmount === 0 ? 'Ver constancia' : 'Ver recibo'} de ${payerName(payment)} para ${payment.period}`"
                  @click="showReceipt(payment, installmentsFor(payment)[0])"
                />
                <VMenu v-else>
                  <template #activator="{ props: menuProps }">
                    <VBtn
                      v-bind="menuProps"
                      icon="ri-receipt-line"
                      variant="text"
                      title="Ver recibos de abonos"
                      :aria-label="`Ver recibos de ${payerName(payment)} para ${payment.period}`"
                    />
                  </template>
                  <VList aria-label="Recibos de abonos">
                    <VListItem
                      v-for="(installment, index) in installmentsFor(payment)"
                      :key="installment.id"
                      :title="`Abono ${index + 1}: ${formatCurrency(installment.amountApplied)}`"
                      :subtitle="formatDate(installment.appliedAt)"
                      @click="showReceipt(payment, installment)"
                    />
                  </VList>
                </VMenu>
              </td>
            </tr>
          </tbody>
        </VTable>
        <TablePaginator
          v-model:page="page"
          v-model:page-size="perPage"
          :total="filtered.length"
          label="pagos"
        />
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
  <PaymentNotificationStatusDialog
    v-model="notificationDialog"
    :athlete-id="notificationAthleteId"
    :athlete-name="notificationAthlete?.profile.name ?? 'Atleta'"
    :can-read="canReadNotifications && Boolean(notificationAthlete)"
    :identity-key="session.uid ?? ''"
  />
</template>
