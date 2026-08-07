<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MembershipPaymentDialog from '@/components/kronos/MembershipPaymentDialog.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { useClosuresStore } from '@/stores/closures'
import { useCommerceStore } from '@/stores/commerce'
import { useExpensesStore } from '@/stores/expenses'
import { usePaymentsStore } from '@/stores/payments'
import { usePlansStore } from '@/stores/plans'
import { useSessionStore } from '@/stores/session'
import { useVisitPaymentsStore } from '@/stores/visit-payments'
import { useVisitsStore } from '@/stores/visits'
import { useVisitorsStore } from '@/stores/visitors'
import { currentPeriod, planAccessType, planVisitLimit, type CombinedStorePayment, type MembershipPaymentInstallment, type Payment } from '@/types/domain'
import { buildFinancialMovements, dateKey, movementsBetweenDates, movementsForPeriod, periodKey, summarizeMovements } from '@/utils/financial-reports'
import { formatCurrency, formatDate, membershipBalance, membershipInstallments, membershipPaidAmount, saleBalance, timestampValue } from '@/utils/kronos'
import { buildCollectionTicket, buildMembershipReceipt, combinedStorePaymentsForInstallment, paymentMethodLabel, type ReceiptData } from '@/utils/receipts'

const athletes = useAthletesStore()
const closures = useClosuresStore()
const payments = usePaymentsStore()
const commerce = useCommerceStore()
const expenses = useExpensesStore()
const plans = usePlansStore()
const visits = useVisitsStore()
const visitors = useVisitorsStore()
const visitPayments = useVisitPaymentsStore()
const session = useSessionStore()
const { failure } = useNotifications()
const router = useRouter()
const tab = ref('month')
const today = new Date()
const period = currentPeriod(today)
const selectedYear = ref(today.getFullYear())
const paymentDialog = ref(false)
const selectedAthleteId = ref('')
const receiptDialog = ref(false)
const activeReceipt = ref<ReceiptData | null>(null)
const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const previousMonth = (value: string) => {
  const date = new Date(`${value}-15T12:00:00`)

  date.setMonth(date.getMonth() - 1)

  return currentPeriod(date)
}
const detailPeriod = ref(period)
const comparisonPeriodA = ref(period)
const comparisonPeriodB = ref(previousMonth(period))

const allFinancialMovements = computed(() => buildFinancialMovements({
  membershipPayments: payments.items,
  visitPayments: visitPayments.items,
  sales: commerce.sales,
  expenses: expenses.items,
}))

const latestCashClosure = computed(() => closures.cash
  .filter(item => item.date <= dateKey(today))
  .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null)
const movementsAfterLastClosure = computed(() => movementsBetweenDates(
  allFinancialMovements.value,
  latestCashClosure.value?.date ?? null,
  dateKey(today),
))
const accountMovementSummary = computed(() => summarizeMovements(movementsAfterLastClosure.value))
const estimatedCashBalance = computed(() => Number(latestCashClosure.value?.countedCash || 0) + accountMovementSummary.value.cashNet)
const estimatedBankBalance = computed(() => Number(latestCashClosure.value?.countedBank || 0) + accountMovementSummary.value.bankNet)
const balanceDetail = computed(() => latestCashClosure.value
  ? `Desde cierre ${formatDate(latestCashClosure.value.date)}`
  : 'Estimado desde saldo inicial $0 · realiza el primer cierre')

const membershipIncome = computed(() => payments.items
  .flatMap(payment => membershipInstallments(payment))
  .filter(installment => currentPeriod(new Date(timestampValue(installment.appliedAt))) === period)
  .reduce((total, installment) => total + Number(installment.amountApplied ?? 0), 0)
  + visitPayments.items
    .filter(payment => currentPeriod(new Date(timestampValue(payment.appliedAt))) === period)
    .reduce((total, payment) => total + Number(payment.amount || 0), 0))

const shopIncome = computed(() => commerce.sales
  .filter(sale => sale.status !== 'cancelled')
  .flatMap(sale => Object.values(sale.payments ?? {}))
  .filter(payment => currentPeriod(new Date(payment.appliedAt)) === period)
  .reduce((total, payment) => total + Number(payment.amountApplied || 0), 0))

const monthlyExpenses = computed(() => expenses.items
  .filter(expense => expense.status === 'paid' && expense.date.startsWith(period))
  .reduce((total, expense) => total + Number(expense.amount || 0), 0))

const openDebt = computed(() => commerce.openCredit.reduce((total, sale) => total + saleBalance(sale), 0))
const netCash = computed(() => membershipIncome.value + shopIncome.value - monthlyExpenses.value)

const recentPayments = computed(() => payments.items
  .flatMap(payment => membershipInstallments(payment).map(installment => ({ payment, installment })))
  .sort((a, b) => timestampValue(b.installment.appliedAt) - timestampValue(a.installment.appliedAt))
  .slice(0, 7))

const paidAthleteIds = computed(() => new Set(payments.paid
  .filter(payment => payment.period === period && !payment.visitorId)
  .map(payment => payment.athleteId)))

