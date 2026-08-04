<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import { useNotifications } from '@/composables/useNotifications'
import { authErrorMessage } from '@/firebase/auth'
import { useSessionStore } from '@/stores/session'
import { useUsersStore } from '@/stores/users'
import {
  accessModules,
  defaultReceptionPermissions,
  roleLabel,
  type AccessModule,
  type AppUser,
  type UserPermissions,
  type UserRole,
} from '@/types/access'

const session = useSessionStore()
const users = useUsersStore()
const { success, failure, confirmAction } = useNotifications()
const search = ref('')
const statusFilter = ref<'all' | 'enabled' | 'disabled'>('all')
const page = ref(1)
const perPage = 15
const dialog = ref(false)
const saving = ref(false)
const showPassword = ref(false)
const editingUid = ref<string | null>(null)
const createdCredentials = ref<{ email: string; password: string } | null>(null)
const copied = ref(false)

const form = reactive({
  displayName: '',
  email: '',
  role: 'reception' as UserRole,
  enabled: true,
  password: '',
  permissions: defaultReceptionPermissions() as UserPermissions,
})

const filtered = computed(() => users.items.filter(user => {
  const needle = search.value.trim().toLocaleLowerCase('es')
  const matchesText = !needle || `${user.displayName} ${user.email} ${roleLabel(user.role)}`.toLocaleLowerCase('es').includes(needle)

  const matchesStatus = statusFilter.value === 'all'
    || (statusFilter.value === 'enabled' && user.enabled)
    || (statusFilter.value === 'disabled' && !user.enabled)

  return matchesText && matchesStatus
}))

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage)))
const paginated = computed(() => filtered.value.slice((page.value - 1) * perPage, page.value * perPage))
const editingSelf = computed(() => editingUid.value === session.uid)

watch([search, statusFilter], () => { page.value = 1 })

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%'
  const values = crypto.getRandomValues(new Uint32Array(14))

  form.password = `K!${Array.from(values, value => alphabet[value % alphabet.length]).join('')}`
  showPassword.value = true
}

function resetPermissions(permissions: UserPermissions = {}) {
  for (const module of accessModules) {
    form.permissions[module.key] = permissions[module.key] === true
    for (const action of module.actions)
      form.permissions[action.key] = permissions[action.key] === true
  }
}

function setModuleEnabled(moduleKey: AccessModule, actionKeys: readonly string[], enabled: boolean | null) {
  form.permissions[moduleKey] = enabled === true
  if (!enabled) {
    for (const actionKey of actionKeys)
      form.permissions[actionKey as keyof UserPermissions] = false
  }
}

function openCreate() {
  editingUid.value = null
  createdCredentials.value = null
  form.displayName = ''
  form.email = ''
  form.role = 'reception'
  form.enabled = true
  form.password = ''
  resetPermissions(defaultReceptionPermissions())
  dialog.value = true
}

function openEdit(user: AppUser) {
  editingUid.value = user.uid
  createdCredentials.value = null
  form.displayName = user.displayName
  form.email = user.email
  form.role = user.role
  form.enabled = user.enabled
  form.password = ''
  resetPermissions(user.permissions)
  dialog.value = true
}

function permissionSummary(user: AppUser) {
  if (user.role === 'admin')
    return 'Acceso completo'

  const enabled = accessModules.filter(module => user.permissions?.[module.key]).map(module => {
    const actions = module.actions.filter(action => user.permissions?.[action.key]).length

    return actions ? `${module.label} (${actions})` : module.label
  })

  return enabled.length ? enabled.join(', ') : 'Sin módulos asignados'
}

async function save() {
  if (form.displayName.trim().length < 3 || !form.email.includes('@')) {
    failure('Captura nombre y correo válidos.')

    return
  }
  if (!editingUid.value && form.password.length < 10) {
    failure('La contraseña temporal debe tener al menos 10 caracteres.')

    return
  }

  if (editingUid.value && !form.enabled) {
    const confirmed = await confirmAction({
      title: 'Deshabilitar acceso',
      message: `La cuenta de ${form.displayName} ya no podrá abrir los módulos de Kronos.`,
      detail: 'La cuenta de Firebase se conserva y podrá habilitarse nuevamente.',
      confirmText: 'Deshabilitar',
      color: 'warning',
      icon: 'ri-user-unfollow-line',
    })

    if (!confirmed)
      return
  }

  saving.value = true
  try {
    const input = {
      displayName: form.displayName,
      email: form.email,
      role: form.role,
      enabled: form.enabled,
      permissions: { ...form.permissions },
    }

    if (editingUid.value) {
      await users.update(editingUid.value, input)
      success('Usuario y permisos actualizados.')
      dialog.value = false
    }
    else {
      if (!session.uid)
        throw new Error('No se encontró la sesión del Admin.')

      await users.create(input, form.password, session.uid)
      createdCredentials.value = { email: form.email.trim().toLocaleLowerCase('es'), password: form.password }
      success('Usuario creado. Comparte sus credenciales temporales de forma segura.')
    }
  }
  catch (error) {
    failure(authErrorMessage(error))
  }
  finally {
    saving.value = false
  }
}

