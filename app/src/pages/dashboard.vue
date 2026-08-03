<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MembershipPaymentDialog from '@/components/kronos/MembershipPaymentDialog.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { useCommerceStore } from '@/stores/commerce'
import { useExpensesStore } from '@/stores/expenses'
import { usePaymentsStore } from '@/stores/payments'
import { usePlansStore } from '@/stores/plans'
import { currentPeriod, type Payment } from '@/types/domain'
import { formatCurrency, formatDate, saleBalance, timestampValue } from '@/utils/kronos'
import { buildCollectionTicket, buildMembershipReceipt, type ReceiptData } from '@/utils/receipts'

const athletes = useAthletesStore()
const payments = usePaymentsStore()
const commerce = useCommerceStore()
const expenses = useExpensesStore()
const plans = usePlansStore()
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

const paymentAccountingPeriod = (payment: Payment) => {
  const appliedAt = timestampValue(payment.appliedAt)

  return appliedAt ? currentPeriod(new Date(appliedAt)) : payment.period
}

const membershipIncome = computed(() => payments.paid
  .filter(payment => paymentAccountingPeriod(payment) === period)
  .reduce((total, payment) => total + Number(payment.amount ?? 0), 0))

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
const recentPayments = computed(() => [...payments.paid]
  .sort((a, b) => timestampValue(b.appliedAt) - timestampValue(a.appliedAt))
  .slice(0, 7))