const unpaidAthletes = computed(() => athletes.active
  .filter(athlete => !paidAthleteIds.value.has(athlete.id)))

const overdueAthletes = computed(() => unpaidAthletes.value
  .filter(athlete => athlete.membership.paymentDay <= today.getDate())
  .sort((a, b) => a.membership.paymentDay - b.membership.paymentDay))

const upcomingAthletes = computed(() => unpaidAthletes.value
  .filter(athlete => athlete.membership.paymentDay > today.getDate() && athlete.membership.paymentDay <= today.getDate() + 7)
  .sort((a, b) => a.membership.paymentDay - b.membership.paymentDay))

const pendingExpenses = computed(() => expenses.items
  .filter(expense => expense.status !== 'paid' && expense.date.startsWith(period))
  .sort((a, b) => a.date.localeCompare(b.date)))

const couponRenewals = computed(() => athletes.active.flatMap(athlete => {
  const plan = plans.items.find(item => item.id === athlete.membership.planId)
  if (planAccessType(plan) !== 'visit-pack')
    return []
  const limit = planVisitLimit(plan)
  if (limit === null)
    return []
  const used = visits.items.filter(visit => visit.athleteId === athlete.id && visit.period === period).length
  const remaining = Math.max(0, limit - used)

  return remaining <= 2 ? [{ athlete, used, limit, remaining }] : []
}))

const actionCount = computed(() => overdueAthletes.value.length + commerce.openCredit.length + commerce.lowStock.length + pendingExpenses.value.length + couponRenewals.value.length)
const athleteName = (id: string) => athletes.items.find(item => item.id === id)?.profile.name ?? 'Atleta'
const paymentCustomerName = (payment: Payment) => payment.visitorId ? visitors.items.find(item => item.id === payment.visitorId)?.name ?? 'Visitante' : athleteName(payment.athleteId)

const storeDebtForAthlete = (athleteId: string) => commerce.openCredit
  .filter(sale => sale.athleteId === athleteId)
  .reduce((total, sale) => total + saleBalance(sale), 0)

const membershipPaymentFor = (athleteId: string) => payments.items.find(payment => payment.athleteId === athleteId && payment.period === period && !payment.visitorId)

const membershipPaymentDetail = (athleteId: string, agreedAmount: number) => {
  const payment = membershipPaymentFor(athleteId)
  const paid = membershipPaidAmount(payment)
  const balance = membershipBalance(payment, agreedAmount)

  return paid > 0 ? `Abonado ${formatCurrency(paid)} · Resta ${formatCurrency(balance)}` : formatCurrency(balance)
}

const availableYears = computed(() => {
  const years = new Set<number>([today.getFullYear()])

  payments.items.forEach(payment => membershipInstallments(payment).forEach(installment => years.add(new Date(timestampValue(installment.appliedAt)).getFullYear())))
  visitPayments.items.forEach(payment => years.add(new Date(timestampValue(payment.appliedAt)).getFullYear()))
  commerce.sales.forEach(sale => Object.values(sale.payments ?? {}).forEach(payment => years.add(new Date(payment.appliedAt).getFullYear())))
  expenses.items.forEach(expense => years.add(Number(expense.date.slice(0, 4))))

  return [...years].filter(Number.isFinite).sort((a, b) => b - a)
})

const availablePeriods = computed(() => {
  const periods = new Set<string>([period, previousMonth(period)])

  allFinancialMovements.value.forEach(movement => periods.add(movement.period))
  commerce.sales.forEach(sale => periods.add(periodKey(sale.createdAt)))
  athletes.items.forEach(athlete => {
    if (athlete.membership.registrationDate)
      periods.add(athlete.membership.registrationDate.slice(0, 7))
    if (athlete.inactiveAt)
      periods.add(athlete.inactiveAt.slice(0, 7))
  })

  return [...periods]
    .filter(value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    .sort((left, right) => right.localeCompare(left))
})

const periodLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number)

  return `${monthNames[month - 1]} ${year}`
}

