<script lang="ts" setup>
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'
import VerticalNavSectionTitle from '@layouts/components/VerticalNavSectionTitle.vue'
import { useSessionStore } from '@/stores/session'
import { accessModules } from '@/types/access'

const session = useSessionStore()
const sections = ['Operación', 'Administración', 'Box'] as const

const visibleSections = computed(() => sections.map(section => ({
  section,
  modules: accessModules.filter(module => module.section === section && session.canAccess(module.key)),
})).filter(group => group.modules.length))
</script>

<template>
  <template
    v-for="group in visibleSections"
    :key="group.section"
  >
    <VerticalNavSectionTitle :item="{ heading: group.section }" />
    <VerticalNavLink
      v-for="module in group.modules"
      :key="module.key"
      :item="{ title: module.label, icon: module.icon, to: module.route }"
    />
  </template>

  <template v-if="session.isAdmin">
    <VerticalNavSectionTitle :item="{ heading: 'Sistema' }" />
    <VerticalNavLink :item="{ title: 'Cierres y conciliación', icon: 'ri-safe-2-line', to: '/cierres' }" />
    <VerticalNavLink :item="{ title: 'Usuarios y permisos', icon: 'ri-user-settings-line', to: '/usuarios' }" />
  </template>
</template>
