<script setup lang="ts">
import { dateForBusinessTimeZone, normalizeReportingFilters, parseReportingFilters, serializeReportingFilters } from '@/utils/reporting-periods'
import { buildExecutiveStoreMetrics, buildStoreTimeline, storeMetricFromQuery } from '@/utils/reporting-executive'
import { buildStoreReport, type StoreMetricKey } from '@/utils/reporting-store'
import { buildAthleteReport } from '@/utils/reporting-athletes'
import { buildMembershipReport } from '@/utils/reporting-memberships'
import { buildInventoryReport } from '@/utils/reporting-inventory'
import { buildWorkforceReport } from '@/utils/reporting-workforce'
import { buildFinanceReport } from '@/utils/reporting-finance'
import { buildReportingExportRows, reportingExportFilename } from '@/utils/reporting-export'
import { createReportingStoreQaFixture, reportingStoreQaFilters } from '@/utils/reporting-store-qa-fixture'
import { createReportingAthletesMembershipsQaFixture, reportingAthletesMembershipsQaFilters } from '@/utils/reporting-athletes-memberships-qa-fixture'
import { createReportingInventoryWorkforceQaFixture, reportingInventoryWorkforceQaFilters } from '@/utils/reporting-inventory-workforce-qa-fixture'
import { createReportingFinanceQaFixture, reportingFinanceQaFilters } from '@/utils/reporting-finance-qa-fixture'
import { useReportingStore } from '@/stores/reporting'
import { useSessionStore } from '@/stores/session'
import type { ReportingFilters } from '@/types/reporting'
import ExecutiveOverview from '@/components/kronos/reports/ExecutiveOverview.vue'
import ReportFilters from '@/components/kronos/reports/ReportFilters.vue'
import StoreReport from '@/components/kronos/reports/StoreReport.vue'
import AthletesReport from '@/components/kronos/reports/AthletesReport.vue'
import MembershipsReport from '@/components/kronos/reports/MembershipsReport.vue'
import InventoryReport from '@/components/kronos/reports/InventoryReport.vue'
import WorkforceReport from '@/components/kronos/reports/WorkforceReport.vue'
import FinanceReport from '@/components/kronos/reports/FinanceReport.vue'
import ReconciliationReport from '@/components/kronos/reports/ReconciliationReport.vue'
import ReportExportButton from '@/components/kronos/reports/ReportExportButton.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const reporting = useReportingStore()
const today = dateForBusinessTimeZone(Date.now())
const filters = ref<ReportingFilters>({ from: today, through: today, productIds: [] })
const filterError = ref('')
const selectedMetric = ref<StoreMetricKey>('recognizedRevenue')
const storeQaFixture = computed(() => import.meta.env.DEV && route.query.qaFixture === 'store')
const phase4QaFixture = computed(() => import.meta.env.DEV && route.query.qaFixture === 'athletes-memberships')
const phase5QaFixture = computed(() => import.meta.env.DEV && route.query.qaFixture === 'inventory-workforce')
const phase6QaFixture = computed(() => import.meta.env.DEV && route.query.qaFixture === 'finance')

const storeReport = computed(() => buildStoreReport(reporting.dataset.sales, filters.value))
const executiveMetrics = computed(() => buildExecutiveStoreMetrics(storeReport.value.summary))
const timeline = computed(() => buildStoreTimeline(storeReport.value, filters.value))
const athleteReport = computed(() => buildAthleteReport(reporting.dataset.athletes, filters.value))
const membershipReport = computed(() => buildMembershipReport(reporting.dataset.payments, filters.value))
const inventoryReport = computed(() => buildInventoryReport(reporting.dataset.inventoryClosures, reporting.dataset.inventoryResolutions, filters.value))
const workforceReport = computed(() => buildWorkforceReport(reporting.dataset.workEntries, reporting.dataset.payrollSettlements, filters.value))