function reportForPeriod(rowPeriod: string) {
  const financial = summarizeMovements(movementsForPeriod(allFinancialMovements.value, rowPeriod))
  const periodSales = commerce.sales.filter(sale => periodKey(sale.createdAt) === rowPeriod)
  const completedSales = periodSales.filter(sale => sale.status !== 'cancelled')
  const unitsSold = completedSales.reduce((total, sale) => total + Object.values(sale.items ?? {}).reduce((sum, item) => sum + Number(item.quantity || 0), 0), 0)
  const inventoryClosure = closures.inventory
    .filter(item => item.weekEnd.slice(0, 7) === rowPeriod)
    .sort((left, right) => right.weekEnd.localeCompare(left.weekEnd))[0]
  const currentStock = commerce.products.reduce((total, product) => total + Number(product.stock || 0), 0)
  const currentStockValue = commerce.products.reduce((total, product) => total + Number(product.stock || 0) * Number(product.unitCost || 0), 0)

  return {
    period: rowPeriod,
    label: periodLabel(rowPeriod),
    memberships: financial.memberships + financial.visits,
    shop: financial.store,
    income: financial.income,
    expenses: financial.expenses,
    net: financial.net,
    cash: financial.cashNet,
    bank: financial.bankNet,
    sales: completedSales.length,
    unitsSold,
    cancellations: periodSales.length - completedSales.length,
    athleteAdds: athletes.items.filter(athlete => athlete.membership.registrationDate?.startsWith(rowPeriod)).length,
    athleteDrops: athletes.items.filter(athlete => athlete.inactiveAt?.startsWith(rowPeriod)).length,
    stockUnits: inventoryClosure?.totalCountedUnits ?? (rowPeriod === period ? currentStock : null),
    stockValue: inventoryClosure
      ? Object.values(inventoryClosure.items).reduce((total, item) => total + item.countedStock * item.unitCost, 0)
      : rowPeriod === period ? currentStockValue : null,
    stockSource: inventoryClosure ? `Cierre ${formatDate(inventoryClosure.weekEnd)}` : rowPeriod === period ? 'Stock actual' : 'Sin cierre semanal',
  }
}

const annualRows = computed(() => Array.from({ length: 12 }, (_, monthIndex) => {
  const rowPeriod = `${selectedYear.value}-${String(monthIndex + 1).padStart(2, '0')}`

  return { ...reportForPeriod(rowPeriod), month: monthNames[monthIndex] }
}))

const annualMemberships = computed(() => annualRows.value.reduce((total, row) => total + row.memberships, 0))
const annualShop = computed(() => annualRows.value.reduce((total, row) => total + row.shop, 0))
const annualExpenses = computed(() => annualRows.value.reduce((total, row) => total + row.expenses, 0))
const annualNet = computed(() => annualMemberships.value + annualShop.value - annualExpenses.value)

const annualSeries = computed(() => [
  { name: 'Membresías y visitas', data: annualRows.value.map(row => row.memberships) },
  { name: 'Tienda y abonos', data: annualRows.value.map(row => row.shop) },
  { name: 'Egresos', data: annualRows.value.map(row => row.expenses) },
])

const annualChartOptions = computed(() => ({
  chart: { toolbar: { show: false }, background: 'transparent' },
  colors: ['#97D5DE', '#44797F', '#FF401B'],
  dataLabels: { enabled: false },
  grid: { borderColor: 'rgba(235,235,235,.08)' },
  legend: { labels: { colors: '#EBEBEB' } },
  plotOptions: { bar: { borderRadius: 5, columnWidth: '58%' } },
  theme: { mode: 'dark' },
  tooltip: { y: { formatter: (value: number) => formatCurrency(value) } },
  xaxis: { categories: monthNames, labels: { style: { colors: '#A9AAA8' } } },
  yaxis: { labels: { style: { colors: '#A9AAA8' }, formatter: (value: number) => `$${Math.round(value / 1000)}k` } },
}))

const detailReport = computed(() => reportForPeriod(detailPeriod.value))
const comparisonA = computed(() => reportForPeriod(comparisonPeriodA.value))
const comparisonB = computed(() => reportForPeriod(comparisonPeriodB.value))
const comparisonRows = computed(() => [
  { label: 'Ingresos totales', a: comparisonA.value.income, b: comparisonB.value.income, type: 'currency' as const, goodWhenHigher: true },
  { label: 'Egresos pagados', a: comparisonA.value.expenses, b: comparisonB.value.expenses, type: 'currency' as const, goodWhenHigher: false },
  { label: 'Resultado neto', a: comparisonA.value.net, b: comparisonB.value.net, type: 'currency' as const, goodWhenHigher: true },
  { label: 'Movimiento de efectivo', a: comparisonA.value.cash, b: comparisonB.value.cash, type: 'currency' as const, goodWhenHigher: true },
  { label: 'Movimiento bancario', a: comparisonA.value.bank, b: comparisonB.value.bank, type: 'currency' as const, goodWhenHigher: true },
  { label: 'Ventas completadas', a: comparisonA.value.sales, b: comparisonB.value.sales, type: 'number' as const, goodWhenHigher: true },
  { label: 'Unidades vendidas', a: comparisonA.value.unitsSold, b: comparisonB.value.unitsSold, type: 'number' as const, goodWhenHigher: true },
  { label: 'Altas de atletas', a: comparisonA.value.athleteAdds, b: comparisonB.value.athleteAdds, type: 'number' as const, goodWhenHigher: true },
  { label: 'Bajas de atletas', a: comparisonA.value.athleteDrops, b: comparisonB.value.athleteDrops, type: 'number' as const, goodWhenHigher: false },
].map(row => {
  const difference = row.a - row.b

  return {
    ...row,
    difference,
    tone: difference === 0 ? '' : (difference > 0) === row.goodWhenHigher ? 'text-success' : 'text-error',
  }
}))

