<script lang="ts" setup>
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'
import VerticalNavSectionTitle from '@layouts/components/VerticalNavSectionTitle.vue'
</script>

<template>

  <VerticalNavSectionTitle :item="{ heading: 'Operación' }" />
  <VerticalNavLink :item="{ title: 'Dashboard', icon: 'ri-dashboard-3-line', to: '/dashboard' }" />
  <VerticalNavLink :item="{ title: 'Atletas', icon: 'ri-team-line', to: '/atletas' }" />
  <VerticalNavLink :item="{ title: 'Mensualidades', icon: 'ri-wallet-3-line', to: '/pagos' }" />
  <VerticalNavLink :item="{ title: 'Rendimiento', icon: 'ri-line-chart-line', to: '/rendimiento' }" />

  <VerticalNavSectionTitle :item="{ heading: 'Administración' }" />
  <VerticalNavLink :item="{ title: 'Tienda', icon: 'ri-shopping-bag-3-line', to: '/tienda' }" />
  <VerticalNavLink :item="{ title: 'Egresos', icon: 'ri-money-dollar-circle-line', to: '/egresos' }" />
  <VerticalNavLink :item="{ title: 'Planes', icon: 'ri-price-tag-3-line', to: '/planes' }" />

  <VerticalNavSectionTitle :item="{ heading: 'Box' }" />
  <VerticalNavLink :item="{ title: 'Programación', icon: 'ri-calendar-schedule-line', to: '/programacion' }" />
  <VerticalNavLink :item="{ title: 'Comunidad', icon: 'ri-group-2-line', to: '/comunidad' }" />
</template>
