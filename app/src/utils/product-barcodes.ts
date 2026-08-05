import type { Product } from '@/types/domain'

export const normalizeProductBarcode = (value?: string | null) => (value ?? '').trim().toUpperCase()

export function productBarcodes(product: Pick<Product, 'barcode' | 'barcodes'>) {
  return [...new Set([
    normalizeProductBarcode(product.barcode),
    ...Object.entries(product.barcodes ?? {})
      .filter(([, enabled]) => enabled === true)
      .map(([code]) => normalizeProductBarcode(code)),
  ].filter(Boolean))]
}

export function productHasBarcode(product: Pick<Product, 'barcode' | 'barcodes'>, value: string) {
  const normalized = normalizeProductBarcode(value)

  return Boolean(normalized && productBarcodes(product).includes(normalized))
}

export function generateInternalBarcode(products: Array<Pick<Product, 'barcode' | 'barcodes'>>) {
  const used = new Set(products.flatMap(productBarcodes))
  const values = new Uint32Array(1)
  let candidate = ''

  do {
    crypto.getRandomValues(values)
    candidate = `KR-${String(values[0] % 100_000_000).padStart(8, '0')}`
  } while (used.has(candidate))

  return candidate
}
