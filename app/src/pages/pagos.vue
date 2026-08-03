<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MembershipPaymentDialog from '@/components/kronos/MembershipPaymentDialog.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useAthletesStore } from '@/stores/athletes'
import { usePaymentsStore } from '@/stores/payments'
import { usePlansStore } from '@/stores/plans'
import { currentPeriod, type Payment } from '@/types/domain'
import { buildMembershipReceipt, type ReceiptData } from '@/utils/receipts'
import { formatCurrency, formatDate, timestampValue } from '@/utils/kronos'

const athletes = useAthletesStore()
const payments = usePaymentsStore()
const plans = usePlansStore()
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

const athleteName = (id: string) => athletes.items.find(item => item.id === id)?.profile.name ?? 'Atleta'
const filtered = computed(() => [...payments.paid]
  .filter(payment => !periodFilter.value || payment.period === periodFilter.value)
  .filter(payment => `${athleteName(payment.athleteId)} ${payment.period} ${payment.method ?? ''}`.toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es')))
  .sort((a, b) => timestampValue(b.appliedAt) - timestampValue(a.appliedAt)))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage)))
const paginated = computed(() => filtered.value.slice((page.value - 1) * perPage, page.value * perPage))

watch([search, periodFilter], () => { page.value = 1 })

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

function openForm(athleteId = '') {
  selectedAthleteId.value = athleteId || athletes.active[0]?.id || ''
  selectedPeriod.value = currentPeriod()
  dialog.value = true
}

function openCollectionFromRoute() {
  const athleteId = typeof route.query.athleteId === 'string' ? route.query.athleteId : ''
  const requestedPeriod = typeof route.query.period === 'string' ? route.query.period : currentPeriod()
  const athlete = athletes.active.find(item => item.id === athleteId)

  if (route.query.collect !== '1' || !athlete)
    return

  selectedAthleteId.value = athlete.id
  selectedPeriod.value = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : currentPeriod()
  dialog.value = true
  router.replace({ path: '/pagos' })
}

watch([() => route.query.collect, () => athletes.active.length], openCollectionFromRoute, { immediate: true })

onMounted(() => { athletes.subscribe(); payments.subscribe(); plans.subscribe() })
onBeforeUnmount(() => { athletes.dispose(); payments.dispose(); plans.dispose() })
</script>

<template>
  <PageHeader title="Mensualidades" eyebrow="Cobranza" description="Pagos por periodo, recibos y búsqueda rápida de atletas.">
    <template #actions><VBtn prepend-icon="ri-add-circle-line" :disabled="!athletes.active.length" @click="openForm()">Aplicar pago</VBtn></template>
  </PageHeader>

  <VCard class="kronos-card" rounded="xl">
    <VCardItem title="Historial de pagos" :subtitle="`${filtered.length} registros encontrados`" />
    <VCardText>
      <VRow class="mb-2">
        <VCol cols="12" md="8"><VTextField v-model="search" label="Buscar atleta, periodo o método" prepend-inner-icon="ri-search-line" clearable /></VCol>
        <VCol cols="12" md="4"><VTextField v-model="periodFilter" type="month" label="Filtrar periodo" clearable /></VCol>
      </VRow>

      <EmptyState v-if="!filtered.length" title="Sin pagos aplicados" description="Registra la primera mensualidad o cambia los filtros." icon="ri-wallet-line" />
      <template v-else>
        <VTable>
          <thead><tr><th>Atleta</th><th>Periodo</th><th>Método</th><th>Aplicado</th><th class="text-right">Monto</th><th></th></tr></thead>
          <tbody>
            <tr v-for="payment in paginated" :key="`${payment.athleteId}-${payment.period}`">
              <td class="font-weight-bold">{{ athleteName(payment.athleteId) }}</td>
              <td>{{ payment.period }}</td>
              <td class="text-capitalize">{{ payment.method }}</td>
              <td>{{ formatDate(payment.appliedAt) }}</td>
              <td class="text-right text-success font-weight-bold">{{ formatCurrency(payment.amount ?? 0) }}</td>
              <td class="text-right"><VBtn icon="ri-receipt-line" variant="text" title="Generar recibo" @click="showReceipt(payment)" /></td>
            </tr>
          </tbody>
        </VTable>
        <div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-5">
          <span class="text-caption text-medium-emphasis">Máximo 15 registros por página</span>
          <VPagination v-model="page" :length="pageCount" :total-visible="5" density="comfortable" />
        </div>
      </template>
    </VCardText>
  </VCard>

  <MembershipPaymentDialog v-model="dialog" :athlete-id="selectedAthleteId" :period="selectedPeriod" @saved="showReceipt" />
  <ReceiptDialog v-model="receiptDialog" :receipt="activeReceipt" />
</template>
