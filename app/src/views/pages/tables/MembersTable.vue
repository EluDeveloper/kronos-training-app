<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { type Member, useMembers } from '@/composables/useMembers'

const router = useRouter()
const { listMembers } = useMembers()

const members = ref<Member[]>([])
const loading = ref(false)
const errorMessage = ref('')

const fetchMembers = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    members.value = await listMembers()
  }
  catch (error) {
    console.error(error)
    errorMessage.value = 'No se pudieron cargar los miembros registrados.'
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchMembers()
})

const tableRows = computed(() => members.value.map(member => ({
  ...member,
  fullName: `${member.firstName} ${member.lastName}`,
  formattedEnrollment: new Date(member.enrollmentDate).toLocaleDateString('es-MX'),
  membershipCostLabel: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(member.membershipCost),
  nextPayment: (() => {
    const date = new Date(member.enrollmentDate)

    date.setMonth(date.getMonth() + 1)

    return date.toLocaleDateString('es-MX')
  })(),
})))

const goToDetail = (id?: string) => {
  if (!id)
    return

  router.push(`/miembros/${id}`)
}
</script>

<template>
  <VCard title="Clientes registrados">
    <VCardText>
      <VBtn
        color="primary"
        class="mb-4"
        @click="router.push('/miembros/registro')"
      >
        Nuevo miembro
      </VBtn>

      <VAlert
        v-if="errorMessage"
        type="error"
        variant="tonal"
        class="mb-4"
      >
        {{ errorMessage }}
      </VAlert>

      <VProgressLinear
        v-if="loading"
        indeterminate
        color="primary"
        class="mb-4"
      />

      <template v-if="!loading && tableRows.length">
        <VDataTable
          :headers="[
            { title: 'No. Socio', key: 'memberNumber' },
            { title: 'Nombre completo', key: 'fullName' },
            { title: 'Fecha de inscripción', key: 'formattedEnrollment' },
            { title: 'Costo de membresía', key: 'membershipCostLabel' },
            { title: 'Siguiente pago', key: 'nextPayment' },
            { title: 'Acciones', key: 'actions', sortable: false },
          ]"
          :items="tableRows"
        >
          <template #item.actions="{ item }">
            <VBtn
              color="primary"
              variant="tonal"
              size="small"
              @click="goToDetail(item.id)"
            >
              Ver / Editar
            </VBtn>
          </template>
        </VDataTable>
      </template>

      <VAlert
        v-else-if="!loading && !tableRows.length"
        type="info"
        variant="tonal"
      >
        No hay clientes registrados todavía.
      </VAlert>
    </VCardText>
  </VCard>
</template>
