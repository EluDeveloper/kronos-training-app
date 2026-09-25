<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatCurrency } from '@/utils/kronos'
import type { FinanceReport } from '@/utils/reporting-finance'
import { buildFinanceChart, type FinanceChartAccount } from '@/utils/reporting-charts'
import type { ReportingFilters } from '@/types/reporting'
import ReportSeriesChart from './ReportSeriesChart.vue'

const props = defineProps<{ report: FinanceReport; range: Pick<ReportingFilters, 'from' | 'through'> }>()
const detailMode = ref<'movements' | 'expenses'>('movements')
const chartAccount = ref<FinanceChartAccount>('total')
const chart = computed(() => buildFinanceChart(props.report, props.range, chartAccount.value))

const conceptCards = computed(() => [
  { label: 'Venta reconocida', value: props.report.summary.recognizedStoreRevenue, hint: 'Devengo de Tienda; no es cobro ni flujo.' },
  { label: 'Utilidad bruta de Tienda', value: props.report.summary.storeGrossProfit, hint: 'Venta reconocida menos costo histórico; no es utilidad neta.' },
  { label: 'Cartera de Tienda', value: props.report.summary.storeReceivable, hint: 'Saldo de ventas al corte.' },
  { label: 'Mensualidades esperadas', value: props.report.summary.membershipExpected, hint: 'Cargo esperado del periodo; no es efectivo recibido.' },
  { label: 'Cartera de mensualidades', value: props.report.summary.membershipReceivable, hint: 'Saldo pendiente al corte.' },
])

const movementCards = computed(() => [
  { label: 'Cobrado', value: props.report.summary.collected, hint: 'Movimientos efectivos vigentes de todas las fuentes.', mode: 'movements' as const },
  { label: 'Egresos pagados', value: props.report.summary.expensesPaid, hint: 'Sólo egresos con estado pagado.', mode: 'expenses' as const },
  { label: 'Flujo de caja', value: props.report.summary.cashFlow, hint: 'Entradas menos salidas en efectivo.', mode: 'movements' as const },
  { label: 'Flujo de banco', value: props.report.summary.bankFlow, hint: 'Transferencias y tarjetas menos salidas bancarias.', mode: 'movements' as const },
  { label: 'Otro flujo', value: props.report.summary.otherFlow, hint: 'Métodos sin cuenta de caja o banco.', mode: 'movements' as const },
  { label: 'No monetario', value: props.report.summary.nonCashFlow, hint: 'Saldo a favor; visible, pero fuera de caja y banco.', mode: 'movements' as const },
])

