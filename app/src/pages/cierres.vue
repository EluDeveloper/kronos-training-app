<script setup lang="ts">
import EmptyState from '@/components/kronos/EmptyState.vue'
import MetricCard from '@/components/kronos/MetricCard.vue'
import PageHeader from '@/components/kronos/PageHeader.vue'
import { useClosuresStore } from '@/stores/closures'
import { useCommerceStore } from '@/stores/commerce'
import { useExpensesStore } from '@/stores/expenses'
import { useNotificationsStore } from '@/stores/notifications'
import { usePaymentsStore } from '@/stores/payments'
import { useSessionStore } from '@/stores/session'
import { useVisitPaymentsStore } from '@/stores/visit-payments'
import type { InventoryClosureItem } from '@/types/domain'
import { buildFinancialMovements, dateKey, movementsBetweenDates, summarizeMovements } from '@/utils/financial-reports'
import { formatCurrency, formatDate } from '@/utils/kronos'

const closures = useClosuresStore()
const commerce = useCommerceStore()
const expenses = useExpensesStore()
const payments = usePaymentsStore()
const visitPayments = useVisitPaymentsStore()
const notifications = useNotificationsStore()
const session = useSessionStore()

const tab = ref('cash')
const savingCash = ref(false)
const savingInventory = ref(false)
const today = dateKey(new Date())
const selectedCashDate = ref(today)
const selectedWeekDate = ref(today)
const cashForm = reactive({ openingCash: 0, openingBank: 0, countedCash: 0, countedBank: 0, notes: '', isBaseline: false })
const inventoryCounts = reactive<Record<string, number | null>>({})
const inventoryNotes = ref('')

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00`)

  date.setDate(date.getDate() + days)

  return dateKey(date)
}

const weekBounds = (value: string) => {
  const date = new Date(`${value}T12:00:00`)
  const day = date.getDay() || 7

  date.setDate(date.getDate() - day + 1)
  const start = dateKey(date)

  return { start, end: addDays(start, 6) }
}

const allMovements = computed(() => buildFinancialMovements({
  membershipPayments: payments.items,
  visitPayments: visitPayments.items,
  sales: commerce.sales,
  expenses: expenses.items,
}))

const existingCashClosure = computed(() => closures.cash.find(item => item.date === selectedCashDate.value) ?? null)
const previousCashClosure = computed(() => closures.cash
  .filter(item => item.date < selectedCashDate.value)
  .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null)

const closureMovements = computed(() => movementsBetweenDates(
  allMovements.value,
  previousCashClosure.value?.date ?? null,
  selectedCashDate.value,
))
const cashMovementSummary = computed(() => summarizeMovements(cashForm.isBaseline ? [] : closureMovements.value))
const expectedCash = computed(() => Number(cashForm.openingCash || 0) + cashMovementSummary.value.cashNet)
const expectedBank = computed(() => Number(cashForm.openingBank || 0) + cashMovementSummary.value.bankNet)
const cashVariance = computed(() => Number(cashForm.countedCash || 0) - expectedCash.value)
const bankVariance = computed(() => Number(cashForm.countedBank || 0) - expectedBank.value)
const totalVariance = computed(() => cashVariance.value + bankVariance.value)
const cashDateIsFuture = computed(() => selectedCashDate.value > today)

const cashHistory = computed(() => closures.cash.slice(0, 15))
const inventoryHistory = computed(() => closures.inventory.slice(0, 15))

function loadCashForm() {
  const existing = existingCashClosure.value
  if (existing) {
    Object.assign(cashForm, {
      openingCash: existing.openingCash,
      openingBank: existing.openingBank,
      countedCash: existing.countedCash,
      countedBank: existing.countedBank,
      notes: existing.notes ?? '',
      isBaseline: existing.isBaseline === true,
    })

    return
  }

  Object.assign(cashForm, {
    openingCash: previousCashClosure.value?.countedCash ?? 0,
    openingBank: previousCashClosure.value?.countedBank ?? 0,
    notes: '',
    isBaseline: false,
  })
  cashForm.countedCash = expectedCash.value
  cashForm.countedBank = expectedBank.value
}

watch([selectedCashDate, () => closures.cash.length], loadCashForm, { immediate: true })

async function saveCashClosure() {
  if (cashDateIsFuture.value)
    return notifications.show('No se puede cerrar una fecha futura.', 'warning')
  if ([cashForm.openingCash, cashForm.openingBank, cashForm.countedCash, cashForm.countedBank].some(value => !Number.isFinite(Number(value)) || Number(value) < 0))
    return notifications.show('Captura saldos válidos mayores o iguales a cero.', 'warning')
  if (!session.uid || !session.profile)
    return notifications.show('No se pudo identificar al Admin que realiza el cierre.', 'error')

  savingCash.value = true
  try {
    const summary = cashMovementSummary.value

    await closures.saveCash({
      date: selectedCashDate.value,
      movementFrom: previousCashClosure.value ? addDays(previousCashClosure.value.date, 1) : selectedCashDate.value,
      isBaseline: cashForm.isBaseline,
      openingCash: Number(cashForm.openingCash),
      openingBank: Number(cashForm.openingBank),
      cashIncome: summary.cashIncome,
      bankIncome: summary.bankIncome,
      otherIncome: summary.otherIncome,
      cashExpenses: summary.cashExpenses,
      bankExpenses: summary.bankExpenses,
      otherExpenses: summary.otherExpenses,
      expectedCash: expectedCash.value,
      expectedBank: expectedBank.value,
      countedCash: Number(cashForm.countedCash),
      countedBank: Number(cashForm.countedBank),
      cashVariance: cashVariance.value,
      bankVariance: bankVariance.value,
      notes: cashForm.notes.trim() || null,
      closedBy: session.uid,
      closedByName: session.profile.displayName,
    })
    notifications.show(existingCashClosure.value ? 'Cierre diario actualizado.' : 'Cierre diario guardado.')
  }
  catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible guardar el cierre.', 'error')
  }
  finally {
    savingCash.value = false
  }
}

const selectedWeek = computed(() => weekBounds(selectedWeekDate.value))
const existingInventoryClosure = computed(() => closures.inventory.find(item => item.weekStart === selectedWeek.value.start) ?? null)
const inventoryProducts = computed(() => commerce.products
  .filter(product => product.status === 'active' || product.stock !== 0)
  .sort((left, right) => `${left.category} ${left.name}`.localeCompare(`${right.category} ${right.name}`, 'es')))

const inventoryRows = computed(() => {
  const existing = existingInventoryClosure.value
  if (existing)
    return Object.values(existing.items).sort((left, right) => `${left.category} ${left.name}`.localeCompare(`${right.category} ${right.name}`, 'es'))

  return inventoryProducts.value.map(product => ({
    productId: product.id,
    name: product.size ? `${product.name} · ${product.size}` : product.name,
    category: product.category,
    systemStock: Number(product.stock),
    unitCost: Number(product.unitCost),
  }))
})

const countedValue = (productId: string) => inventoryCounts[productId]
const rowVariance = (row: Pick<InventoryClosureItem, 'productId' | 'systemStock'>) => {
  const counted = countedValue(row.productId)

  return counted == null ? null : Number(counted) - Number(row.systemStock)
}

const inventoryAllCounted = computed(() => inventoryRows.value.length > 0 && inventoryRows.value.every(row => {
  const counted = countedValue(row.productId)

  return counted != null && Number.isFinite(Number(counted)) && Number(counted) >= 0
}))

const inventoryTotals = computed(() => inventoryRows.value.reduce((totals, row) => {
  const counted = countedValue(row.productId)
  const variance = counted == null ? 0 : Number(counted) - Number(row.systemStock)
  const value = variance * Number(row.unitCost)

  totals.system += Number(row.systemStock)
  totals.counted += counted == null ? 0 : Number(counted)
  totals.variance += variance
  if (value < 0) totals.loss += Math.abs(value)
  else totals.gain += value

  return totals
}, { system: 0, counted: 0, variance: 0, loss: 0, gain: 0 }))

function loadInventoryForm() {
  Object.keys(inventoryCounts).forEach(key => delete inventoryCounts[key])
  const existing = existingInventoryClosure.value

  inventoryRows.value.forEach(row => {
    inventoryCounts[row.productId] = existing?.items[row.productId]?.countedStock ?? null
  })
  inventoryNotes.value = existing?.notes ?? ''
}

watch([() => selectedWeek.value.start, () => closures.inventory.length, () => commerce.products.length], loadInventoryForm, { immediate: true })

async function saveInventoryClosure() {
  if (selectedWeek.value.start > today)
    return notifications.show('No se puede cerrar una semana futura.', 'warning')
  if (!inventoryAllCounted.value)
    return notifications.show('Captura el conteo físico de todos los productos.', 'warning')
  if (!session.uid || !session.profile)
    return notifications.show('No se pudo identificar al Admin que realiza el cierre.', 'error')

  const items = Object.fromEntries(inventoryRows.value.map(row => {
    const countedStock = Number(inventoryCounts[row.productId])
    const variance = countedStock - Number(row.systemStock)

    return [row.productId, {
      productId: row.productId,
      name: row.name,
      category: row.category,
      systemStock: Number(row.systemStock),
      countedStock,
      variance,
      unitCost: Number(row.unitCost),
      varianceValue: variance * Number(row.unitCost),
    } satisfies InventoryClosureItem]
  }))

  savingInventory.value = true
  try {
    await closures.saveInventory({
      weekStart: selectedWeek.value.start,
      weekEnd: selectedWeek.value.end,
      items,
      totalSystemUnits: inventoryTotals.value.system,
      totalCountedUnits: inventoryTotals.value.counted,
      varianceUnits: inventoryTotals.value.variance,
      lossValue: inventoryTotals.value.loss,
      gainValue: inventoryTotals.value.gain,
      notes: inventoryNotes.value.trim() || null,
      closedBy: session.uid,
      closedByName: session.profile.displayName,
    })
    notifications.show(existingInventoryClosure.value ? 'Cierre semanal actualizado.' : 'Cierre semanal guardado.')
  }
  catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible guardar el cierre de inventario.', 'error')
  }
  finally {
    savingInventory.value = false
  }
}

onMounted(() => {
  closures.subscribe()
  commerce.subscribe()
  expenses.subscribe()
  payments.subscribe()
  visitPayments.subscribe()
})

onBeforeUnmount(() => {
  closures.dispose()
  commerce.dispose()
  expenses.dispose()
  payments.dispose()
  visitPayments.dispose()
})
</script>

<template>
  <PageHeader
    title="Cierres y conciliación"
    eyebrow="Control operativo"
    description="Compara el dinero y el inventario esperados contra lo que realmente existe."
  />

  <VTabs
    v-model="tab"
    class="mb-5"
  >
    <VTab value="cash">
      Caja diaria
    </VTab>
    <VTab value="inventory">
      Inventario semanal
    </VTab>
  </VTabs>

  <VWindow v-model="tab">
    <VWindowItem value="cash">
      <VAlert
        color="info"
        variant="tonal"
        class="mb-5"
        icon="ri-information-line"
      >
        Caja considera efectivo. Cuenta bancaria agrupa transferencias y tarjetas. Los métodos “Otro” se muestran aparte y no alteran esos saldos.
      </VAlert>

      <VRow>
        <VCol
          cols="12"
          xl="7"
        >
          <VCard
            class="kronos-card"
            rounded="xl"
          >
            <VCardItem
              title="Cierre diario"
              :subtitle="previousCashClosure ? `Saldo inicial tomado del cierre ${formatDate(previousCashClosure.date)}` : 'Primer cierre: captura los saldos con los que inicia el control'"
            />
            <VCardText>
              <VTextField
                v-model="selectedCashDate"
                type="date"
                label="Fecha del cierre"
                :max="today"
                class="mb-5"
              />

              <VSwitch
                v-if="!previousCashClosure"
                v-model="cashForm.isBaseline"
                label="Usar como saldo inicial conciliado"
                color="primary"
                class="mb-2"
                hint="Actívalo si los saldos capturados ya incluyen ventas, egresos y transferencias anteriores. Esos movimientos no se volverán a sumar."
                persistent-hint
              />

              <VAlert
                v-if="cashForm.isBaseline"
                color="info"
                variant="tonal"
                class="mb-5"
              >
                Este cierre inicia un control nuevo. Caja y banco esperados serán exactamente los saldos conciliados que captures; el historial anterior queda absorbido en esta base.
              </VAlert>

              <VRow>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model.number="cashForm.openingCash"
                    type="number"
                    min="0"
                    prefix="$"
                    label="Saldo inicial en caja"
                    :readonly="Boolean(previousCashClosure)"
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <VTextField
                    v-model.number="cashForm.openingBank"
                    type="number"
                    min="0"
                    prefix="$"
                    label="Saldo inicial en cuenta bancaria"
                    :readonly="Boolean(previousCashClosure)"
                  />
                </VCol>
              </VRow>

              <div
                v-if="!cashForm.isBaseline"
                class="movement-breakdown mb-6"
              >
                <div>
                  <span>Ingresos en efectivo</span><strong class="text-success">{{ formatCurrency(cashMovementSummary.cashIncome) }}</strong>
                </div>
                <div>
                  <span>Egresos en efectivo</span><strong class="text-error">-{{ formatCurrency(cashMovementSummary.cashExpenses) }}</strong>
                </div>
                <div>
                  <span>Ingresos a banco</span><strong class="text-success">{{ formatCurrency(cashMovementSummary.bankIncome) }}</strong>
                </div>
                <div>
                  <span>Egresos de banco</span><strong class="text-error">-{{ formatCurrency(cashMovementSummary.bankExpenses) }}</strong>
                </div>
                <div v-if="cashMovementSummary.otherIncome || cashMovementSummary.otherExpenses">
                  <span>Métodos sin conciliar</span><strong>{{ formatCurrency(cashMovementSummary.otherIncome - cashMovementSummary.otherExpenses) }}</strong>
                </div>
              </div>

              <VRow class="mb-2">
                <VCol
                  cols="12"
                  md="6"
                >
                  <div class="expected-balance">
                    <span>Efectivo esperado</span>
                    <strong>{{ formatCurrency(expectedCash) }}</strong>
                  </div>
                  <VTextField
                    v-model.number="cashForm.countedCash"
                    type="number"
                    min="0"
                    prefix="$"
                    label="Efectivo contado físicamente"
                    hint="Cuenta billetes y monedas al terminar el día."
                    persistent-hint
                  />
                </VCol>
                <VCol
                  cols="12"
                  md="6"
                >
                  <div class="expected-balance">
                    <span>Banco esperado</span>
                    <strong>{{ formatCurrency(expectedBank) }}</strong>
                  </div>
                  <VTextField
                    v-model.number="cashForm.countedBank"
                    type="number"
                    min="0"
                    prefix="$"
                    label="Saldo real de la cuenta bancaria"
                    hint="Captura el saldo mostrado por el banco."
                    persistent-hint
                  />
                </VCol>
              </VRow>

              <VAlert
                :color="Math.abs(totalVariance) < 0.01 ? 'success' : 'error'"
                variant="tonal"
                class="mb-5"
              >
                <div class="d-flex flex-wrap justify-space-between ga-3">
                  <span>Diferencia en caja: <strong>{{ formatCurrency(cashVariance) }}</strong></span>
                  <span>Diferencia en banco: <strong>{{ formatCurrency(bankVariance) }}</strong></span>
                  <span>Diferencia total: <strong>{{ formatCurrency(totalVariance) }}</strong></span>
                </div>
              </VAlert>

              <VTextarea
                v-model="cashForm.notes"
                label="Notas o explicación de diferencias"
                rows="3"
                auto-grow
              />
              <VBtn
                block
                size="large"
                prepend-icon="ri-safe-2-line"
                :loading="savingCash"
                @click="saveCashClosure"
              >
                {{ existingCashClosure ? 'Actualizar cierre' : 'Guardar cierre del día' }}
              </VBtn>
            </VCardText>
          </VCard>
        </VCol>

        <VCol
          cols="12"
          xl="5"
        >
          <VRow class="mb-2">
            <VCol cols="6">
              <MetricCard
                label="Caja esperada"
                :value="formatCurrency(expectedCash)"
                icon="ri-cash-line"
                color="secondary"
                :detail="cashForm.isBaseline ? 'Saldo inicial conciliado' : `Movimientos desde ${formatDate(previousCashClosure?.date ?? selectedCashDate)}`"
              />
            </VCol>
            <VCol cols="6">
              <MetricCard
                label="Banco esperado"
                :value="formatCurrency(expectedBank)"
                icon="ri-bank-line"
                color="info"
                detail="Transferencias y tarjetas"
              />
            </VCol>
          </VRow>
          <VCard
            class="kronos-card"
            rounded="xl"
          >
            <VCardItem
              title="Historial de cierres"
              subtitle="Últimos 15 registros"
            />
            <EmptyState
              v-if="!cashHistory.length"
              title="Sin cierres diarios"
              description="El primer cierre establecerá los saldos de control."
              icon="ri-safe-line"
            />
            <VTable
              v-else
              density="compact"
            >
              <thead>
                <tr><th>Fecha</th><th class="text-right">Caja</th><th class="text-right">Banco</th><th class="text-right">Diferencia</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="closure in cashHistory"
                  :key="closure.id"
                  class="closure-row"
                  @click="selectedCashDate = closure.date"
                >
                  <td>{{ formatDate(closure.date) }}</td>
                  <td class="text-right">{{ formatCurrency(closure.countedCash) }}</td>
                  <td class="text-right">{{ formatCurrency(closure.countedBank) }}</td>
                  <td
                    class="text-right font-weight-bold"
                    :class="Math.abs(closure.cashVariance + closure.bankVariance) < 0.01 ? 'text-success' : 'text-error'"
                  >
                    {{ formatCurrency(closure.cashVariance + closure.bankVariance) }}
                  </td>
                </tr>
              </tbody>
            </VTable>
          </VCard>
        </VCol>
      </VRow>
    </VWindowItem>

    <VWindowItem value="inventory">
      <VAlert
        color="warning"
        variant="tonal"
        class="mb-5"
        icon="ri-scales-3-line"
      >
        Este cierre registra la diferencia entre sistema y conteo físico. No modifica automáticamente las existencias.
      </VAlert>

      <VRow class="mb-2">
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard label="Stock en sistema" :value="inventoryTotals.system" icon="ri-archive-stack-line" detail="Unidades esperadas" />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard label="Conteo físico" :value="inventoryTotals.counted" icon="ri-checkbox-multiple-line" color="secondary" detail="Unidades capturadas" />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard label="Diferencia" :value="inventoryTotals.variance" icon="ri-scales-line" :color="inventoryTotals.variance < 0 ? 'error' : 'success'" detail="Faltantes o sobrantes" />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <MetricCard label="Pérdida estimada" :value="formatCurrency(inventoryTotals.loss)" icon="ri-error-warning-line" color="error" detail="A costo unitario" />
        </VCol>
      </VRow>

      <VCard
        class="kronos-card mb-5"
        rounded="xl"
      >
        <VCardItem
          title="Conteo semanal"
          :subtitle="`${formatDate(selectedWeek.start)} al ${formatDate(selectedWeek.end)}`"
        >
        </VCardItem>
        <VCardText>
          <VTextField
            v-model="selectedWeekDate"
            type="date"
            label="Selecciona una fecha de la semana"
            :max="today"
            class="mb-4"
          />

          <div class="inventory-table-wrap">
            <VTable>
              <thead>
                <tr><th>Producto</th><th>Categoría</th><th class="text-right">Sistema</th><th style="min-inline-size: 180px">Conteo físico</th><th class="text-right">Diferencia</th><th class="text-right">Impacto</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in inventoryRows"
                  :key="row.productId"
                >
                  <td class="font-weight-medium">{{ row.name }}</td>
                  <td>{{ row.category }}</td>
                  <td class="text-right">{{ row.systemStock }}</td>
                  <td>
                    <VTextField
                      v-model.number="inventoryCounts[row.productId]"
                      type="number"
                      min="0"
                      density="compact"
                      hide-details
                      label="Unidades contadas"
                    />
                  </td>
                  <td
                    class="text-right font-weight-bold"
                    :class="(rowVariance(row) ?? 0) < 0 ? 'text-error' : (rowVariance(row) ?? 0) > 0 ? 'text-warning' : 'text-success'"
                  >
                    {{ rowVariance(row) == null ? '—' : rowVariance(row) }}
                  </td>
                  <td class="text-right">{{ rowVariance(row) == null ? '—' : formatCurrency((rowVariance(row) ?? 0) * row.unitCost) }}</td>
                </tr>
              </tbody>
            </VTable>
          </div>

          <VTextarea
            v-model="inventoryNotes"
            label="Notas del conteo o explicación de pérdidas"
            rows="3"
            auto-grow
            class="mt-5"
          />
          <VBtn
            block
            size="large"
            prepend-icon="ri-save-3-line"
            :loading="savingInventory"
            :disabled="!inventoryAllCounted"
            @click="saveInventoryClosure"
          >
            {{ existingInventoryClosure ? 'Actualizar cierre semanal' : 'Guardar cierre semanal' }}
          </VBtn>
        </VCardText>
      </VCard>

      <VCard
        class="kronos-card"
        rounded="xl"
      >
        <VCardItem title="Historial semanal" subtitle="Últimos 15 cierres" />
        <EmptyState
          v-if="!inventoryHistory.length"
          title="Sin cierres de inventario"
          description="Realiza el primer conteo físico para comenzar a medir pérdidas."
          icon="ri-archive-drawer-line"
        />
        <VTable
          v-else
          density="compact"
        >
          <thead>
            <tr><th>Semana</th><th class="text-right">Sistema</th><th class="text-right">Físico</th><th class="text-right">Diferencia</th><th class="text-right">Pérdida</th><th>Responsable</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="closure in inventoryHistory"
              :key="closure.id"
              class="closure-row"
              @click="selectedWeekDate = closure.weekStart"
            >
              <td>{{ formatDate(closure.weekStart) }} – {{ formatDate(closure.weekEnd) }}</td>
              <td class="text-right">{{ closure.totalSystemUnits }}</td>
              <td class="text-right">{{ closure.totalCountedUnits }}</td>
              <td
                class="text-right font-weight-bold"
                :class="closure.varianceUnits < 0 ? 'text-error' : closure.varianceUnits > 0 ? 'text-warning' : 'text-success'"
              >
                {{ closure.varianceUnits }}
              </td>
              <td class="text-right text-error">{{ formatCurrency(closure.lossValue) }}</td>
              <td>{{ closure.closedByName }}</td>
            </tr>
          </tbody>
        </VTable>
      </VCard>
    </VWindowItem>
  </VWindow>
</template>

<style scoped>
.movement-breakdown {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.movement-breakdown > div,
.expected-balance {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(151, 213, 222, 0.18);
  border-radius: 14px;
  background: rgba(151, 213, 222, 0.05);
}

.expected-balance {
  margin-block-end: 16px;
}

.expected-balance strong {
  color: rgb(var(--v-theme-secondary));
  font-size: 1.15rem;
}

.closure-row {
  cursor: pointer;
}

.closure-row:hover {
  background: rgba(151, 213, 222, 0.06);
}

.inventory-table-wrap {
  overflow-x: auto;
}

@media (max-width: 700px) {
  .movement-breakdown {
    grid-template-columns: 1fr;
  }
}
</style>
