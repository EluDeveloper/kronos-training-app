<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import { useNotifications } from '@/composables/useNotifications'
import { usePlansStore } from '@/stores/plans'
import type { MembershipPlan } from '@/types/domain'
import { formatCurrency } from '@/utils/kronos'

const plans = usePlansStore()
const { success, failure } = useNotifications()
const dialog = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', billingPeriod: 'monthly' as MembershipPlan['billingPeriod'], price: 0, status: 'active' as MembershipPlan['status'] })

const periods = [
  { title: 'Mensual', value: 'monthly' },
  { title: 'Trimestral', value: 'quarterly' },
  { title: 'Otro', value: 'other' },
]

function openForm(plan?: MembershipPlan) {
  editingId.value = plan?.id ?? null
  form.name = plan?.name ?? ''
  form.billingPeriod = plan?.billingPeriod ?? 'monthly'
  form.price = plan?.price ?? 0
  form.status = plan?.status ?? 'active'
  dialog.value = true
}

async function save() {
  if (!form.name.trim() || form.price <= 0) {
    failure('Captura un nombre y precio válido.')
    return
  }
  saving.value = true
  try {
    if (editingId.value)
      await plans.update(editingId.value, { ...form, name: form.name.trim() })
    else
      await plans.create({ ...form, name: form.name.trim() })
    success(editingId.value ? 'Plan actualizado.' : 'Plan creado.')
    dialog.value = false
  }
  catch (error) {
    failure(error instanceof Error ? error.message : 'No fue posible guardar el plan.')
  }
  finally { saving.value = false }
}

onMounted(() => plans.subscribe())
onBeforeUnmount(() => plans.dispose())
</script>

<template>
  <PageHeader title="Planes" eyebrow="Configuración" description="Precios y vigencias disponibles para nuevas membresías.">
    <template #actions><VBtn prepend-icon="ri-add-line" @click="openForm()">Nuevo plan</VBtn></template>
  </PageHeader>

  <VCard class="kronos-card" rounded="xl">
    <VCardText>
      <EmptyState v-if="!plans.items.length" title="Sin planes" description="Crea el primer plan para registrar atletas." icon="ri-price-tag-3-line" />
      <VTable v-else>
        <thead><tr><th>Plan</th><th>Vigencia</th><th>Estado</th><th class="text-right">Precio</th><th /></tr></thead>
        <tbody>
          <tr v-for="plan in plans.items" :key="plan.id">
            <td class="font-weight-bold">{{ plan.name }}</td>
            <td>{{ periods.find(item => item.value === plan.billingPeriod)?.title }}</td>
            <td><VChip :color="plan.status === 'active' ? 'success' : 'default'" variant="tonal" size="small">{{ plan.status === 'active' ? 'Activo' : 'Inactivo' }}</VChip></td>
            <td class="text-right">{{ formatCurrency(plan.price) }}</td>
            <td class="text-right"><VBtn icon="ri-edit-line" variant="text" aria-label="Editar plan" @click="openForm(plan)" /></td>
          </tr>
        </tbody>
      </VTable>
    </VCardText>
  </VCard>

  <VDialog v-model="dialog" max-width="560">
    <VCard class="kronos-card" title="Plan de membresía">
      <VCardText class="d-flex flex-column ga-4">
        <VTextField v-model="form.name" label="Nombre" />
        <VSelect v-model="form.billingPeriod" :items="periods" label="Vigencia" />
        <VTextField v-model.number="form.price" type="number" min="1" label="Precio" prefix="$" />
        <VSwitch v-model="form.status" true-value="active" false-value="inactive" label="Plan activo" />
      </VCardText>
      <VCardActions><VSpacer /><VBtn variant="text" @click="dialog = false">Cancelar</VBtn><VBtn :loading="saving" @click="save">Guardar</VBtn></VCardActions>
    </VCard>
  </VDialog>
</template>
