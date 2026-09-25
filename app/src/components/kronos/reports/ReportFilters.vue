<script setup lang="ts">
import type { ReportingFilters } from '@/types/reporting'

interface ProductOption {
  title: string
  value: string
}

interface EmployeeOption {
  title: string
  value: string
}

const props = defineProps<{
  modelValue: ReportingFilters
  products: ProductOption[]
  employees?: EmployeeOption[]
  expenseCategories?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ReportingFilters]
}>()

function update(key: keyof ReportingFilters, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value } as ReportingFilters)
}

const saleStatuses = [
  { title: 'Pagada', value: 'paid' },
  { title: 'Pendiente de cobro', value: 'credit' },
  { title: 'Cancelada', value: 'cancelled' },
]

const athleteStatuses = [
  { title: 'Activo', value: 'active' }, { title: 'Pausa', value: 'paused' }, { title: 'Baja', value: 'inactive' },
]

const membershipStatuses = [
  { title: 'Pagada', value: 'paid' },
  { title: 'Pendiente', value: 'pending' },
  { title: 'Vencida', value: 'overdue' },
  { title: 'Adelantada', value: 'advance' },
  { title: 'No disponible', value: 'unavailable' },
]

const paymentMethods = [
  { title: 'Efectivo', value: 'cash' },
  { title: 'Transferencia', value: 'transfer' },
  { title: 'Tarjeta', value: 'card' },
  { title: 'Otro', value: 'other' },
  { title: 'Saldo a favor', value: 'store-credit' },
]

const workStatuses = [
  { title: 'Pendiente', value: 'pending' }, { title: 'Aprobado', value: 'approved' }, { title: 'Pagado', value: 'paid' },
]

const inventoryResolutionKinds = [
  { title: 'Artículo encontrado', value: 'found' }, { title: 'Faltante cubierto', value: 'covered' }, { title: 'Fondo perdido', value: 'written-off' }, { title: 'Corrección documentada', value: 'corrected' },
]

const financialAccounts = [
  { title: 'Caja', value: 'cash' }, { title: 'Banco', value: 'bank' }, { title: 'Otro', value: 'other' }, { title: 'No monetario', value: 'non-cash' },
]

const expenseStatuses = [
  { title: 'Pagado', value: 'paid' }, { title: 'Pendiente', value: 'pending' }, { title: 'Programado', value: 'scheduled' },
]
</script>

<template>
  <VCard>
    <VCardTitle>Filtros del reporte</VCardTitle>
    <VCardText>
      <VRow>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VTextField
            label="Desde"
            type="date"
            :model-value="modelValue.from"
            @update:model-value="update('from', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VSelect
            label="Estado de atleta"
            clearable
            :items="athleteStatuses"
            item-title="title"
            item-value="value"
            :model-value="modelValue.athleteStatus"
            @update:model-value="update('athleteStatus', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VSelect
            label="Estado de mensualidad"
            clearable
            :items="membershipStatuses"
            item-title="title"
            item-value="value"
            :model-value="modelValue.membershipStatus"
            @update:model-value="update('membershipStatus', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VTextField
            label="Hasta"
            type="date"
            :model-value="modelValue.through"
            @update:model-value="update('through', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VAutocomplete
            label="Productos"
            hint="Sin selección incluye todos los productos"
            persistent-hint
            multiple
            chips
            closable-chips
            :items="products"
            :model-value="modelValue.productIds"
            @update:model-value="update('productIds', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VTextField
            label="Atleta (ID)"
            clearable
            :model-value="modelValue.athleteId"
            @update:model-value="update('athleteId', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VSelect
            label="Estado de venta"
            clearable
            :items="saleStatuses"
            item-title="title"
            item-value="value"
            :model-value="modelValue.status"
            @update:model-value="update('status', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VSelect
            label="Método de pago"
            clearable
            :items="paymentMethods"
            item-title="title"
            item-value="value"
            :model-value="modelValue.paymentMethod"
            @update:model-value="update('paymentMethod', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VAutocomplete
            label="Empleado"
            hint="Nombre snapshot e ID; no consulta contacto"
            persistent-hint
            clearable
            :items="employees ?? []"
            :model-value="modelValue.employeeId"
            @update:model-value="update('employeeId', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VSelect
            label="Estado de trabajo"
            clearable
            :items="workStatuses"
            :model-value="modelValue.workStatus"
            @update:model-value="update('workStatus', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VSelect
            label="Resolución de inventario"
            clearable
            :items="inventoryResolutionKinds"
            :model-value="modelValue.inventoryResolutionKind"
            @update:model-value="update('inventoryResolutionKind', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VSelect
            label="Cuenta financiera"
            clearable
            :items="financialAccounts"
            :model-value="modelValue.financialAccount"
            @update:model-value="update('financialAccount', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VAutocomplete
            label="Categoría de egreso"
            clearable
            :items="expenseCategories ?? []"
            :model-value="modelValue.expenseCategory"
            @update:model-value="update('expenseCategory', $event)"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <VSelect
            label="Estado de egreso"
            clearable
            :items="expenseStatuses"
            :model-value="modelValue.expenseStatus"
            @update:model-value="update('expenseStatus', $event)"
          />
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>
