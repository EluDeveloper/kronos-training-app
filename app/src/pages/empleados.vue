<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import PayrollSettlementDialog from '@/components/kronos/PayrollSettlementDialog.vue'
import ReceiptDialog from '@/components/kronos/ReceiptDialog.vue'
import TablePaginator from '@/components/kronos/TablePaginator.vue'
import WorkEntryDialog from '@/components/kronos/WorkEntryDialog.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import { useWorkforceStore } from '@/stores/workforce'
import type { PaymentMethod } from '@/types/domain'
import type { CompensationUnit, Employee, EmployeeKind } from '@/types/workforce'
import { businessDateInMexicoCity } from '@/utils/business-date'
import { workforceTotals } from '@/utils/workforce-payroll'
import { buildPayrollSettlementReceipt, type ReceiptData } from '@/utils/receipts'
import { formatCurrency, formatDate } from '@/utils/kronos'

const workforce = useWorkforceStore()
const notifications = useNotificationsStore()
const session = useSessionStore()
const employeeDialog = ref(false)
const workDialog = ref(false)
const settlementDialog = ref(false)
const receiptDialog = ref(false)
const activeReceipt = ref<ReceiptData | null>(null)
const teamPage = ref(1)
const workPage = ref(1)
const settlementPage = ref(1)
const perPage = ref(15)
const saving = ref(false)
const editing = ref<Employee | null>(null)
const employeeForm = reactive({ name: '', phone: '', birthDate: '', kind: 'coach' as EmployeeKind, startDate: businessDateInMexicoCity(), status: 'active' as 'active' | 'inactive', notes: '', compensationUnit: 'class' as CompensationUnit, currentRate: 0 })
const totals = computed(() => workforceTotals(workforce.entries))
const activeEmployees = computed(() => workforce.employees.filter(item => item.status === 'active'))
const paginatedEmployees = computed(() => workforce.employees.slice((teamPage.value - 1) * perPage.value, teamPage.value * perPage.value))
const paginatedEntries = computed(() => workforce.entries.slice((workPage.value - 1) * perPage.value, workPage.value * perPage.value))
const paginatedSettlements = computed(() => workforce.settlements.slice((settlementPage.value - 1) * perPage.value, settlementPage.value * perPage.value))

function openEmployee(employee: Employee | null = null) {
  editing.value = employee
  Object.assign(employeeForm, employee
    ? { name: employee.name, phone: employee.phone ?? '', birthDate: employee.birthDate ?? '', kind: employee.kind, startDate: employee.startDate, status: employee.status, notes: employee.notes ?? '', compensationUnit: employee.compensationUnit, currentRate: employee.currentRate }
    : { name: '', phone: '', birthDate: '', kind: 'coach', startDate: businessDateInMexicoCity(), status: 'active', notes: '', compensationUnit: 'class', currentRate: 0 })
  employeeDialog.value = true
}

async function saveEmployee() {
  if (!session.uid || employeeForm.name.trim().length < 2 || !employeeForm.birthDate || employeeForm.currentRate <= 0)
    return notifications.show('Captura nombre, fecha de nacimiento y tarifa válida.', 'warning')
  saving.value = true
  try {
    await workforce.saveEmployee({ ...employeeForm, phone: employeeForm.phone || null, notes: employeeForm.notes || null }, session.uid, editing.value?.id)
    notifications.show(editing.value ? 'Empleado actualizado; la tarifa anterior se conservó.' : 'Empleado registrado.')
    employeeDialog.value = false
  }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No fue posible guardar.', 'error') }
  finally { saving.value = false }
}

async function saveWork(value: { employeeId: string; date: string; quantity: number; note?: string; correctionReason?: string }) {
  if (!session.uid) return
  saving.value = true
  try {
    await workforce.createWorkEntry(value.employeeId, value, session.uid)
    notifications.show('Trabajo registrado con tarifa congelada.')
    workDialog.value = false
  }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No fue posible registrar.', 'error') }
  finally { saving.value = false }
}

async function approve(entryId: string) {
  if (!session.uid) return
  try { await workforce.approveWorkEntry(entryId, session.uid); notifications.show('Trabajo aprobado.') }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No fue posible aprobar.', 'error') }
}

async function settle(value: { entryIds: string[]; paidAt: string; method: Exclude<PaymentMethod, 'store-credit'>; reference?: string }) {
  if (!session.uid) return
  saving.value = true
  try {
    const settlement = await workforce.settle(value.entryIds, value, session.uid)

    activeReceipt.value = buildPayrollSettlementReceipt(settlement, workforce.entries)
    receiptDialog.value = true
    notifications.show('Liquidación registrada y egreso generado.')
    settlementDialog.value = false
  }
  catch (error) { notifications.show(error instanceof Error ? error.message : 'No fue posible liquidar.', 'error') }
  finally { saving.value = false }
}

