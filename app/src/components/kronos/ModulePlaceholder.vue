<script setup lang="ts">
defineProps<{
  title: string
  eyebrow: string
  description: string
  icon: string
}>()
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard class="kronos-card kronos-accent-line pa-6 pa-md-8" rounded="xl">
        <div class="d-flex flex-column flex-md-row align-md-center ga-5">
          <VAvatar size="64" color="primary" variant="tonal" rounded="lg">
            <VIcon :icon="icon" size="32" color="secondary" />
          </VAvatar>
          <div>
            <p class="text-overline text-kronos-cyan mb-1">{{ eyebrow }}</p>
            <h1 class="kronos-display text-h4 mb-3">{{ title }}</h1>
            <p class="text-body-1 text-medium-emphasis mb-0">{{ description }}</p>
          </div>
        </div>
      </VCard>
    </VCol>
  </VRow>
</template>
