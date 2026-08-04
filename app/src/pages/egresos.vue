<script setup lang="ts">
import PageHeader from '@/components/kronos/PageHeader.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import EmptyState from '@/components/kronos/EmptyState.vue'
import { useExpensesStore } from '@/stores/expenses'
import { useNotificationsStore } from '@/stores/notifications'
import type { Expense, ExpenseStatus, PaymentMethod } from '@/types/domain'
import { currentPeriod } from '@/types/domain'
import { formatCurrency, formatDate, timestampValue } from '@/utils/kronos'

const expenses = useExpensesStore()
const notifications = useNotificationsStore()
const dialog = ref(false)
const saving = ref(false)
const editing = ref<Expense | null>(null)
const search = ref('')
const statusFilter = ref<string | null>(null)
const categoryFilter = ref<string | null>(null)
const page = ref(1)
const perPage = 15
const form = reactive({ date: new Date().toISOString().slice(0, 10), category: '', subcategory: '', description: '', amount: 0, method: 'transfer' as PaymentMethod, status: 'paid' as ExpenseStatus, registeredBy: 'Administración', receiptUrl: '' })

const thisMonth = computed(() => expenses.items.filter(item => item.date?.startsWith(currentPeriod())))
const paidTotal = computed(() => thisMonth.value.filter(item => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount), 0))
const pendingTotal = computed(() => expenses.items.filter(item => item.status !== 'paid').reduce((sum, item) => sum + Number(item.amount), 0))
const filtered = computed(() => [...expenses.items]
  .filter(item => !statusFilter.value || item.status === statusFilter.value)
  .filter(item => !categoryFilter.value || item.category === categoryFilter.value)
  .filter(item => `${item.category} ${item.subcategory ?? ''} ${item.description}`.toLowerCase().includes(search.value.toLowerCase()))
  .sort((a, b) => timestampValue(b.date) - timestampValue(a.date)))
const categoryItems = computed(() => [...new Set(expenses.items.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage)))
const paginated = computed(() => filtered.value.slice((page.value - 1) * perPage, page.value * perPage))

watch([search, statusFilter, categoryFilter], () => { page.value = 1 })

function openCreate() {
  editing.value = null
  Object.assign(form, { date: new Date().toISOString().slice(0, 10), category: '', subcategory: '', description: '', amount: 0, method: 'transfer', status: 'paid', registeredBy: 'Administración', receiptUrl: '' })
  dialog.value = true
}
function openEdit(expense: Expense) {
  editing.value = expense
  Object.assign(form, { date: expense.date, category: expense.category, subcategory: expense.subcategory ?? '', description: expense.description, amount: expense.amount, method: expense.method, status: expense.status, registeredBy: expense.registeredBy, receiptUrl: expense.receiptUrl ?? '' })
  dialog.value = true
}
async function save() {
  if (!form.date || !form.category.trim() || !form.description.trim() || Number(form.amount) <= 0) {
    notifications.show('Completa fecha, categoría, descripción y monto.', 'warning')
    return
  }
  if (form.status === 'paid' && form.date > new Date().toISOString().slice(0, 10)) {
    notifications.show('Un egreso futuro no puede marcarse como pagado.', 'warning')
    return
  }
  saving.value = true
  try {
    const payload = { ...form, category: form.category.trim(), subcategory: form.subcategory.trim() || null, description: form.description.trim(), amount: Number(form.amount), registeredBy: form.registeredBy.trim() || 'Administración', receiptUrl: form.receiptUrl.trim() || null }
    if (editing.value)
      await expenses.update(editing.value.id, payload)
    else
      await expenses.create(payload)
    notifications.show(editing.value ? 'Egreso actualizado.' : 'Egreso registrado.')
    dialog.value = false
  }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo guardar el egreso.', 'error') }
  finally { saving.value = false }
}
async function remove(expense: Expense) {
  const accepted = await notifications.requestConfirmation({
    title: 'Eliminar egreso',
    message: `¿Deseas eliminar “${expense.description}”?`,
    detail: 'Este movimiento dejará de aparecer en los reportes financieros.',
    confirmText: 'Eliminar egreso',
    color: 'error',
    icon: 'ri-delete-bin-line',
  })
  if (!accepted) return
  try { await expenses.remove(expense.id); notifications.show('Egreso eliminado.', 'info') }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No se pudo eliminar.', 'error') }
}
const statusLabel = (status: ExpenseStatus) => ({ paid: 'Pagado', pending: 'Pendiente', scheduled: 'Programado' })[status]
const statusColor = (status: ExpenseStatus) => ({ paid: 'success', pending: 'warning', scheduled: 'info' })[status]

onMounted(() => expenses.subscribe())
onUnmounted(() => expenses.dispose())
</script>