async function copyCredentials() {
  if (!createdCredentials.value)
    return

  await navigator.clipboard.writeText(`Correo: ${createdCredentials.value.email}\nContraseña temporal: ${createdCredentials.value.password}`)
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 2500)
}

async function sendReset(user: AppUser) {
  try {
    await session.sendPasswordReset(user.email)
    success('Si la cuenta está disponible, Firebase enviará el correo de recuperación.')
  }
  catch (error) {
    failure(error instanceof Error ? error.message : 'No fue posible enviar la recuperación.')
  }
}

onMounted(() => users.subscribe())
onBeforeUnmount(() => users.dispose())
</script>

<template>
  <PageHeader
    title="Usuarios y permisos"
    eyebrow="Seguridad"
    description="Da de alta cuentas y decide qué puede consultar y operar cada persona."
  >
    <template #actions>
      <VBtn
        prepend-icon="ri-user-add-line"
        @click="openCreate"
      >
        Nuevo usuario
      </VBtn>
    </template>
  </PageHeader>

  <VRow class="mb-2">
    <VCol
      cols="12"
      md="8"
    >
      <VAlert
        color="info"
        variant="tonal"
        icon="ri-shield-check-line"
      >
        Admin siempre tiene acceso completo. En Recepción puedes separar consulta, captura y acciones sensibles.
      </VAlert>
    </VCol>
    <VCol
      cols="12"
      md="4"
    >
      <VCard
        class="kronos-card h-100"
        rounded="xl"
      >
        <VCardText class="d-flex align-center ga-4">
          <VAvatar
            color="primary"
            variant="tonal"
          >
            <VIcon icon="ri-group-line" />
          </VAvatar>
          <div>
            <p class="text-h5 font-weight-bold mb-0">
              {{ users.items.length }}
            </p><p class="text-caption text-medium-emphasis mb-0">
              Cuentas registradas
            </p>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <VCard
    class="kronos-card"
    rounded="xl"
  >
    <VCardText>
      <VRow class="mb-3">
        <VCol
          cols="12"
          md="8"
        >
          <VTextField
            v-model="search"
            label="Buscar nombre, correo o perfil"
            prepend-inner-icon="ri-search-line"
            clearable
          />
        </VCol>
        <VCol
          cols="12"
          md="4"
        >
          <VSelect
            v-model="statusFilter"
            label="Estado"
            :items="[{ title: 'Todos', value: 'all' }, { title: 'Habilitados', value: 'enabled' }, { title: 'Deshabilitados', value: 'disabled' }]"
          />
        </VCol>
      </VRow>

      <VProgressLinear
        v-if="users.loading"
        indeterminate
        color="secondary"
        class="mb-4"
      />
      <VAlert
        v-if="users.error"
        color="error"
        variant="tonal"
        class="mb-4"
      >
        {{ users.error }}
      </VAlert>
      <EmptyState
        v-if="!users.loading && !filtered.length"
        title="Sin usuarios"
        description="Crea la primera cuenta o cambia los filtros."
        icon="ri-user-settings-line"
      />

      <template v-else>
        <VTable>
          <thead><tr><th>Usuario</th><th>Perfil</th><th>Estado</th><th>Permisos</th><th /></tr></thead>
          <tbody>
            <tr
              v-for="user in paginated"
              :key="user.uid"
            >
              <td>
                <div class="font-weight-bold">
                  {{ user.displayName }}
                </div><div class="text-caption text-medium-emphasis">
                  {{ user.email }}
                </div>
              </td>
              <td>
                <VChip
                  :color="user.role === 'admin' ? 'primary' : 'secondary'"
                  variant="tonal"
                  size="small"
                >
                  {{ roleLabel(user.role) }}
                </VChip>
              </td>
              <td>
                <VChip
                  :color="user.enabled ? 'success' : 'default'"
                  variant="tonal"
                  size="small"
                >
                  {{ user.enabled ? 'Habilitado' : 'Deshabilitado' }}
                </VChip>
              </td>
              <td class="permission-cell text-caption text-medium-emphasis">
                {{ permissionSummary(user) }}
              </td>
              <td class="text-right text-no-wrap">
                <VBtn
                  icon="ri-mail-send-line"
                  variant="text"
                  aria-label="Enviar recuperación"
                  @click="sendReset(user)"
                />
                <VBtn
                  icon="ri-settings-4-line"
                  variant="text"
                  aria-label="Editar usuario"
                  @click="openEdit(user)"
                />
              </td>
            </tr>
          </tbody>
        </VTable>
        <VPagination
          v-if="pageCount > 1"
          v-model="page"
          :length="pageCount"
          :total-visible="5"
          class="mt-5"
        />
      </template>
    </VCardText>
  </VCard>

  <VDialog
    v-model="dialog"
    max-width="820"
    persistent
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <template v-if="createdCredentials">
        <VCardItem
          class="pa-6 pb-2"
          title="Usuario creado"
          subtitle="Estas credenciales temporales sólo se muestran ahora."
        />
        <VCardText class="pa-6">
          <VAlert
            color="success"
            variant="tonal"
            icon="ri-user-follow-line"
            class="mb-5"
          >
            La cuenta deberá crear una contraseña personal en su primer ingreso.
          </VAlert>
          <div class="credentials pa-5 mb-5">
            <p class="text-caption text-medium-emphasis mb-1">
              Correo
            </p><p class="font-weight-bold text-break mb-4">
              {{ createdCredentials.email }}
            </p>
            <p class="text-caption text-medium-emphasis mb-1">
              Contraseña temporal
            </p><code class="text-break">{{ createdCredentials.password }}</code>
          </div>
          <div class="d-flex flex-column flex-sm-row justify-end ga-3">
            <VBtn
              variant="tonal"
              :prepend-icon="copied ? 'ri-check-line' : 'ri-file-copy-line'"
              @click="copyCredentials"
            >
              {{ copied ? 'Copiadas' : 'Copiar credenciales' }}
            </VBtn>
            <VBtn @click="dialog = false">
              Terminar
            </VBtn>
          </div>
        </VCardText>
      </template>

      <template v-else>
        <VCardItem
          class="pa-6 pb-2"
          :title="editingUid ? 'Editar usuario' : 'Nuevo usuario'"
          subtitle="Administra el perfil, los módulos y las acciones permitidas."
        />
        <VCardText class="pa-6 d-flex flex-column ga-5">
          <VAlert
            v-if="editingSelf"
            color="info"
            variant="tonal"
          >
            Tu propia cuenta no puede perder el perfil Admin ni deshabilitarse.
          </VAlert>
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="form.displayName"
                label="Nombre completo"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="form.email"
                type="email"
                label="Correo electrónico"
                :readonly="Boolean(editingUid)"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="form.role"
                label="Perfil"
                :disabled="editingSelf"
                :items="[{ title: 'Admin', value: 'admin' }, { title: 'Recepción', value: 'reception' }]"
              />
            </VCol>
            <VCol
              v-if="!editingUid"
              cols="12"
              md="6"
            >
              <VTextField
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                label="Contraseña temporal"
                hint="Mínimo 10 caracteres"
                persistent-hint
                :append-inner-icon="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'"
                @click:append-inner="showPassword = !showPassword"
              >
                <template #append>
                  <VBtn
                    icon="ri-magic-line"
                    variant="text"
                    aria-label="Generar contraseña"
                    @click="generatePassword"
                  />
                </template>
              </VTextField>
            </VCol>
          </VRow>
          <VSwitch
            v-model="form.enabled"
            label="Cuenta habilitada"
            color="success"
            :disabled="editingSelf"
          />

          <div v-if="form.role === 'reception'">
            <p class="font-weight-bold mb-1">
              Permisos detallados
            </p>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Habilita primero el módulo y después únicamente las acciones que esta persona necesita.
            </p>
            <VRow>
              <VCol
                v-for="module in accessModules"
                :key="module.key"
                cols="12"
                sm="6"
              >
                <div class="permission-option pa-4 h-100">
                  <VSwitch
                    v-model="form.permissions[module.key]"
                    :label="module.label"
                    color="secondary"
                    hide-details
                    @update:model-value="enabled => setModuleEnabled(module.key, module.actions.map(action => action.key), enabled)"
                  >
                    <template #prepend>
                      <VIcon :icon="module.icon" />
                    </template>
                  </VSwitch>
                  <p class="text-caption text-medium-emphasis mb-0 mt-2">
                    {{ module.description }}
                  </p>
                  <div
                    v-if="module.actions.length"
                    class="permission-actions mt-3 pt-3"
                  >
                    <VSwitch
                      v-for="action in module.actions"
                      :key="action.key"
                      v-model="form.permissions[action.key]"
                      :label="action.label"
                      :hint="action.description"
                      :disabled="!form.permissions[module.key]"
                      color="primary"
                      density="compact"
                      persistent-hint
                      class="permission-action"
                    />
                  </div>
                </div>
              </VCol>
            </VRow>
          </div>
          <VAlert
            v-else
            color="primary"
            variant="tonal"
            icon="ri-shield-star-line"
          >
            Admin tendrá acceso completo y podrá administrar otras cuentas.
          </VAlert>
        </VCardText>
        <VCardActions class="pa-6 pt-0">
          <VSpacer /><VBtn
            variant="text"
            :disabled="saving"
            @click="dialog = false"
          >
            Cancelar
          </VBtn><VBtn
            :loading="saving"
            @click="save"
          >
            {{ editingUid ? 'Guardar cambios' : 'Crear usuario' }}
          </VBtn>
        </VCardActions>
      </template>
    </VCard>
  </VDialog>
</template>

<style scoped>
.permission-cell { max-inline-size: 360px; }
.permission-option, .credentials { border: 1px solid rgba(151, 213, 222, 0.16); border-radius: 14px; background: rgba(27, 29, 26, 0.36); }
.permission-actions { border-block-start: 1px solid rgba(151, 213, 222, 0.12); }
.permission-action + .permission-action { margin-block-start: 8px; }
</style>
