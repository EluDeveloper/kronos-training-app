<script setup lang="ts">
defineProps<{
  title: string
  eyebrow: string
  description?: string
}>()
</script>

<template>
  <div class="d-flex flex-column flex-md-row align-md-end justify-space-between ga-4 mb-6">
    <div>
      <p class="text-overline text-kronos-cyan mb-1">{{ eyebrow }}</p>
      <h1 class="kronos-display text-h4 mb-2">{{ title }}</h1>
      <p v-if="description" class="text-body-2 text-medium-emphasis mb-0">{{ description }}</p>
    </div>
    <div class="d-flex ga-2 flex-wrap">
      <slot name="actions" />
    </div>
  </div>
</template>