<template>
  <PageHeader title="Egresos" eyebrow="Finanzas" description="Gastos operativos, compromisos y estado real de caja.">
    <template #actions><VBtn prepend-icon="ri-add-line" @click="openCreate">Registrar egreso</VBtn></template>
  </PageHeader>

  <VRow class="mb-2">
    <VCol cols="12" md="4"><MetricCard label="Pagado este mes" :value="formatCurrency(paidTotal)" icon="ri-money-dollar-circle-line" /></VCol>
    <VCol cols="12" md="4"><MetricCard label="Por pagar" :value="formatCurrency(pendingTotal)" icon="ri-calendar-event-line" color="warning" /></VCol>
    <VCol cols="12" md="4"><MetricCard label="Movimientos del mes" :value="thisMonth.length" icon="ri-file-list-3-line" color="secondary" /></VCol>
  </VRow>

  <VCard class="kronos-card" rounded="xl">
    <VCardText>
      <VRow class="mb-2">
        <VCol cols="12" lg="6"><VTextField v-model="search" label="Buscar categoría, descripción o subcategoría" prepend-inner-icon="ri-search-line" clearable /></VCol>
        <VCol cols="12" sm="6" lg="3"><VAutocomplete v-model="categoryFilter" :items="categoryItems" label="Categoría" clearable auto-select-first /></VCol>
        <VCol cols="12" sm="6" lg="3"><VSelect v-model="statusFilter" :items="[{title:'Pagado',value:'paid'},{title:'Pendiente',value:'pending'},{title:'Programado',value:'scheduled'}]" label="Estado" clearable /></VCol>
      </VRow>
      <EmptyState v-if="!filtered.length" icon="ri-money-dollar-circle-line" title="Sin egresos" description="Registra gastos pagados o programados o cambia los filtros." />
      <template v-else>
        <VTable class="text-no-wrap">
          <thead><tr><th>FECHA</th><th>CATEGORÍA</th><th>DESCRIPCIÓN</th><th>MÉTODO</th><th>ESTADO</th><th>MONTO</th><th></th></tr></thead>
          <tbody><tr v-for="expense in paginated" :key="expense.id"><td>{{ formatDate(expense.date) }}</td><td>{{ expense.category }}<div v-if="expense.subcategory" class="text-caption text-medium-emphasis">{{ expense.subcategory }}</div></td><td>{{ expense.description }}</td><td>{{ expense.method }}</td><td><VChip size="small" :color="statusColor(expense.status)">{{ statusLabel(expense.status) }}</VChip></td><td><strong>{{ formatCurrency(expense.amount) }}</strong></td><td><VBtn icon="ri-edit-line" variant="text" size="small" @click="openEdit(expense)" /><VBtn icon="ri-delete-bin-line" variant="text" size="small" color="error" @click="remove(expense)" /></td></tr></tbody>
        </VTable>
        <div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-5"><span class="text-caption text-medium-emphasis">{{ filtered.length }} movimientos · máximo 15 por página</span><VPagination v-model="page" :length="pageCount" :total-visible="5" /></div>
      </template>
    </VCardText>
  </VCard>

  <VDialog v-model="dialog" max-width="720">
    <VCard class="kronos-card" rounded="xl">
      <VCardItem class="pa-6 pb-2" :title="editing ? 'Editar egreso' : 'Registrar egreso'" subtitle="Información del movimiento y estado del pago." />
      <VCardText class="pa-6"><VRow>
        <VCol cols="12" md="4"><VTextField v-model="form.date" type="date" label="Fecha" /></VCol>
        <VCol cols="12" md="4"><VCombobox v-model="form.category" :items="categoryItems" label="Categoría" clearable auto-select-first /></VCol>
        <VCol cols="12" md="4"><VTextField v-model="form.subcategory" label="Subcategoría" /></VCol>
        <VCol cols="12"><VTextField v-model="form.description" label="Descripción" /></VCol>
        <VCol cols="12" md="4"><VTextField v-model.number="form.amount" type="number" min="0" label="Monto" prefix="$" /></VCol>
        <VCol cols="12" md="4"><VSelect v-model="form.method" :items="[{title:'Efectivo',value:'cash'},{title:'Transferencia',value:'transfer'},{title:'Tarjeta',value:'card'},{title:'Otro',value:'other'}]" label="Método" /></VCol>
        <VCol cols="12" md="4"><VSelect v-model="form.status" :items="[{title:'Pagado',value:'paid'},{title:'Pendiente',value:'pending'},{title:'Programado',value:'scheduled'}]" label="Estado" /></VCol>
        <VCol cols="12" md="6"><VTextField v-model="form.registeredBy" label="Registrado por" /></VCol>
        <VCol cols="12" md="6"><VTextField v-model="form.receiptUrl" label="URL de comprobante (opcional)" /></VCol>
      </VRow></VCardText>
      <VCardActions class="pa-6 pt-0"><VSpacer /><VBtn variant="text" @click="dialog=false">Cancelar</VBtn><VBtn :loading="saving" @click="save">Guardar</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>