const financeReport = computed(() => buildFinanceReport({
  sales: reporting.dataset.sales,
  membershipPayments: reporting.dataset.payments,
  visitPayments: reporting.dataset.visitPayments,
  expenses: reporting.dataset.expenses,
  cashClosures: reporting.dataset.cashClosures,
  inventoryRecoveries: reporting.dataset.inventoryResolutions,
}, filters.value))

const financeSources = ['store', 'memberships', 'visit-payments', 'expenses', 'cash-closures', 'inventory'] as const
const financeReady = computed(() => financeSources.every(source => reporting.loadedSources.includes(source)))
const financeError = computed(() => financeSources.some(source => Boolean(reporting.errors[source])))

const exportDisabledReason = computed(() => {
  if (filterError.value)
    return 'Corrige los filtros antes de exportar.'
  if (['idle', 'loading'].includes(reporting.state))
    return 'Espera a que terminen de cargar las fuentes.'
  if (['partial', 'error', 'unavailable'].includes(reporting.state) || Object.values(reporting.errors).some(Boolean))
    return 'La exportación integral requiere todas las fuentes autorizadas sin errores.'
  if (!reporting.dataset.sources.length || reporting.dataset.sources.some(source => !reporting.loadedSources.includes(source)))
    return 'No hay fuentes completas disponibles para exportar.'

  return ''
})

const exportFilename = computed(() => reportingExportFilename(filters.value))

function createExportRows() {
  const sources = new Set(reporting.loadedSources)

  return buildReportingExportRows({
    generatedAt: new Date().toISOString(),
    filters: filters.value,
    loadedSources: reporting.loadedSources,
    ...(sources.has('athletes') ? { athletes: athleteReport.value } : {}),
    ...(sources.has('memberships') ? { memberships: membershipReport.value } : {}),
    ...(sources.has('inventory') ? { inventory: inventoryReport.value } : {}),
    ...(sources.has('workforce') ? { workforce: workforceReport.value } : {}),
    ...(sources.has('store') ? { store: storeReport.value } : {}),
    ...(financeReady.value && !financeError.value ? { finance: financeReport.value } : {}),
  })
}

const productOptions = computed(() => {
  const items = [...reporting.dataset.sales.flatMap(sale => Object.values(sale.items)), ...reporting.dataset.inventoryClosures.flatMap(closure => Object.values(closure.items))]
  const products = new Map(items.map(item => [item.productId, { title: `${item.name} · ${item.productId}`, value: item.productId }]))

  return [...products.values()].sort((left, right) => left.title.localeCompare(right.title, 'es-MX'))
})

const employeeOptions = computed(() => {
  const employees = new Map(reporting.dataset.workEntries.map(entry => [entry.employeeId, { title: `${entry.employeeName} · ${entry.employeeId}`, value: entry.employeeId }]))

  return [...employees.values()].sort((left, right) => left.title.localeCompare(right.title, 'es-MX'))
})

const expenseCategories = computed(() => [...new Set(reporting.dataset.expenses.map(expense => expense.category))].sort((left, right) => left.localeCompare(right, 'es-MX')))

const currentFilterQuery = computed(() => {
  const params = new URLSearchParams()
  for (const key of ['from', 'through', 'productId', 'athleteId', 'status', 'athleteStatus', 'membershipStatus', 'employeeId', 'workStatus', 'inventoryResolutionKind', 'paymentMethod', 'financialAccount', 'expenseCategory', 'expenseStatus']) {
    const value = route.query[key]
    if (typeof value === 'string')
      params.set(key, value)
    else if (Array.isArray(value))
      value.forEach(item => item && params.append(key, item))
  }

  return params.toString()
})

function restoreFilters() {
  const queryText = route.fullPath.split('?')[1] ?? ''
  const query = new URLSearchParams(queryText.split('#', 1)[0])
  if (!query.has('from') || !query.has('through')) {
    filters.value = phase6QaFixture.value ? reportingFinanceQaFilters() : phase5QaFixture.value ? reportingInventoryWorkforceQaFilters() : phase4QaFixture.value ? reportingAthletesMembershipsQaFilters() : storeQaFixture.value ? reportingStoreQaFilters(today) : { from: today, through: today, productIds: [] }
    filterError.value = ''

    return
  }

  try {
    filters.value = parseReportingFilters(queryText)
    filterError.value = ''
  }
  catch (error) {
    filterError.value = error instanceof Error ? error.message : 'Los filtros de la URL no son válidos.'
  }
}

