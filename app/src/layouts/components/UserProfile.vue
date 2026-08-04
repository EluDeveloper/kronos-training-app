<script setup lang="ts">
import { useSessionStore } from '@/stores/session'
import { roleLabel } from '@/types/access'

const session = useSessionStore()
const initials = computed(() => session.profile?.displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es') || 'KT')
</script>

<template>
  <VBadge
    dot
    location="bottom right"
    offset-x="3"
    offset-y="3"
    color="success"
    bordered
  >
    <VAvatar
      class="cursor-pointer font-weight-bold"
      color="primary"
      variant="tonal"
    >
      {{ initials }}
      <VMenu
        activator="parent"
        width="290"
        location="bottom end"
        offset="14px"
      >
        <VList>
          <VListItem>
            <template #prepend>
              <VAvatar
                color="primary"
                variant="tonal"
                class="me-3"
              >
                {{ initials }}
              </VAvatar>
            </template>
            <VListItemTitle class="font-weight-semibold">
              {{ session.profile?.displayName }}
            </VListItemTitle>
            <VListItemSubtitle>{{ session.profile ? roleLabel(session.profile.role) : '' }} · {{ session.authEmail }}</VListItemSubtitle>
          </VListItem>
          <VDivider class="my-2" />
          <VListItem
            v-if="session.isAdmin"
            to="/usuarios"
            prepend-icon="ri-user-settings-line"
            title="Usuarios y permisos"
          />
          <VListItem
            prepend-icon="ri-logout-box-r-line"
            title="Cerrar sesión"
            @click="session.logout"
          />
        </VList>
      </VMenu>
    </VAvatar>
  </VBadge>
</template>
