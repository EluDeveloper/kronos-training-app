<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'horizontal' | 'crest'
  tone?: 'light' | 'dark'
  alt?: string
}>(), {
  variant: 'horizontal',
  tone: 'light',
  alt: 'Kronos Training',
})

const source = computed(() => {
  if (props.variant === 'crest')
    return props.tone === 'light' ? '/images/Kronos/V-31.png' : '/images/Kronos/V-25.png'

  return props.tone === 'light' ? '/images/Kronos/V-16.png' : '/images/Kronos/V-17.png'
})
</script>

<template>
  <img :src="source" :alt="alt" class="kronos-official-logo">
</template>

<style scoped>
.kronos-official-logo {
  display: block;
  max-block-size: 100%;
  max-inline-size: 100%;
  object-fit: contain;
}
</style>