const methodLabel = (method: string) => ({ cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro', 'store-credit': 'Saldo a favor' }[method] ?? method)
const accountLabel = (account: string) => ({ cash: 'Caja', bank: 'Banco', other: 'Otro', 'non-cash': 'No monetario' }[account] ?? account)
const sourceLabel = (source: string) => ({ membership: 'Mensualidad', visits: 'Visitas', store: 'Tienda', 'inventory-recovery': 'Recuperación', expense: 'Egreso' }[source] ?? source)
const statusLabel = (status: string) => ({ paid: 'Pagado', pending: 'Pendiente', scheduled: 'Programado' }[status] ?? status)
const sourcePath = (source: string) => ({ membership: '/pagos', visits: '/visitas', store: '/tienda', 'inventory-recovery': '/cierres', expense: '/egresos' }[source] ?? '/reportes')

async function show(mode: 'movements' | 'expenses') {
  detailMode.value = mode
  await nextTick()
  document.querySelector('#finance-report-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <section aria-labelledby="finance-report-title">
    <div class="mb-4">
      <h2
        id="finance-report-title"
        class="text-h5 mb-1"
      >
        Finanzas
      </h2>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Devengo, cobro, cartera, egresos y flujo permanecen como conceptos separados.
      </p>
    </div>
    <VAlert
      type="info"
      variant="tonal"
      class="mb-4"
    >
      El flujo muestra movimientos de cuentas; no equivale a ingreso reconocido, utilidad bruta ni utilidad neta. Producto y atleta no recortan egresos o cierres; método y cuenta no cambian devengo, costo o cartera.
    </VAlert>
    <h3 class="text-subtitle-1 mb-3">
      Conceptos reconocidos y saldos
    </h3>
    <VRow class="mb-3">
      <VCol
        v-for="card in conceptCards"
        :key="card.label"
        cols="12"
        sm="6"
        lg="4"
      >
        <VCard class="h-100">
          <VCardText>
            <p class="text-subtitle-2 mb-2">
              {{ card.label }}
            </p><p class="text-h5 mb-2">
              {{ card.value === null ? 'No disponible' : formatCurrency(card.value) }}
            </p><p class="text-caption text-medium-emphasis mb-0">
              {{ card.hint }}
            </p>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
    <h3 class="text-subtitle-1 mb-3">
      Movimientos y flujo
    </h3>
    <VRow class="mb-3">
      <VCol
        v-for="card in movementCards"
        :key="card.label"
        cols="12"
        sm="6"
        lg="4"
      >
        <VCard class="h-100">
          <VCardText class="d-flex flex-column h-100">
            <p class="text-subtitle-2 mb-2">
              {{ card.label }}
            </p><p class="text-h5 mb-2">
              {{ formatCurrency(card.value) }}
            </p><p class="text-caption text-medium-emphasis flex-grow-1">
              {{ card.hint }}
            </p><VBtn
              size="small"
              variant="tonal"
              class="align-self-start"
              :aria-label="`Ver detalle de ${card.label}`"
              @click="show(card.mode)"
            >
              Ver detalle
            </VBtn>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
    <VAlert
      v-if="report.summary.expensesPending || report.summary.expensesScheduled"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      Compromisos sin salida de efectivo: {{ formatCurrency(report.summary.expensesPending) }} pendientes y {{ formatCurrency(report.summary.expensesScheduled) }} programados.
    </VAlert>
    <div class="d-flex flex-wrap align-center ga-3 mb-2">
      <label for="finance-chart-account">Cuenta del gráfico</label>
      <select
        id="finance-chart-account"
        v-model="chartAccount"
        class="v-field__input account-select"
      >
        <option value="total">
          Total monetario
        </option><option value="cash">
          Caja
        </option><option value="bank">
          Banco
        </option><option value="other">
          Otro
        </option>
      </select>
      <span class="text-body-2">No monetario: {{ formatCurrency(report.summary.nonCashFlow) }} (excluido del flujo).</span>
    </div>
    <ReportSeriesChart :model="chart" />
    <VCard id="finance-report-detail">
      <VCardTitle class="d-flex flex-wrap align-center justify-space-between ga-3">
        <span>Detalle financiero auditable</span><VBtnToggle
          v-model="detailMode"
          mandatory
          density="compact"
          aria-label="Tipo de detalle financiero"
        >
          <VBtn value="movements">
            Movimientos
          </VBtn><VBtn value="expenses">
            Egresos
          </VBtn>
        </VBtnToggle>
      </VCardTitle>
      <VCardText>
        <VAlert
          v-if="detailMode === 'movements' && !report.movements.length"
          type="info"
          variant="tonal"
          role="status"
        >
          No hay movimientos efectivos para los filtros seleccionados.
        </VAlert>
        <VAlert
          v-else-if="detailMode === 'expenses' && !report.expenses.length"
          type="info"
          variant="tonal"
          role="status"
        >
          No hay egresos para los filtros seleccionados.
        </VAlert>
        <div
          v-else
          class="overflow-x-auto"
        >
          <VTable
            v-if="detailMode === 'movements'"
            density="comfortable"
          >
            <thead>
              <tr>
                <th scope="col">
                  Fecha / registro
                </th><th scope="col">
                  Fuente
                </th><th scope="col">
                  Cuenta / método
                </th><th scope="col">
                  Dirección
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Importe
                </th><th scope="col">
                  <span class="sr-only">Acciones</span>
                </th>
              </tr>
            </thead><tbody>
              <tr
                v-for="movement in report.movements"
                :key="movement.id"
              >
                <td>{{ movement.date }}<span class="d-block text-caption">{{ movement.id }}</span></td><td>{{ sourceLabel(movement.source) }}<span class="d-block text-caption">{{ movement.description }}</span></td><td>{{ accountLabel(movement.account) }} · {{ methodLabel(movement.method) }}</td><td>{{ movement.direction === 'income' ? 'Entrada' : 'Salida' }}</td><td class="text-end">
                  {{ formatCurrency(movement.amount) }}
                </td><td class="text-end">
                  <VBtn
                    :to="sourcePath(movement.source)"
                    size="small"
                    variant="text"
                    :aria-label="`Abrir origen ${movement.id}`"
                  >
                    Abrir origen
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
          <VTable
            v-else
            density="comfortable"
          >
            <thead>
              <tr>
                <th scope="col">
                  Fecha / ID
                </th><th scope="col">
                  Categoría
                </th><th scope="col">
                  Estado
                </th><th scope="col">
                  Método
                </th><th
                  scope="col"
                  class="text-end"
                >
                  Importe
                </th><th scope="col">
                  <span class="sr-only">Acciones</span>
                </th>
              </tr>
            </thead><tbody>
              <tr
                v-for="expense in report.expenses"
                :key="expense.id"
              >
                <td>{{ expense.date }}<span class="d-block text-caption">{{ expense.id }}</span></td><td>
                  {{ expense.category }}<span
                    v-if="expense.subcategory"
                    class="d-block text-caption"
                  >{{ expense.subcategory }}</span>
                </td><td>{{ statusLabel(expense.status) }}</td><td>{{ methodLabel(expense.method) }}</td><td class="text-end">
                  {{ formatCurrency(expense.amount) }}
                </td><td class="text-end">
                  <VBtn
                    to="/egresos"
                    size="small"
                    variant="text"
                    :aria-label="`Abrir egreso ${expense.id}`"
                  >
                    Abrir origen
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
        </div>
      </VCardText>
    </VCard>
  </section>
</template>

<style scoped>
.account-select {
  max-width: 16rem;
  min-width: 10rem;
}
</style>
