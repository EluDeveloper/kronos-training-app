<script setup lang="ts">
import JsBarcode from 'jsbarcode'
import { formatCurrency } from '@/utils/kronos'

const props = defineProps<{
  modelValue: boolean
  name: string
  variant?: string | null
  price: number
  code: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  error: [message: string]
}>()

const barcodeSvg = ref<SVGSVGElement | null>(null)

async function renderBarcode() {
  if (!props.modelValue || !props.code)
    return

  await nextTick()
  if (!barcodeSvg.value)
    return

  JsBarcode(barcodeSvg.value, props.code, {
    format: 'CODE128',
    width: 2,
    height: 82,
    displayValue: true,
    fontSize: 18,
    margin: 12,
    lineColor: '#111111',
    background: '#ffffff',
  })
}

function appendText(parent: HTMLElement, tag: 'h1' | 'p', value: string, className: string) {
  const element = document.createElement(tag)

  element.className = className
  element.textContent = value
  parent.append(element)
}

function printLabel() {
  if (!barcodeSvg.value)
    return

  const printWindow = window.open('', '_blank', 'width=640,height=520')
  if (!printWindow) {
    emit('error', 'El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo nuevamente.')

    return
  }

  const style = printWindow.document.createElement('style')

  style.textContent = `
    @page { size: 62mm 38mm; margin: 2mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: #fff; font-family: Arial, sans-serif; }
    .label { width: 58mm; min-height: 34mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
    .name { max-width: 56mm; margin: 0; font-size: 11pt; font-weight: 700; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .variant { margin: 1mm 0 0; font-size: 8pt; }
    .barcode { width: 54mm; height: 19mm; margin: 1mm 0 0; }
    .price { margin: 0; font-size: 11pt; font-weight: 700; }
  `
  printWindow.document.head.append(style)
  printWindow.document.title = `Etiqueta ${props.code}`

  const label = printWindow.document.createElement('main')

  label.className = 'label'
  appendText(label, 'h1', props.name, 'name')
  if (props.variant)
    appendText(label, 'p', props.variant, 'variant')

  const clonedBarcode = barcodeSvg.value.cloneNode(true) as SVGSVGElement

  clonedBarcode.classList.add('barcode')
  label.append(clonedBarcode)
  appendText(label, 'p', formatCurrency(props.price), 'price')
  printWindow.document.body.append(label)
  printWindow.document.close()
  printWindow.opener = null
  window.setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 250)
}

watch(() => [props.modelValue, props.code, props.name, props.variant, props.price], renderBarcode, { immediate: true })
</script>

<template>
  <VDialog
    :model-value="modelValue"
    max-width="620"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard
      class="kronos-card"
      rounded="xl"
    >
      <VCardItem
        class="pa-6 pb-2"
        title="Etiqueta de producto"
        subtitle="Código 128 listo para imprimir y pegar en el producto."
      />
      <VCardText class="pa-6">
        <div class="barcode-label-preview pa-6 text-center">
          <p class="text-h6 font-weight-bold mb-1">
            {{ name }}
          </p>
          <p
            v-if="variant"
            class="text-body-2 mb-2"
          >
            {{ variant }}
          </p>
          <svg ref="barcodeSvg" />
          <p class="text-h5 font-weight-bold mb-0">
            {{ formatCurrency(price) }}
          </p>
        </div>
      </VCardText>
      <VCardActions class="pa-6 pt-0">
        <VSpacer />
        <VBtn
          variant="text"
          @click="emit('update:modelValue', false)"
        >
          Cerrar
        </VBtn>
        <VBtn
          prepend-icon="ri-printer-line"
          @click="printLabel"
        >
          Imprimir etiqueta
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.barcode-label-preview {
  border: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 18px;
  color: #111;
  background: #fff;
}

.barcode-label-preview svg {
  max-width: 100%;
}
</style>
