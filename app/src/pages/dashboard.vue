<script setup lang="ts">
import MetricCard from '@/components/kronos/MetricCard.vue'
import EmptyState from '@/components/kronos/EmptyState.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import { useAthletesStore } from '@/stores/athletes'
import { useCommerceStore } from '@/stores/commerce'
import { useExpensesStore } from '@/stores/expenses'
import { usePaymentsStore } from '@/stores/payments'
import { currentPeriod } from '@/types/domain'
import { formatCurrency, formatDate, saleBalance, timestampValue } from '@/utils/kronos'

const athletes = useAthletesStore()
const payments = usePaymentsStore()
const commerce = useCommerceStore()
const expenses = useExpensesStore()
const period = currentPeriod()

const membershipIncome = computed(() => payments.items
  .filter(payment => payment.period === period && payment.status === 'paid')
  .reduce((total, payment) => total + Number(payment.amount ?? 0), 0))

const shopIncome = computed(() => commerce.sales
  .filter(sale => sale.status !== 'cancelled')
  .flatMap(sale => Object.values(sale.payments ?? {}))
  .filter(payment => {
    const date = new Date(payment.appliedAt)
    return currentPeriod(date) === period
  })
  .reduce((total, payment) => total + Number(payment.amountApplied || 0), 0))

const monthlyExpenses = computed(() => expenses.items
  .filter(expense => expense.status === 'paid' && expense.date.startsWith(period))
  .reduce((total, expense) => total + Number(expense.amount || 0), 0))

const openDebt = computed(() => commerce.openCredit.reduce((total, sale) => total + saleBalance(sale), 0))
const netCash = computed(() => membershipIncome.value + shopIncome.value - monthlyExpenses.value)
const recentPayments = computed(() => [...payments.paid]
  .sort((a, b) => timestampValue(b.appliedAt) - timestampValue(a.appliedAt))
  .slice(0, 7))

const athleteName = (id: string) => athletes.items.find(item => item.id === id)?.profile.name ?? 'Atleta'

onMounted(() => {
  athletes.subscribe()
  payments.subscribe()
  commerce.subscribe()
  expenses.subscribe()
})

onBeforeUnmount(() => {
  athletes.dispose()
  payments.dispose()
  commerce.dispose()
  expenses.dispose()
})
</script>

<template>
  <PageHeader title="Dashboard" eyebrow="Pulso del box" description="Indicadores del periodo actual sincronizados con Firebase." />

  <VRow class="mb-2">
    <VCol cols="12" sm="6" lg="3">
      <MetricCard label="Atletas activos" :value="athletes.active.length" icon="ri-team-line" detail="Membresías activas" />
    </VCol>
    <VCol cols="12" sm="6" lg="3">
      <MetricCard label="Mensualidades" :value="formatCurrency(membershipIncome)" icon="ri-wallet-3-line" color="success" :detail="`Periodo ${period}`" />
    </VCol>
    <VCol cols="12" sm="6" lg="3">
      <MetricCard label="Ingresos de tienda" :value="formatCurrency(shopIncome)" icon="ri-shopping-bag-3-line" color="secondary" detail="Efectivo aplicado, sin cambio" />
    </VCol>
    <VCol cols="12" sm="6" lg="3">
      <MetricCard label="Flujo neto" :value="formatCurrency(netCash)" icon="ri-funds-line" :color="netCash >= 0 ? 'success' : 'error'" detail="Ingresos menos egresos pagados" />
    </VCol>
  </VRow>

  <VRow>
    <VCol cols="12" lg="7">
      <VCard class="kronos-card h-100" rounded="xl">
        <VCardItem title="Pagos recientes" subtitle="Últimas mensualidades aplicadas" />
        <VCardText>
          <EmptyState v-if="!recentPayments.length" title="Sin pagos todavía" description="Los pagos aplicados aparecerán aquí." icon="ri-wallet-line" />
          <VTable v-else density="comfortable">
            <thead><tr><th>Atleta</th><th>Periodo</th><th>Fecha</th><th class="text-right">Monto</th></tr></thead>
            <tbody>
              <tr v-for="payment in recentPayments" :key="`${payment.athleteId}-${payment.period}`">
                <td class="font-weight-medium">{{ athleteName(payment.athleteId) }}</td>
                <td>{{ payment.period }}</td>
                <td>{{ formatDate(payment.appliedAt) }}</td>
                <td class="text-right text-success font-weight-bold">{{ formatCurrency(payment.amount ?? 0) }}</td>
              </tr>
            </tbody>
          </VTable>
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
        <VCardItem title="Inventario bajo" :subtitle="`${commerce.lowStock.length} productos requieren atención`" />
        <VCardText>
          <EmptyState v-if="!commerce.lowStock.length" title="Inventario saludable" description="No hay productos debajo del nivel de alerta." icon="ri-checkbox-circle-line" />
          <VList v-else bg-color="transparent">
            <VListItem v-for="product in commerce.lowStock" :key="product.id" :title="product.name" :subtitle="`Mínimo: ${product.alertLevel}`">
              <template #append><VChip color="error" variant="tonal" size="small">{{ product.stock }} disponibles</VChip></template>
            </VListItem>
          </VList>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