const topProducts = computed(() => {
  const products = new Map<string, { id: string; name: string; units: number; revenue: number; cost: number }>()

  commerce.sales
    .filter(sale => sale.status !== 'cancelled' && periodKey(sale.createdAt) === detailPeriod.value)
    .forEach(sale => Object.values(sale.items ?? {}).forEach(item => {
      const current = products.get(item.productId) ?? { id: item.productId, name: item.name, units: 0, revenue: 0, cost: 0 }

      current.units += Number(item.quantity || 0)
      current.revenue += Number(item.quantity || 0) * Number(item.unitPrice || 0)
      current.cost += Number(item.quantity || 0) * Number(item.unitCost || 0)
      products.set(item.productId, current)
    }))

  return [...products.values()]
    .map(item => ({ ...item, margin: item.revenue - item.cost }))
    .sort((left, right) => right.units - left.units || right.revenue - left.revenue)
    .slice(0, 10)
})

const expenseCategories = computed(() => {
  const categories = new Map<string, number>()

  expenses.items
    .filter(expense => expense.status === 'paid' && expense.date.startsWith(detailPeriod.value))
    .forEach(expense => categories.set(expense.category, (categories.get(expense.category) ?? 0) + Number(expense.amount || 0)))

  return [...categories.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((left, right) => right.amount - left.amount)
})

const storeMovements = computed(() => allFinancialMovements.value
  .filter(movement => movement.source === 'store' && movement.period === detailPeriod.value)
  .sort((left, right) => right.occurredAt - left.occurredAt)
  .slice(0, 15))

const comparisonFormat = (value: number, type: 'currency' | 'number') => type === 'currency' ? formatCurrency(value) : value.toLocaleString('es-MX')

function collectMembership(athleteId: string) {
  selectedAthleteId.value = athleteId
  paymentDialog.value = true
}

function showReceipt(payment: Payment, installment?: MembershipPaymentInstallment, settledStorePayments: CombinedStorePayment[] = []) {
  const athlete = athletes.items.find(item => item.id === payment.athleteId)
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

function openCollectionReminder(athleteId: string) {
  const athlete = athletes.items.find(item => item.id === athleteId)
  if (!athlete) {
    failure('No fue posible preparar el aviso de cobranza.')

    return
  }

  const athleteSales = commerce.openCredit.filter(sale => sale.athleteId === athlete.id)

  activeReceipt.value = buildCollectionTicket(athlete, period, athleteSales)
  receiptDialog.value = true
}

function openCommerce(tabName: 'credit' | 'inventory') {
  router.push({ path: '/tienda', query: { tab: tabName } })
}

function openVisits(athleteId?: string) {
  router.push({ path: '/visitas', query: athleteId ? { athlete: athleteId } : undefined })
}

onMounted(() => {
  if (session.isAdmin)
    closures.subscribe()
  athletes.subscribe()
  payments.subscribe()
  commerce.subscribe()
  expenses.subscribe()
  plans.subscribe()
  visits.subscribe()
  visitors.subscribe()
  visitPayments.subscribe()
})

onBeforeUnmount(() => {
  closures.dispose()
  athletes.dispose()
  payments.dispose()
  commerce.dispose()
  expenses.dispose()
  plans.dispose()
  visits.dispose()
  visitors.dispose()
  visitPayments.dispose()
})
</script>

<template>
  <PageHeader
    title="Dashboard"
    eyebrow="Pulso del box"
    description="Indicadores, pendientes y reporte financiero sincronizados con Firebase."
  />

  <VTabs
    v-model="tab"
    class="mb-5"
  >
    <VTab value="month">
      Mes actual
    </VTab>
    <VTab
      v-if="session.isAdmin"
      value="annual"
    >
      Análisis y comparativos
    </VTab>
  </VTabs>

  <VWindow v-model="tab">
    <VWindowItem value="month">
      <VRow class="mb-2">
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Atletas activos"
            :value="athletes.active.length"
            icon="ri-team-line"
            detail="Membresías activas"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Membresías y visitas"
            :value="formatCurrency(membershipIncome)"
            icon="ri-wallet-3-line"
            color="success"
            :detail="`Cobrado en ${period}`"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Ingresos de tienda"
            :value="formatCurrency(shopIncome)"
            icon="ri-shopping-bag-3-line"
            color="secondary"
            detail="Ventas y abonos aplicados"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Flujo neto"
            :value="formatCurrency(netCash)"
            icon="ri-funds-line"
            :color="netCash >= 0 ? 'success' : 'error'"
            detail="Ingresos menos egresos pagados"
          />
        </VCol>
        <VCol
          v-if="session.isAdmin"
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Caja chica estimada"
            :value="formatCurrency(estimatedCashBalance)"
            icon="ri-cash-line"
            color="secondary"
            :detail="balanceDetail"
            @click="router.push('/cierres')"
          />
        </VCol>
        <VCol
          v-if="session.isAdmin"
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Cuenta bancaria estimada"
            :value="formatCurrency(estimatedBankBalance)"
            icon="ri-bank-line"
            color="info"
            :detail="balanceDetail"
            @click="router.push('/cierres')"
          />
        </VCol>
      </VRow>

      <VRow>
        <VCol
          cols="12"
          lg="7"
        >
          <VCard
            class="kronos-card h-100"
            rounded="xl"
          >
            <VCardItem
              title="Acciones del mes"
              :subtitle="`${actionCount} pendientes requieren atención`"
            >
              <template #append>
                <VChip
                  :color="actionCount ? 'warning' : 'success'"
                  variant="tonal"
                >
                  {{ actionCount }}
                </VChip>
              </template>
            </VCardItem>
            <VCardText>
              <EmptyState
                v-if="!actionCount"
                title="Todo al día"
                description="No hay cobros, saldos, inventario o egresos pendientes."
                icon="ri-checkbox-circle-line"
              />

              <template v-else>
                <VRow class="mb-5 align-stretch">
                  <VCol
                    cols="12"
                    sm="6"
                    lg="3"
                    class="d-flex"
                  >
                    <VCard
                      class="monthly-action-card flex-grow-1"
                      variant="tonal"
                      color="error"
                      rounded="lg"
                      @click="openCommerce('credit')"
                    >
                      <VCardText class="d-flex flex-column justify-space-between h-100">
                        <div class="text-caption">
                          Deudas de tienda
                        </div><div>
                          <div class="text-h5 font-weight-bold">
                            {{ commerce.openCredit.length }}
                          </div><div>{{ formatCurrency(openDebt) }}</div>
                        </div>
                      </VCardText>
                    </VCard>
                  </VCol>
                  <VCol
                    cols="12"
                    sm="6"
                    lg="3"
                    class="d-flex"
                  >
                    <VCard
                      class="monthly-action-card flex-grow-1"
                      variant="tonal"
                      color="warning"
                      rounded="lg"
                      @click="openCommerce('inventory')"
                    >
                      <VCardText class="d-flex flex-column justify-space-between h-100">
                        <div class="text-caption">
                          Inventario bajo
                        </div><div>
                          <div class="text-h5 font-weight-bold">
                            {{ commerce.lowStock.length }}
                          </div><div>productos</div>
                        </div>
                      </VCardText>
                    </VCard>
                  </VCol>
                  <VCol
                    cols="12"
                    sm="6"
                    lg="3"
                    class="d-flex"
                  >
                    <VCard
                      class="monthly-action-card flex-grow-1"
                      variant="tonal"
                      color="info"
                      rounded="lg"
                      to="/egresos"
                    >
                      <VCardText class="d-flex flex-column justify-space-between h-100">
                        <div class="text-caption">
                          Egresos pendientes
                        </div><div>
                          <div class="text-h5 font-weight-bold">
                            {{ pendingExpenses.length }}
                          </div><div>este mes</div>
                        </div>
                      </VCardText>
                    </VCard>
                  </VCol>
                  <VCol
                    cols="12"
                    sm="6"
                    lg="3"
                    class="d-flex"
                  >
                    <VCard
                      class="monthly-action-card flex-grow-1"
                      variant="tonal"
                      color="secondary"
                      rounded="lg"
                      @click="openVisits"
                    >
                      <VCardText class="d-flex flex-column justify-space-between h-100">
                        <div class="text-caption">
                          Cuponeras por renovar
                        </div><div>
                          <div class="text-h5 font-weight-bold">
                            {{ couponRenewals.length }}
                          </div><div>con 2 visitas o menos</div>
                        </div>
                      </VCardText>
                    </VCard>
                  </VCol>
                </VRow>

                <div
                  v-if="couponRenewals.length"
                  class="mb-5"
                >
                  <div class="d-flex align-center ga-2 mb-2">
                    <VIcon
                      icon="ri-coupon-3-line"
                      color="secondary"
                    /><span class="font-weight-bold">Cuponeras próximas a vencer</span>
                  </div>
                  <VList
                    bg-color="transparent"
                    density="comfortable"
                  >
                    <VListItem
                      v-for="item in couponRenewals"
                      :key="item.athlete.id"
                      :title="item.athlete.profile.name"
                      :subtitle="`${item.used} de ${item.limit} visitas usadas · ${item.remaining} restantes`"
                      rounded="lg"
                      @click="openVisits(item.athlete.id)"
                    >
                      <template #append>
                        <VBtn
                          size="small"
                          variant="tonal"
                          prepend-icon="ri-whatsapp-line"
                          @click.stop="openVisits(item.athlete.id)"
                        >
                          Preparar renovación
                        </VBtn>
                      </template>
                    </VListItem>
                  </VList>
                </div>

                <div
                  v-if="overdueAthletes.length"
                  class="mb-5"
                >
                  <div class="d-flex align-center ga-2 mb-2">
                    <VIcon
                      icon="ri-alarm-warning-line"
                      color="error"
                    /><span class="font-weight-bold">Mensualidades vencidas</span>
                  </div>
                  <VList
                    bg-color="transparent"
                    density="comfortable"
                  >
                    <VListItem
                      v-for="athlete in overdueAthletes"
                      :key="athlete.id"
                      :title="athlete.profile.name"
                      :subtitle="`Venció el día ${athlete.membership.paymentDay} · ${membershipPaymentDetail(athlete.id, athlete.membership.agreedAmount)}${storeDebtForAthlete(athlete.id) ? ` · Tienda: ${formatCurrency(storeDebtForAthlete(athlete.id))}` : ''}`"
                      rounded="lg"
                      @click="collectMembership(athlete.id)"
                    >
                      <template #append>
                        <div class="d-flex flex-wrap ga-2 justify-end">
                          <VBtn
                            size="small"
                            variant="text"
                            prepend-icon="ri-whatsapp-line"
                            @click.stop="openCollectionReminder(athlete.id)"
                          >
                            Recordar
                          </VBtn><VBtn
                            size="small"
                            color="error"
                            variant="tonal"
                            @click.stop="collectMembership(athlete.id)"
                          >
                            Cobrar
                          </VBtn>
                        </div>
                      </template>
                    </VListItem>
                  </VList>
                </div>

                <div
                  v-if="upcomingAthletes.length"
                  class="mb-5"
                >
                  <div class="d-flex align-center ga-2 mb-2">
                    <VIcon
                      icon="ri-calendar-check-line"
                      color="warning"
                    /><span class="font-weight-bold">Próximos vencimientos</span>
                  </div>
                  <VList
                    bg-color="transparent"
                    density="comfortable"
                  >
                    <VListItem
                      v-for="athlete in upcomingAthletes"
                      :key="athlete.id"
                      :title="athlete.profile.name"
                      :subtitle="`Vence el día ${athlete.membership.paymentDay} · ${membershipPaymentDetail(athlete.id, athlete.membership.agreedAmount)}${storeDebtForAthlete(athlete.id) ? ` · Tienda: ${formatCurrency(storeDebtForAthlete(athlete.id))}` : ''}`"
                      rounded="lg"
                      @click="collectMembership(athlete.id)"
                    >
                      <template #append>
                        <div class="d-flex flex-wrap ga-2 justify-end">
                          <VBtn
                            size="small"
                            variant="text"
                            prepend-icon="ri-whatsapp-line"
                            @click.stop="openCollectionReminder(athlete.id)"
                          >
                            Recordar
                          </VBtn><VBtn
                            size="small"
                            variant="tonal"
                            @click.stop="collectMembership(athlete.id)"
                          >
                            Preparar cobro
                          </VBtn>
                        </div>
                      </template>
                    </VListItem>
                  </VList>
                </div>
              </template>
            </VCardText>
          </VCard>
        </VCol>

        <VCol
          cols="12"
          lg="5"
        >
          <VCard
            class="kronos-card mb-4"
            rounded="xl"
          >
            <VCardText class="d-flex align-center justify-space-between ga-4">
              <div>
                <p class="text-caption text-medium-emphasis mb-1">
                  Cuentas por cobrar
                </p><p class="text-h4 font-weight-bold text-kronos-orange mb-0">
                  {{ formatCurrency(openDebt) }}
                </p>
              </div>
              <VChip
                color="error"
                variant="tonal"
              >
                {{ commerce.openCredit.length }} ventas
              </VChip>
            </VCardText>
          </VCard>

          <VCard
            class="kronos-card"
            rounded="xl"
          >
            <VCardItem
              title="Pagos recientes"
              subtitle="Últimas mensualidades aplicadas"
            />
            <VCardText>
              <EmptyState
                v-if="!recentPayments.length"
                title="Sin pagos todavía"
                description="Los pagos aplicados aparecerán aquí."
                icon="ri-wallet-line"
              />
              <VList
                v-else
                bg-color="transparent"
                density="comfortable"
              >
                <VListItem
                  v-for="entry in recentPayments"
                  :key="entry.installment.id"
                  :title="paymentCustomerName(entry.payment)"
                  :subtitle="`${entry.payment.visitorId ? 'Visitas' : 'Membresía'} · ${entry.payment.period} · ${formatDate(entry.installment.appliedAt)}`"
                  @click="showReceipt(entry.payment, entry.installment)"
                >
                  <template #append>
                    <span class="text-success font-weight-bold">{{ formatCurrency(entry.installment.amountApplied) }}</span>
                  </template>
                </VListItem>
              </VList>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VWindowItem>

    <VWindowItem
      v-if="session.isAdmin"
      value="annual"
    >
      <div class="d-flex flex-wrap justify-space-between align-center ga-4 mb-5">
        <div>
          <h2 class="text-h5 font-weight-bold mb-1">
            Visibilidad financiera y operativa
          </h2><p class="text-body-2 text-medium-emphasis mb-0">
            Flujo por fecha de aplicación, movimientos de tienda, atletas e inventario auditado.
          </p>
        </div>
        <VSelect
          v-model="selectedYear"
          :items="availableYears"
          label="Año"
          density="compact"
          hide-details
          style="max-inline-size: 160px"
        />
      </div>

      <VRow class="mb-2">
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Membresías y visitas"
            :value="formatCurrency(annualMemberships)"
            icon="ri-wallet-3-line"
            color="success"
            :detail="`${selectedYear}`"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Tienda y abonos"
            :value="formatCurrency(annualShop)"
            icon="ri-shopping-bag-3-line"
            color="secondary"
            :detail="`${selectedYear}`"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Egresos"
            :value="formatCurrency(annualExpenses)"
            icon="ri-arrow-down-circle-line"
            color="error"
            :detail="`${selectedYear}`"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard
            label="Resultado neto"
            :value="formatCurrency(annualNet)"
            icon="ri-funds-line"
            :color="annualNet >= 0 ? 'success' : 'error'"
            :detail="`${selectedYear}`"
          />
        </VCol>
      </VRow>

      <VRow>
        <VCol
          cols="12"
        >
          <VCard
            class="kronos-card h-100"
            rounded="xl"
          >
            <VCardItem
              title="Ingresos y egresos por mes"
              subtitle="Comparativo de flujo en MXN"
            />
            <VCardText>
              <VueApexCharts
                type="bar"
                height="360"
                :options="annualChartOptions"
                :series="annualSeries"
              />
            </VCardText>
          </VCard>
        </VCol>
        <VCol
          cols="12"
        >
          <VCard
            class="kronos-card h-100"
            rounded="xl"
          >
            <VCardItem
              title="Detalle mensual"
              :subtitle="`Ejercicio ${selectedYear}`"
            />
            <div class="report-table-wrap">
              <VTable density="compact">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th class="text-right">Ingresos</th>
                  <th class="text-right">Egresos</th>
                  <th class="text-right">Neto</th>
                  <th class="text-right">Ventas</th>
                  <th class="text-right">Unidades</th>
                  <th class="text-right">Canceladas</th>
                  <th class="text-right">Altas</th>
                  <th class="text-right">Bajas</th>
                  <th class="text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in annualRows"
                  :key="row.month"
                >
                  <td>{{ row.month }}</td>
                  <td class="text-right">
                    {{ formatCurrency(row.income) }}
                  </td>
                  <td class="text-right text-error">
                    {{ formatCurrency(row.expenses) }}
                  </td>
                  <td
                    class="text-right font-weight-bold"
                    :class="row.net >= 0 ? 'text-success' : 'text-error'"
                  >
                    {{ formatCurrency(row.net) }}
                  </td>
                  <td class="text-right">{{ row.sales }}</td>
                  <td class="text-right">{{ row.unitsSold }}</td>
                  <td class="text-right">{{ row.cancellations }}</td>
                  <td class="text-right text-success">{{ row.athleteAdds }}</td>
                  <td class="text-right text-error">{{ row.athleteDrops }}</td>
                  <td
                    class="text-right"
                    :title="row.stockSource"
                  >
                    {{ row.stockUnits ?? '—' }}
                  </td>
                </tr>
              </tbody>
              </VTable>
            </div>
          </VCard>
        </VCol>
      </VRow>

      <VCard
        class="kronos-card mt-5"
        rounded="xl"
      >
        <VCardItem
          title="Comparar dos meses"
          subtitle="Elige los periodos que quieres revisar lado a lado"
        />
        <VCardText>
          <VRow class="mb-3">
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="comparisonPeriodA"
                :items="availablePeriods.map(value => ({ title: periodLabel(value), value }))"
                label="Mes principal"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="comparisonPeriodB"
                :items="availablePeriods.map(value => ({ title: periodLabel(value), value }))"
                label="Mes para comparar"
              />
            </VCol>
          </VRow>
          <div class="report-table-wrap">
            <VTable density="comfortable">
              <thead>
                <tr><th>Indicador</th><th class="text-right">{{ periodLabel(comparisonPeriodA) }}</th><th class="text-right">{{ periodLabel(comparisonPeriodB) }}</th><th class="text-right">Diferencia</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in comparisonRows"
                  :key="row.label"
                >
                  <td class="font-weight-medium">{{ row.label }}</td>
                  <td class="text-right">{{ comparisonFormat(row.a, row.type) }}</td>
                  <td class="text-right">{{ comparisonFormat(row.b, row.type) }}</td>
                  <td
                    class="text-right font-weight-bold"
                    :class="row.tone"
                  >
                    {{ comparisonFormat(row.difference, row.type) }}
                  </td>
                </tr>
              </tbody>
            </VTable>
          </div>
        </VCardText>
      </VCard>

      <div class="d-flex flex-wrap justify-space-between align-center ga-4 mt-7 mb-4">
        <div>
          <h2 class="text-h5 font-weight-bold mb-1">Detalle del mes</h2>
          <p class="text-body-2 text-medium-emphasis mb-0">Productos, egresos y movimientos aplicados.</p>
        </div>
        <VSelect
          v-model="detailPeriod"
          :items="availablePeriods.map(value => ({ title: periodLabel(value), value }))"
          label="Mes"
          density="compact"
          hide-details
          style="max-inline-size: 220px"
        />
      </div>

      <VRow class="mb-2">
        <VCol cols="12" sm="6" lg="3">
          <MetricCard label="Ingresos del mes" :value="formatCurrency(detailReport.income)" icon="ri-arrow-up-circle-line" color="success" :detail="periodLabel(detailPeriod)" />
        </VCol>
        <VCol cols="12" sm="6" lg="3">
          <MetricCard label="Egresos del mes" :value="formatCurrency(detailReport.expenses)" icon="ri-arrow-down-circle-line" color="error" :detail="periodLabel(detailPeriod)" />
        </VCol>
        <VCol cols="12" sm="6" lg="3">
          <MetricCard label="Altas / Bajas" :value="`${detailReport.athleteAdds} / ${detailReport.athleteDrops}`" icon="ri-user-follow-line" detail="Movimientos de atletas" />
        </VCol>
        <VCol cols="12" sm="6" lg="3">
          <MetricCard label="Stock auditado" :value="detailReport.stockUnits ?? 'Sin cierre'" icon="ri-archive-stack-line" color="secondary" :detail="detailReport.stockSource" />
        </VCol>
      </VRow>

      <VRow>
        <VCol cols="12" lg="7">
          <VCard class="kronos-card h-100" rounded="xl">
            <VCardItem title="Productos más vendidos" :subtitle="`${periodLabel(detailPeriod)} · ordenado por unidades`" />
            <EmptyState
              v-if="!topProducts.length"
              title="Sin productos vendidos"
              description="No hay ventas completadas en este periodo."
              icon="ri-shopping-bag-line"
            />
            <VTable v-else density="compact">
              <thead><tr><th>Producto</th><th class="text-right">Unidades</th><th class="text-right">Venta</th><th class="text-right">Margen estimado</th></tr></thead>
              <tbody>
                <tr v-for="(product, index) in topProducts" :key="product.id">
                  <td><VChip v-if="index === 0" color="secondary" size="x-small" class="mr-2">Más vendido</VChip>{{ product.name }}</td>
                  <td class="text-right font-weight-bold">{{ product.units }}</td>
                  <td class="text-right">{{ formatCurrency(product.revenue) }}</td>
                  <td class="text-right text-success">{{ formatCurrency(product.margin) }}</td>
                </tr>
              </tbody>
            </VTable>
          </VCard>
        </VCol>
        <VCol cols="12" lg="5">
          <VCard class="kronos-card h-100" rounded="xl">
            <VCardItem title="Egresos por categoría" :subtitle="periodLabel(detailPeriod)" />
            <EmptyState
              v-if="!expenseCategories.length"
              title="Sin egresos pagados"
              description="No hay movimientos para este periodo."
              icon="ri-money-dollar-circle-line"
            />
            <VList v-else bg-color="transparent">
              <VListItem v-for="category in expenseCategories" :key="category.category" :title="category.category">
                <template #append><strong class="text-error">{{ formatCurrency(category.amount) }}</strong></template>
              </VListItem>
            </VList>
          </VCard>
        </VCol>
      </VRow>

      <VCard class="kronos-card mt-5" rounded="xl">
        <VCardItem title="Movimientos de tienda" :subtitle="`${periodLabel(detailPeriod)} · últimos 15 pagos y abonos`" />
        <EmptyState
          v-if="!storeMovements.length"
          title="Sin movimientos de tienda"
          description="No hay ventas o abonos aplicados en este periodo."
          icon="ri-exchange-dollar-line"
        />
        <VTable v-else density="compact">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th>Destino</th><th class="text-right">Importe</th></tr></thead>
          <tbody>
            <tr v-for="movement in storeMovements" :key="movement.id">
              <td>{{ formatDate(movement.occurredAt) }}</td>
              <td>{{ movement.description }}</td>
              <td>{{ paymentMethodLabel(movement.method) }}</td>
              <td>{{ movement.account === 'cash' ? 'Caja' : movement.account === 'bank' ? 'Banco' : movement.account === 'non-cash' ? 'Saldo a favor' : 'Otro' }}</td>
              <td class="text-right text-success font-weight-bold">{{ formatCurrency(movement.amount) }}</td>
            </tr>
          </tbody>
        </VTable>
      </VCard>
    </VWindowItem>
  </VWindow>

  <MembershipPaymentDialog
    v-model="paymentDialog"
    :athlete-id="selectedAthleteId"
    :period="period"
    :store-sales="commerce.openCredit.filter(sale => sale.athleteId === selectedAthleteId)"
    @saved="showReceipt"
  />
  <ReceiptDialog
    v-model="receiptDialog"
    :receipt="activeReceipt"
  />
</template>

<style scoped>
.v-card[role='link'],
.v-card.v-card--link {
  cursor: pointer;
}

.monthly-action-card {
  min-block-size: 158px;
}

.report-table-wrap {
  overflow-x: auto;
}

.report-table-wrap .v-table {
  min-inline-size: 980px;
}
</style>
