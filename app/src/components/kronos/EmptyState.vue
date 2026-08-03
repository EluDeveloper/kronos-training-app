<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon?: string
}>()
</script>

<template>
  <div class="empty-state pa-8 text-center">
    <VIcon :icon="icon ?? 'ri-inbox-2-line'" size="42" color="secondary" class="mb-3" />
    <p class="font-weight-bold mb-1">{{ title }}</p>
    <p class="text-body-2 text-medium-emphasis mb-0">{{ description }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  border: 1px dashed rgba(151, 213, 222, 0.22);
  border-radius: 16px;
  background: rgba(27, 29, 26, 0.35);
}
</style>