function syncFilters() {
  try {
    const normalized = normalizeReportingFilters(filters.value)
    if (serializeReportingFilters(normalized) !== serializeReportingFilters(filters.value))
      filters.value = normalized
    filterError.value = ''

    if (serializeReportingFilters(normalized) === currentFilterQuery.value)
      return

    const query = { ...route.query }
    for (const key of ['from', 'through', 'productId', 'athleteId', 'status', 'athleteStatus', 'membershipStatus', 'employeeId', 'workStatus', 'inventoryResolutionKind', 'paymentMethod', 'financialAccount', 'expenseCategory', 'expenseStatus'])
      delete query[key]
    query.from = normalized.from
    query.through = normalized.through
    if (normalized.productIds.length)
      query.productId = normalized.productIds
    if (normalized.athleteId)
      query.athleteId = normalized.athleteId
    if (normalized.status)
      query.status = normalized.status
    if (normalized.athleteStatus)
      query.athleteStatus = normalized.athleteStatus
    if (normalized.membershipStatus)
      query.membershipStatus = normalized.membershipStatus
    if (normalized.employeeId)
      query.employeeId = normalized.employeeId
    if (normalized.workStatus)
      query.workStatus = normalized.workStatus
    if (normalized.inventoryResolutionKind)
      query.inventoryResolutionKind = normalized.inventoryResolutionKind
    if (normalized.paymentMethod)
      query.paymentMethod = normalized.paymentMethod
    if (normalized.financialAccount)
      query.financialAccount = normalized.financialAccount
    if (normalized.expenseCategory)
      query.expenseCategory = normalized.expenseCategory
    if (normalized.expenseStatus)
      query.expenseStatus = normalized.expenseStatus

    void router.replace({ query })
  }
  catch (error) {
    filterError.value = error instanceof Error ? error.message : 'Revisa los filtros del reporte.'
  }
}

