<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  icon: string
  color?: string
  detail?: string
}>()
</script>

<template>
  <VCard class="kronos-card h-100 pa-5" rounded="xl">
    <div class="d-flex align-start justify-space-between ga-4">
      <div>
        <p class="text-caption text-medium-emphasis mb-2">{{ label }}</p>
        <p class="text-h4 font-weight-bold mb-1">{{ value }}</p>
        <p v-if="detail" class="text-caption text-medium-emphasis mb-0">{{ detail }}</p>
      </div>
      <VAvatar :color="color ?? 'primary'" variant="tonal" rounded="lg">
        <VIcon :icon="icon" />
      </VAvatar>
    </div>
  </VCard>
</template>
