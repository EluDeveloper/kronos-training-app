<script lang="ts" setup>
import ConnectionBadge from '@/components/kronos/ConnectionBadge.vue'
import NavItems from '@/layouts/components/NavItems.vue'
import VerticalNavLayout from '@layouts/components/VerticalNavLayout.vue'

// Components
import Footer from '@/layouts/components/Footer.vue'
import NavbarThemeSwitcher from '@/layouts/components/NavbarThemeSwitcher.vue'
</script>

<template>
  <VerticalNavLayout>
    <!-- 👉 navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <div class="d-flex h-100 align-center">
        <!-- 👉 Vertical nav toggle in overlay mode -->
        <IconBtn
          class="ms-n3 d-lg-none"
          @click="toggleVerticalOverlayNavActive(true)"
        >
          <VIcon icon="ri-menu-line" />
        </IconBtn>

        <div class="d-none d-sm-block">
          <p class="text-caption text-medium-emphasis mb-0">Centro de control</p>
          <p class="font-weight-bold mb-0">Kronos Training</p>
        </div>

        <VSpacer />

        <ConnectionBadge class="me-2" />
        <NavbarThemeSwitcher class="me-2" />
      </div>
    </template>

    <template #vertical-nav-header="{ toggleIsOverlayNavActive }">
      <RouterLink
        to="/"
        class="app-logo app-title-wrapper"
      >
        <div class="app-logo-mark">K</div>

        <h1 class="kronos-display font-weight-medium leading-normal text-base">
          Kronos
        </h1>
      </RouterLink>

      <IconBtn
        class="d-block d-lg-none"
        @click="toggleIsOverlayNavActive(false)"
      >
        <VIcon icon="ri-close-line" />
      </IconBtn>
    </template>

    <template #vertical-nav-content>
      <NavItems />
    </template>

    <!-- 👉 Pages -->
    <slot />

    <!-- 👉 Footer -->
    <template #footer>
      <Footer />
    </template>
  </VerticalNavLayout>
</template>

<style lang="scss" scoped>
.app-logo {
  display: flex;
  align-items: center;
  column-gap: 0.75rem;

  .app-logo-title {
    font-size: 1.25rem;
    font-weight: 500;
    line-height: 1.75rem;
    text-transform: uppercase;
  }
}

.app-logo-mark {
  display: grid;
  border-radius: 10px;
  background: #ff401b;
  block-size: 38px;
  color: #fff;
  font: 700 0.9rem/1 "Syncopate", sans-serif;
  inline-size: 38px;
  place-items: center;
}
</style>
