<script setup lang="ts">
import type { Sale } from '@/types/domain'
import { formatCurrency, formatDate, saleAppliedAmount, saleBalance } from '@/utils/kronos'

const props = defineProps<{
  modelValue: boolean
  athleteName: string
  sales: Sale[]
  initialSaleIds?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'preview': [sales: Sale[]]
}>()

const selectedIds = ref<string[]>([])
const allSelected = computed(() => props.sales.length > 0 && selectedIds.value.length === props.sales.length)
const selectedSales = computed(() => props.sales.filter(sale => selectedIds.value.includes(sale.id)))
const selectedBalance = computed(() => selectedSales.value.reduce((sum, sale) => sum + saleBalance(sale), 0))

watch(() => props.modelValue, value => {
  if (value)
    selectedIds.value = props.initialSaleIds?.length ? props.sales.filter(sale => props.initialSaleIds?.includes(sale.id)).map(sale => sale.id) : props.sales.map(sale => sale.id)
})

function toggleAll() {
  selectedIds.value = allSelected.value ? [] : props.sales.map(sale => sale.id)
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="760"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard>
      <VCardItem
        title="Estado de cuenta de tienda"
        :subtitle="athleteName"
        prepend-icon="ri-file-list-3-line"
      />
      <VCardText>
        <VAlert
          type="info"
          variant="tonal"
          class="mb-4"
        >
          Este documento incluye únicamente artículos de tienda. No agrega mensualidades ni visitas.
        </VAlert>
        <div class="d-flex flex-wrap justify-space-between align-center ga-3 mb-3">
          <VCheckbox
            :model-value="allSelected"
            :indeterminate="selectedIds.length > 0 && !allSelected"
            label="Seleccionar todos"
            hide-details
            @click="toggleAll"
          />
          <strong>{{ formatCurrency(selectedBalance) }} pendientes</strong>
        </div>
        <VList
          class="border rounded"
          aria-label="Adeudos de tienda disponibles"
        >
          <VListItem
            v-for="sale in sales"
            :key="sale.id"
            :title="Object.values(sale.items ?? {}).map(item => `${item.quantity} × ${item.name}`).join(', ')"
            :subtitle="`${formatDate(sale.createdAt)} · Original ${formatCurrency(sale.total)} · Abonado ${formatCurrency(saleAppliedAmount(sale))}`"
            @click="selectedIds = selectedIds.includes(sale.id) ? selectedIds.filter(id => id !== sale.id) : [...selectedIds, sale.id]"
          >
            <template #prepend>
              <VCheckboxBtn
                :model-value="selectedIds.includes(sale.id)"
                :aria-label="`Seleccionar adeudo de ${formatCurrency(saleBalance(sale))}`"
              />
            </template>
            <template #append>
              <strong class="text-error">{{ formatCurrency(saleBalance(sale)) }}</strong>
            </template>
          </VListItem>
        </VList>
      </VCardText>
      <VCardActions class="justify-end flex-wrap ga-2">
        <VBtn
          variant="text"
          @click="emit('update:modelValue', false)"
        >
          Cancelar
        </VBtn>
        <VBtn
          prepend-icon="ri-eye-line"
          :disabled="!selectedSales.length"
          @click="emit('preview', selectedSales)"
        >
          Vista previa
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