const kindLabel = (kind: EmployeeKind) => ({ coach: 'Coach', cleaning: 'Limpieza', other: 'Otro' })[kind]
const unitLabel = (unit: CompensationUnit) => ({ class: 'clase', day: 'día', 'fixed-period': 'periodo' })[unit]
const statusColor = (status: string) => status === 'paid' ? 'success' : status === 'approved' ? 'info' : 'warning'

const showSettlementReceipt = (settlementId: string) => {
  const settlement = workforce.settlements.find(item => item.id === settlementId)
  if (!settlement) return
  activeReceipt.value = buildPayrollSettlementReceipt(settlement, workforce.entries)
  receiptDialog.value = true
}

onMounted(() => workforce.subscribe())
onUnmounted(() => workforce.dispose())
</script>

<template>
  <PageHeader title="Empleados y liquidaciones" eyebrow="Administración" description="Controla tarifas, clases o días trabajados, pendientes y pagos sin mezclar devengo con caja.">
    <template #actions>
      <div class="d-flex flex-wrap ga-2">
        <VBtn variant="tonal" prepend-icon="ri-calendar-check-line" :disabled="!activeEmployees.length" @click="workDialog = true">Registrar trabajo</VBtn>
        <VBtn color="secondary" prepend-icon="ri-hand-coin-line" :disabled="!workforce.entries.some(item => item.status !== 'paid')" @click="settlementDialog = true">Liquidar</VBtn>
        <VBtn prepend-icon="ri-user-add-line" @click="() => openEmployee()">Nuevo empleado</VBtn>
      </div>
    </template>
  </PageHeader>

  <VRow class="mb-2">
    <VCol cols="12" sm="6" lg="3"><MetricCard label="Empleados activos" :value="activeEmployees.length" icon="ri-team-line" /></VCol>
    <VCol cols="12" sm="6" lg="3"><MetricCard label="Devengado" :value="formatCurrency(totals.accrued)" icon="ri-file-list-3-line" color="info" /></VCol>
    <VCol cols="12" sm="6" lg="3"><MetricCard label="Pagado" :value="formatCurrency(totals.paid)" icon="ri-check-double-line" color="success" /></VCol>
    <VCol cols="12" sm="6" lg="3"><MetricCard label="Pendiente" :value="formatCurrency(totals.pending)" icon="ri-time-line" color="warning" /></VCol>
  </VRow>

  <VCard class="kronos-card mb-5" rounded="xl">
    <VCardItem title="Equipo" subtitle="La tarifa vigente sólo se aplica a registros nuevos" />
    <EmptyState v-if="!workforce.employees.length" title="Sin empleados" description="Da de alta coaches, limpieza u otro personal." icon="ri-team-line" />
    <VTable v-else class="text-no-wrap">
      <thead><tr><th>Empleado</th><th>Tipo</th><th>Esquema</th><th>Tarifa vigente</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody><tr v-for="employee in paginatedEmployees" :key="employee.id">
        <td><strong>{{ employee.name }}</strong><div class="text-caption text-medium-emphasis">Desde {{ formatDate(`${employee.startDate}T12:00:00`) }}</div></td>
        <td>{{ kindLabel(employee.kind) }}</td><td>Por {{ unitLabel(employee.compensationUnit) }}</td><td>{{ formatCurrency(employee.currentRate) }}</td>
        <td><VChip size="small" :color="employee.status === 'active' ? 'success' : 'default'">{{ employee.status === 'active' ? 'Activo' : 'Inactivo' }}</VChip></td>
        <td><VBtn icon="ri-edit-line" variant="text" size="small" :aria-label="`Editar ${employee.name}`" @click="openEmployee(employee)" /></td>
      </tr></tbody>
    </VTable>
    <TablePaginator v-if="workforce.employees.length" v-model:page="teamPage" v-model:page-size="perPage" :total="workforce.employees.length" label="empleados" class="px-4 pb-4" />
  </VCard>

  <VCard class="kronos-card" rounded="xl">
    <VCardItem title="Trabajo registrado" subtitle="Pendiente → aprobado → pagado" />
    <EmptyState v-if="!workforce.entries.length" title="Sin trabajo registrado" description="Captura clases o días conforme ocurran." icon="ri-calendar-check-line" />
    <VTable v-else class="text-no-wrap">
      <thead><tr><th>Fecha</th><th>Empleado</th><th>Unidades</th><th>Tarifa</th><th>Importe</th><th>Estado</th><th /></tr></thead>
      <tbody><tr v-for="entry in paginatedEntries" :key="entry.id">
        <td>{{ formatDate(`${entry.date}T12:00:00`) }}</td><td>{{ entry.employeeName }}</td><td>{{ entry.quantity }} {{ unitLabel(entry.unit) }}</td><td>{{ formatCurrency(entry.rateSnapshot) }}</td><td><strong>{{ formatCurrency(entry.amount) }}</strong></td>
        <td><VChip size="small" :color="statusColor(entry.status)">{{ entry.status === 'paid' ? 'Pagado' : entry.status === 'approved' ? 'Aprobado' : 'Pendiente' }}</VChip></td>
        <td><VBtn v-if="entry.status === 'pending'" size="small" variant="tonal" @click="approve(entry.id)">Aprobar</VBtn></td>
      </tr></tbody>
    </VTable>
    <TablePaginator v-if="workforce.entries.length" v-model:page="workPage" v-model:page-size="perPage" :total="workforce.entries.length" label="registros de trabajo" class="px-4 pb-4" />
  </VCard>

  <VDialog v-model="employeeDialog" max-width="680" persistent>
    <VCard><VCardItem :title="editing ? 'Editar empleado' : 'Nuevo empleado'" subtitle="No almacenes datos bancarios sensibles" prepend-icon="ri-user-settings-line" />
      <VCardText><VRow>
        <VCol cols="12" sm="7"><VTextField v-model="employeeForm.name" label="Nombre" /></VCol><VCol cols="12" sm="5"><VTextField v-model="employeeForm.phone" label="Teléfono (opcional)" /></VCol>
        <VCol cols="12" sm="6"><VTextField v-model="employeeForm.birthDate" type="date" :max="businessDateInMexicoCity()" label="Fecha de nacimiento" required /></VCol>
        <VCol cols="12" sm="6"><VSelect v-model="employeeForm.kind" :items="[{ title: 'Coach', value: 'coach' }, { title: 'Limpieza', value: 'cleaning' }, { title: 'Otro', value: 'other' }]" label="Tipo" /></VCol>
        <VCol cols="12" sm="6"><VTextField v-model="employeeForm.startDate" type="date" label="Fecha de ingreso" /></VCol>
        <VCol cols="12" sm="6"><VSelect v-model="employeeForm.compensationUnit" :items="[{ title: 'Por clase', value: 'class' }, { title: 'Por día', value: 'day' }, { title: 'Periodo fijo', value: 'fixed-period' }]" label="Esquema" /></VCol>
        <VCol cols="12" sm="6"><VTextField v-model.number="employeeForm.currentRate" type="number" min="0.01" prefix="$" label="Tarifa vigente" /></VCol>
        <VCol cols="12" sm="6"><VSelect v-model="employeeForm.status" :items="[{ title: 'Activo', value: 'active' }, { title: 'Inactivo', value: 'inactive' }]" label="Estado" /></VCol>
        <VCol cols="12"><VTextarea v-model="employeeForm.notes" label="Notas (opcional)" rows="2" /></VCol>
      </VRow></VCardText>
      <VCardActions class="justify-end ga-2"><VBtn variant="text" :disabled="saving" @click="employeeDialog = false">Cancelar</VBtn><VBtn :loading="saving" @click="saveEmployee">Guardar</VBtn></VCardActions>
    </VCard>
  </VDialog>
  <WorkEntryDialog v-model="workDialog" :employees="activeEmployees" :loading="saving" @submit="saveWork" />
  <PayrollSettlementDialog v-model="settlementDialog" :entries="workforce.entries" :loading="saving" @submit="settle" />
  <VCard class="kronos-card mt-5" rounded="xl">
    <VCardItem title="Liquidaciones" subtitle="Recibos históricos de pagos a empleados" />
    <EmptyState v-if="!workforce.settlements.length" title="Sin liquidaciones" description="Los recibos aparecerán después del primer pago." icon="ri-receipt-line" />
    <VTable v-else class="text-no-wrap">
      <thead><tr><th>Fecha</th><th>Empleado</th><th>Periodo</th><th>Importe</th><th><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody><tr v-for="settlement in paginatedSettlements" :key="settlement.id">
        <td>{{ formatDate(`${settlement.paidAt}T12:00:00`) }}</td><td>{{ settlement.employeeName }}</td><td>{{ formatDate(`${settlement.periodFrom}T12:00:00`) }}–{{ formatDate(`${settlement.periodThrough}T12:00:00`) }}</td><td>{{ formatCurrency(settlement.amount) }}</td>
        <td><VBtn icon="ri-receipt-line" variant="text" :aria-label="`Ver recibo de ${settlement.employeeName}`" @click="showSettlementReceipt(settlement.id)" /></td>
      </tr></tbody>
    </VTable>
    <TablePaginator v-if="workforce.settlements.length" v-model:page="settlementPage" v-model:page-size="perPage" :total="workforce.settlements.length" label="liquidaciones" class="px-4 pb-4" />
  </VCard>
  <ReceiptDialog v-model="receiptDialog" :receipt="activeReceipt" />
</template>
