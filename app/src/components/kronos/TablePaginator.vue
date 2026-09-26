<script setup lang="ts">
import { TABLE_PAGE_SIZES } from '@/utils/table-pagination'

const props = withDefaults(defineProps<{ page: number; pageSize: number; total: number; label?: string }>(), { label: 'registros' })
const emit = defineEmits<{ 'update:page': [value: number]; 'update:pageSize': [value: number] }>()
const pageSizeItems: number[] = [...TABLE_PAGE_SIZES]
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const from = computed(() => props.total ? (props.page - 1) * props.pageSize + 1 : 0)
const through = computed(() => Math.min(props.total, props.page * props.pageSize))

watch(pageCount, count => { if (props.page > count) emit('update:page', count) })
</script>

<template>
  <div class="d-flex flex-wrap justify-space-between align-center ga-3 mt-5" role="navigation" :aria-label="`Paginación de ${label}`">
    <span class="text-caption text-medium-emphasis">{{ from }}–{{ through }} de {{ total }} {{ label }}</span>
    <div class="d-flex flex-wrap align-center ga-3">
      <VSelect class="table-paginator__size" :model-value="pageSize" :items="pageSizeItems" label="Filas por página" density="compact" hide-details @update:model-value="emit('update:pageSize', Number($event)); emit('update:page', 1)" />
      <VPagination :model-value="page" :length="pageCount" :total-visible="5" density="comfortable" aria-label="Seleccionar página" @update:model-value="emit('update:page', $event)" />
    </div>
  </div>
</template>

<style scoped>
.table-paginator__size { min-inline-size: 8.25rem; }
</style>