async function openMetricDetail(metric: StoreMetricKey) {
  selectedMetric.value = metric
  if (route.query.metric !== metric)
    await router.push({ query: { ...route.query, metric } })
  await nextTick()
  document.querySelector('#report-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

watch(() => route.fullPath, restoreFilters, { immediate: true })
watch(() => route.query.metric, value => {
  const metric = storeMetricFromQuery(value)
  if (metric)
    selectedMetric.value = metric
}, { immediate: true })
watch(filters, syncFilters, { deep: true })
watch([() => session.profile, storeQaFixture, phase4QaFixture, phase5QaFixture, phase6QaFixture], ([profile, useStoreFixture, usePhase4Fixture, usePhase5Fixture, usePhase6Fixture]) => {
  if ((useStoreFixture || usePhase4Fixture || usePhase5Fixture || usePhase6Fixture) && session.isAdmin) {
    reporting.disconnect()

    const fixture = usePhase6Fixture ? createReportingFinanceQaFixture() : usePhase5Fixture ? createReportingInventoryWorkforceQaFixture() : usePhase4Fixture ? createReportingAthletesMembershipsQaFixture() : createReportingStoreQaFixture(filters.value.from, filters.value.through)

    reporting.dataset = fixture
    reporting.loadedSources = fixture.loadedSources
    reporting.errors = {}
    reporting.loading = false

    return
  }

  reporting.connect(profile)
}, { immediate: true })
onBeforeUnmount(() => reporting.disconnect())

const loadMessage = computed(() => ({
  idle: 'Preparando fuentes permitidas…',
  loading: 'Cargando fuentes de datos…',
  ready: 'Fuentes auditables cargadas.',
  partial: 'Algunas fuentes no respondieron; se muestran sólo las que sí cargaron.',
  empty: 'No hay registros en las fuentes operativas permitidas para mostrar.',
  error: 'No fue posible consultar las fuentes permitidas. Intenta actualizar la página.',
  unavailable: 'Tienes acceso al módulo, pero no hay fuentes operativas asignadas para consultar.',
}[reporting.state]))
</script>

<template>
  <VRow>
    <VCol cols="12">
      <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
        <div>
          <h1 class="text-h4">
            Reportes
          </h1>
          <p class="text-body-1 text-medium-emphasis mb-0">
            De indicadores ejecutivos a partidas y movimientos auditables.
          </p>
        </div>
        <div class="d-flex flex-wrap align-center justify-end ga-3">
          <ReportExportButton
            v-if="session.isAdmin"
            :get-rows="createExportRows"
            :filename="exportFilename"
            :disabled="Boolean(exportDisabledReason)"
            :disabled-reason="exportDisabledReason"
          />
          <VChip
            color="primary"
            variant="tonal"
            prepend-icon="ri-shield-check-line"
          >
            Sólo lectura · America/Mexico_City
          </VChip>
        </div>
      </div>
    </VCol>

    <VCol cols="12">
      <ReportFilters
        v-model="filters"
        :products="productOptions"
        :employees="employeeOptions"
        :expense-categories="expenseCategories"
      />
      <VAlert
        v-if="(storeQaFixture || phase4QaFixture || phase5QaFixture || phase6QaFixture) && session.isAdmin"
        type="warning"
        variant="tonal"
        role="status"
        class="mt-3"
      >
        Fixture QA sintética en memoria. No representa datos reales ni escribe en Firebase.
      </VAlert>
      <VAlert
        v-if="filterError"
        type="error"
        variant="tonal"
        role="alert"
        class="mt-3"
      >
        {{ filterError }}
      </VAlert>
    </VCol>

    <VCol cols="12">
      <VAlert
        v-if="reporting.state === 'loading' || reporting.state === 'idle'"
        type="info"
        variant="tonal"
        role="status"
        aria-live="polite"
      >
        {{ loadMessage }}
      </VAlert>
      <VAlert
        v-else-if="reporting.state === 'partial'"
        type="warning"
        variant="tonal"
        role="status"
        aria-live="polite"
      >
        {{ loadMessage }}
      </VAlert>
      <VAlert
        v-else-if="reporting.state === 'error'"
        type="error"
        variant="tonal"
        role="alert"
      >
        {{ loadMessage }}
      </VAlert>
      <VAlert
        v-else-if="reporting.state === 'empty'"
        type="info"
        variant="tonal"
        role="status"
      >
        {{ loadMessage }}
      </VAlert>
    </VCol>

    <VCol
      v-if="!reporting.dataset.sources.includes('store')"
      cols="12"
    >
      <VAlert
        type="warning"
        variant="tonal"
        role="status"
      >
        Los reportes de Tienda están limitados a Admin por los permisos de la fuente canónica.
      </VAlert>
    </VCol>

    <VCol
      v-if="reporting.dataset.sources.includes('athletes') && reporting.loadedSources.includes('athletes') && !reporting.errors.athletes"
      cols="12"
    >
      <AthletesReport
        :report="athleteReport"
        :range="filters"
      />
    </VCol>
    <VCol
      v-if="!reporting.dataset.sources.includes('memberships')"
      cols="12"
    >
      <VAlert
        type="warning"
        variant="tonal"
        role="status"
      >
        Los reportes de mensualidades están limitados a Admin por los permisos de la fuente canónica.
      </VAlert>
    </VCol>
    <VCol
      v-else-if="reporting.errors.memberships"
      cols="12"
    >
      <VAlert
        type="error"
        variant="tonal"
        role="alert"
      >
        No se pudo cargar la fuente de mensualidades. No se muestran cifras parciales como si fueran totales.
      </VAlert>
    </VCol>
    <VCol
      v-else-if="reporting.loadedSources.includes('memberships')"
      cols="12"
    >
      <MembershipsReport
        :report="membershipReport"
        :range="filters"
      />
    </VCol>
    <VCol
      v-if="!reporting.dataset.sources.includes('inventory')"
      cols="12"
    >
      <VAlert
        type="warning"
        variant="tonal"
        role="status"
      >
        Los reportes de Inventario están limitados a Admin por los permisos de la fuente canónica.
      </VAlert>
    </VCol>
    <VCol
      v-else-if="reporting.errors.inventory"
      cols="12"
    >
      <VAlert
        type="error"
        variant="tonal"
        role="alert"
      >
        No se pudo cargar Inventario completo. No se muestran cifras parciales como totales.
      </VAlert>
    </VCol>
    <VCol
      v-else-if="reporting.loadedSources.includes('inventory')"
      cols="12"
    >
      <InventoryReport :report="inventoryReport" />
    </VCol>
    <VCol
      v-if="!reporting.dataset.sources.includes('workforce')"
      cols="12"
    >
      <VAlert
        type="warning"
        variant="tonal"
        role="status"
      >
        Los reportes de Personal están limitados a Admin por los permisos de la fuente canónica.
      </VAlert>
    </VCol>
    <VCol
      v-else-if="reporting.errors.workforce"
      cols="12"
    >
      <VAlert
        type="error"
        variant="tonal"
        role="alert"
      >
        No se pudo cargar Personal completo. No se muestran cifras parciales como totales.
      </VAlert>
    </VCol>
    <VCol
      v-else-if="reporting.loadedSources.includes('workforce')"
      cols="12"
    >
      <WorkforceReport
        :report="workforceReport"
        :through="filters.through"
        :range="filters"
      />
    </VCol>
    <VCol
      v-if="reporting.dataset.sources.includes('store') && reporting.errors.store"
      cols="12"
    >
      <VAlert
        type="error"
        variant="tonal"
        role="alert"
      >
        No se pudo cargar la fuente de Tienda. No se muestran cifras parciales como si fueran totales.
      </VAlert>
    </VCol>
    <VCol
      v-if="reporting.dataset.sources.includes('store') && reporting.loadedSources.includes('store') && !reporting.errors.store"
      cols="12"
    >
      <ExecutiveOverview
        :metrics="executiveMetrics"
        :timeline="timeline"
        @select="openMetricDetail"
      />
    </VCol>

    <VCol
      v-if="!session.isAdmin"
      cols="12"
    >
      <VAlert
        type="warning"
        variant="tonal"
        role="status"
      >
        Finanzas y Conciliación están limitadas a Admin.
      </VAlert>
    </VCol>
    <VCol
      v-else-if="financeError"
      cols="12"
    >
      <VAlert
        type="error"
        variant="tonal"
        role="alert"
      >
        No se cargaron todas las fuentes financieras. No se presentan totales parciales como si fueran completos.
      </VAlert>
    </VCol>
    <template v-else-if="financeReady">
      <VCol cols="12">
        <FinanceReport
          :report="financeReport"
          :range="filters"
        />
      </VCol>
      <VCol cols="12">
        <ReconciliationReport :report="financeReport" />
      </VCol>
    </template>
    <VCol
      v-if="reporting.dataset.sources.includes('store') && reporting.loadedSources.includes('store') && !reporting.errors.store"
      cols="12"
    >
      <StoreReport
        :report="storeReport"
        :metric="selectedMetric"
        :through="filters.through"
      />
    </VCol>

    <VCol cols="12">
      <div
        v-if="reporting.loadedSources.length"
        class="d-flex flex-wrap ga-2"
        aria-label="Fuentes cargadas"
      >
        <VChip
          v-for="source in reporting.loadedSources"
          :key="source"
          size="small"
          variant="outlined"
        >
          {{ source === 'athletes' ? 'Atletas' : source === 'visits' ? 'Visitas' : source === 'store' ? 'Tienda' : source === 'memberships' ? 'Mensualidades' : source === 'visit-payments' ? 'Cobros de visitas' : source === 'expenses' ? 'Egresos' : source === 'cash-closures' ? 'Cierres de caja' : source === 'inventory' ? 'Inventario' : source === 'workforce' ? 'Personal' : source }}
        </VChip>
      </div>
    </VCol>
  </VRow>
</template>