const paidAthleteIds = computed(() => new Set(payments.paid
  .filter(payment => payment.period === period)
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

const actionCount = computed(() => overdueAthletes.value.length + commerce.openCredit.length + commerce.lowStock.length + pendingExpenses.value.length)
const athleteName = (id: string) => athletes.items.find(item => item.id === id)?.profile.name ?? 'Atleta'
const storeDebtForAthlete = (athleteId: string) => commerce.openCredit
  .filter(sale => sale.athleteId === athleteId)
  .reduce((total, sale) => total + saleBalance(sale), 0)

const availableYears = computed(() => {
  const years = new Set<number>([today.getFullYear()])
  payments.paid.forEach(payment => years.add(Number(paymentAccountingPeriod(payment).slice(0, 4))))
  commerce.sales.forEach(sale => Object.values(sale.payments ?? {}).forEach(payment => years.add(new Date(payment.appliedAt).getFullYear())))
  expenses.items.forEach(expense => years.add(Number(expense.date.slice(0, 4))))

  return [...years].filter(Number.isFinite).sort((a, b) => b - a)
})

const annualRows = computed(() => Array.from({ length: 12 }, (_, monthIndex) => {
  const rowPeriod = `${selectedYear.value}-${String(monthIndex + 1).padStart(2, '0')}`
  const memberships = payments.paid
    .filter(payment => paymentAccountingPeriod(payment) === rowPeriod)
    .reduce((total, payment) => total + Number(payment.amount ?? 0), 0)
  const shop = commerce.sales
    .filter(sale => sale.status !== 'cancelled')
    .flatMap(sale => Object.values(sale.payments ?? {}))
    .filter(payment => currentPeriod(new Date(payment.appliedAt)) === rowPeriod)
    .reduce((total, payment) => total + Number(payment.amountApplied || 0), 0)
  const expenseTotal = expenses.items
    .filter(expense => expense.status === 'paid' && expense.date.startsWith(rowPeriod))
    .reduce((total, expense) => total + Number(expense.amount || 0), 0)

  return {
    month: monthNames[monthIndex],
    memberships,
    shop,
    expenses: expenseTotal,
    net: memberships + shop - expenseTotal,
  }
}))

const annualMemberships = computed(() => annualRows.value.reduce((total, row) => total + row.memberships, 0))
const annualShop = computed(() => annualRows.value.reduce((total, row) => total + row.shop, 0))
const annualExpenses = computed(() => annualRows.value.reduce((total, row) => total + row.expenses, 0))
const annualNet = computed(() => annualMemberships.value + annualShop.value - annualExpenses.value)

const annualSeries = computed(() => [
  { name: 'Mensualidades', data: annualRows.value.map(row => row.memberships) },
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

function collectMembership(athleteId: string) {
  selectedAthleteId.value = athleteId
  paymentDialog.value = true
}

function showReceipt(payment: Payment) {
  const athlete = athletes.items.find(item => item.id === payment.athleteId)
  if (!athlete) {
    failure('No fue posible relacionar el recibo con el atleta.')
    return
  }

  const planName = plans.items.find(plan => plan.id === athlete.membership.planId)?.name
  activeReceipt.value = buildMembershipReceipt(payment, athlete, planName)
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

onMounted(() => {
  athletes.subscribe()
  payments.subscribe()
  commerce.subscribe()
  expenses.subscribe()
  plans.subscribe()
})

onBeforeUnmount(() => {
  athletes.dispose()
  payments.dispose()
  commerce.dispose()
  expenses.dispose()
  plans.dispose()
})
</script>

<template>
  <PageHeader title="Dashboard" eyebrow="Pulso del box" description="Indicadores, pendientes y reporte financiero sincronizados con Firebase." />

  <VTabs v-model="tab" class="mb-5">
    <VTab value="month">Mes actual</VTab>
    <VTab value="annual">Reporte anual</VTab>
  </VTabs>

  <VWindow v-model="tab">
    <VWindowItem value="month">
      <VRow class="mb-2">
        <VCol cols="12" sm="6" lg="3">
          <MetricCard label="Atletas activos" :value="athletes.active.length" icon="ri-team-line" detail="Membresías activas" />
        </VCol>
        <VCol cols="12" sm="6" lg="3">
          <MetricCard label="Mensualidades" :value="formatCurrency(membershipIncome)" icon="ri-wallet-3-line" color="success" :detail="`Cobrado en ${period}`" />
        </VCol>
        <VCol cols="12" sm="6" lg="3">
          <MetricCard label="Ingresos de tienda" :value="formatCurrency(shopIncome)" icon="ri-shopping-bag-3-line" color="secondary" detail="Ventas y abonos aplicados" />
        </VCol>
        <VCol cols="12" sm="6" lg="3">
          <MetricCard label="Flujo neto" :value="formatCurrency(netCash)" icon="ri-funds-line" :color="netCash >= 0 ? 'success' : 'error'" detail="Ingresos menos egresos pagados" />
        </VCol>
      </VRow>

      <VRow>
        <VCol cols="12" lg="7">
          <VCard class="kronos-card h-100" rounded="xl">
            <VCardItem title="Acciones del mes" :subtitle="`${actionCount} pendientes requieren atención`">
              <template #append><VChip :color="actionCount ? 'warning' : 'success'" variant="tonal">{{ actionCount }}</VChip></template>
            </VCardItem>
            <VCardText>
              <EmptyState v-if="!actionCount" title="Todo al día" description="No hay cobros, saldos, inventario o egresos pendientes." icon="ri-checkbox-circle-line" />

              <template v-else>
                <VRow class="mb-5">
                  <VCol cols="12" md="4">
                    <VCard variant="tonal" color="error" rounded="lg" @click="openCommerce('credit')">
                      <VCardText><div class="text-caption">Deudas de tienda</div><div class="text-h5 font-weight-bold">{{ commerce.openCredit.length }}</div><div>{{ formatCurrency(openDebt) }}</div></VCardText>
                    </VCard>
                  </VCol>
                  <VCol cols="12" md="4">
                    <VCard variant="tonal" color="warning" rounded="lg" @click="openCommerce('inventory')">
                      <VCardText><div class="text-caption">Inventario bajo</div><div class="text-h5 font-weight-bold">{{ commerce.lowStock.length }}</div><div>productos</div></VCardText>
                    </VCard>
                  </VCol>
                  <VCol cols="12" md="4">
                    <VCard variant="tonal" color="info" rounded="lg" to="/egresos">
                      <VCardText><div class="text-caption">Egresos pendientes</div><div class="text-h5 font-weight-bold">{{ pendingExpenses.length }}</div><div>este mes</div></VCardText>
                    </VCard>
                  </VCol>
                </VRow>

                <div v-if="overdueAthletes.length" class="mb-5">
                  <div class="d-flex align-center ga-2 mb-2"><VIcon icon="ri-alarm-warning-line" color="error" /><span class="font-weight-bold">Mensualidades vencidas</span></div>
                  <VList bg-color="transparent" density="comfortable">
                    <VListItem v-for="athlete in overdueAthletes" :key="athlete.id" :title="athlete.profile.name" :subtitle="`Venció el día ${athlete.membership.paymentDay} · ${formatCurrency(athlete.membership.agreedAmount)}${storeDebtForAthlete(athlete.id) ? ` · Tienda: ${formatCurrency(storeDebtForAthlete(athlete.id))}` : ''}`" rounded="lg" @click="collectMembership(athlete.id)">
                      <template #append><div class="d-flex flex-wrap ga-2 justify-end"><VBtn size="small" variant="text" prepend-icon="ri-whatsapp-line" @click.stop="openCollectionReminder(athlete.id)">Recordar</VBtn><VBtn size="small" color="error" variant="tonal" @click.stop="collectMembership(athlete.id)">Cobrar</VBtn></div></template>
                    </VListItem>
                  </VList>
                </div>

                <div v-if="upcomingAthletes.length" class="mb-5">
                  <div class="d-flex align-center ga-2 mb-2"><VIcon icon="ri-calendar-check-line" color="warning" /><span class="font-weight-bold">Próximos vencimientos</span></div>
                  <VList bg-color="transparent" density="comfortable">
                    <VListItem v-for="athlete in upcomingAthletes" :key="athlete.id" :title="athlete.profile.name" :subtitle="`Vence el día ${athlete.membership.paymentDay}${storeDebtForAthlete(athlete.id) ? ` · Tienda: ${formatCurrency(storeDebtForAthlete(athlete.id))}` : ''}`" rounded="lg" @click="collectMembership(athlete.id)">
                      <template #append><div class="d-flex flex-wrap ga-2 justify-end"><VBtn size="small" variant="text" prepend-icon="ri-whatsapp-line" @click.stop="openCollectionReminder(athlete.id)">Recordar</VBtn><VBtn size="small" variant="tonal" @click.stop="collectMembership(athlete.id)">Preparar cobro</VBtn></div></template>
                    </VListItem>
                  </VList>
                </div>
              </template>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="12" lg="5">
          <VCard class="kronos-card mb-4" rounded="xl">
            <VCardText class="d-flex align-center justify-space-between ga-4">
              <div><p class="text-caption text-medium-emphasis mb-1">Cuentas por cobrar</p><p class="text-h4 font-weight-bold text-kronos-orange mb-0">{{ formatCurrency(openDebt) }}</p></div>
              <VChip color="error" variant="tonal">{{ commerce.openCredit.length }} ventas</VChip>
            </VCardText>
          </VCard>

          <VCard class="kronos-card" rounded="xl">
            <VCardItem title="Pagos recientes" subtitle="Últimas mensualidades aplicadas" />
            <VCardText>
              <EmptyState v-if="!recentPayments.length" title="Sin pagos todavía" description="Los pagos aplicados aparecerán aquí." icon="ri-wallet-line" />
              <VList v-else bg-color="transparent" density="comfortable">
                <VListItem v-for="payment in recentPayments" :key="`${payment.athleteId}-${payment.period}`" :title="athleteName(payment.athleteId)" :subtitle="`${payment.period} · ${formatDate(payment.appliedAt)}`">
                  <template #append><span class="text-success font-weight-bold">{{ formatCurrency(payment.amount ?? 0) }}</span></template>
                </VListItem>
              </VList>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VWindowItem>

    <VWindowItem value="annual">
      <div class="d-flex flex-wrap justify-space-between align-center ga-4 mb-5">
        <div><h2 class="text-h5 font-weight-bold mb-1">Reporte anual</h2><p class="text-body-2 text-medium-emphasis mb-0">Flujo real por fecha de aplicación.</p></div>
        <VSelect v-model="selectedYear" :items="availableYears" label="Año" density="compact" hide-details style="max-inline-size: 160px" />
      </div>

      <VRow class="mb-2">
        <VCol cols="12" sm="6" lg="3"><MetricCard label="Mensualidades" :value="formatCurrency(annualMemberships)" icon="ri-wallet-3-line" color="success" :detail="`${selectedYear}`" /></VCol>
        <VCol cols="12" sm="6" lg="3"><MetricCard label="Tienda y abonos" :value="formatCurrency(annualShop)" icon="ri-shopping-bag-3-line" color="secondary" :detail="`${selectedYear}`" /></VCol>
        <VCol cols="12" sm="6" lg="3"><MetricCard label="Egresos" :value="formatCurrency(annualExpenses)" icon="ri-arrow-down-circle-line" color="error" :detail="`${selectedYear}`" /></VCol>
        <VCol cols="12" sm="6" lg="3"><MetricCard label="Resultado neto" :value="formatCurrency(annualNet)" icon="ri-funds-line" :color="annualNet >= 0 ? 'success' : 'error'" :detail="`${selectedYear}`" /></VCol>
      </VRow>

      <VRow>
        <VCol cols="12" xl="8">
          <VCard class="kronos-card h-100" rounded="xl">
            <VCardItem title="Ingresos y egresos por mes" subtitle="Comparativo de flujo en MXN" />
            <VCardText><VueApexCharts type="bar" height="360" :options="annualChartOptions" :series="annualSeries" /></VCardText>
          </VCard>
        </VCol>
        <VCol cols="12" xl="4">
          <VCard class="kronos-card h-100" rounded="xl">
            <VCardItem title="Detalle mensual" :subtitle="`Ejercicio ${selectedYear}`" />
            <VTable density="compact">
              <thead><tr><th>Mes</th><th class="text-right">Ingresos</th><th class="text-right">Neto</th></tr></thead>
              <tbody>
                <tr v-for="row in annualRows" :key="row.month">
                  <td>{{ row.month }}</td>
                  <td class="text-right">{{ formatCurrency(row.memberships + row.shop) }}</td>
                  <td class="text-right font-weight-bold" :class="row.net >= 0 ? 'text-success' : 'text-error'">{{ formatCurrency(row.net) }}</td>
                </tr>
              </tbody>
            </VTable>
          </VCard>
        </VCol>
      </VRow>
    </VWindowItem>
  </VWindow>

  <MembershipPaymentDialog v-model="paymentDialog" :athlete-id="selectedAthleteId" :period="period" @saved="showReceipt" />
  <ReceiptDialog v-model="receiptDialog" :receipt="activeReceipt" />
</template>

<style scoped>
.v-card[role='link'],
.v-card.v-card--link {
  cursor: pointer;
}
</style>
