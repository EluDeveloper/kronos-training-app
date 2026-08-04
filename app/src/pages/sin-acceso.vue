<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
</script>

<template>
  <VCard
    class="kronos-card"
    rounded="xl"
  >
    <VCardText class="pa-8 pa-md-12">
      <EmptyState
        title="Sin módulos asignados"
        description="Tu cuenta está habilitada, pero un Admin todavía no selecciona las áreas que puedes utilizar."
        icon="ri-shield-user-line"
      />
    </VCardText>
  </VCard>
</template>
