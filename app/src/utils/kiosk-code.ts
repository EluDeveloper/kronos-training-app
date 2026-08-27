import {
  BarcodeFormat,
  type BitMatrix,
  QRCodeWriter,
} from '@zxing/library'

export const KIOSK_CODE_PATTERN = /^\d{6}$/
export const KIOSK_CREDENTIAL_WIDTH = 1080
export const KIOSK_CREDENTIAL_HEIGHT = 1920
export const KIOSK_WEBSITE = 'https://kronos-training.com/'

const KIOSK_CODE_SPACE = 1_000_000
const UINT32_RANGE = 0x1_0000_0000
const UNBIASED_UINT32_LIMIT = Math.floor(UINT32_RANGE / KIOSK_CODE_SPACE) * KIOSK_CODE_SPACE
const DEFAULT_MAX_ATTEMPTS = 64
const QR_MATRIX_SIZE = 320

export interface GenerateKioskCodeOptions {
  excludedCodes?: ReadonlySet<string>
  maxAttempts?: number
  randomUint32?: () => number
}

export type GenerateKioskCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'generation-exhausted' }

export interface KioskCredentialData {
  athleteName: string
  code: string
}

function browserRandomUint32() {
  const values = new Uint32Array(1)

  globalThis.crypto.getRandomValues(values)

  return values[0]
}

export function generateKioskCode(
  occupiedCodes: ReadonlySet<string>,
  options: GenerateKioskCodeOptions = {},
): GenerateKioskCodeResult {
  const excludedCodes = options.excludedCodes ?? new Set<string>()
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS))
  const randomUint32 = options.randomUint32 ?? browserRandomUint32

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const randomValue = randomUint32()

    if (!Number.isInteger(randomValue) || randomValue < 0 || randomValue >= UNBIASED_UINT32_LIMIT)
      continue

    const candidate = String(randomValue % KIOSK_CODE_SPACE).padStart(6, '0')

    if (!occupiedCodes.has(candidate) && !excludedCodes.has(candidate))
      return { ok: true, code: candidate }
  }

  return { ok: false, reason: 'generation-exhausted' }
}

export function parseKioskCodePayload(value: string) {
  return KIOSK_CODE_PATTERN.test(value) ? value : null
}

export function createKioskQrMatrix(code: string, size = QR_MATRIX_SIZE) {
  const normalized = parseKioskCodePayload(code)
  if (!normalized)
    throw new Error('El código del QR debe contener exactamente 6 dígitos.')

  return new QRCodeWriter().encode(normalized, BarcodeFormat.QR_CODE, size, size, new Map())
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function normalizedAthleteName(value: string) {
  return value.trim().replace(/\s+/g, ' ') || 'Atleta Kronos'
}

function splitAthleteName(value: string) {
  const name = normalizedAthleteName(value)
  const words = name.split(' ')
  if (words.length === 1 || name.length <= 24)
    return [name]

  let best = [words[0], words.slice(1).join(' ')]
  let bestDifference = Number.POSITIVE_INFINITY

  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(' ')
    const second = words.slice(index).join(' ')
    const difference = Math.abs(first.length - second.length)

    if (difference < bestDifference) {
      best = [first, second]
      bestDifference = difference
    }
  }

  return best
}

function athleteNameFontSize(lines: string[]) {
  const longestLine = Math.max(...lines.map(line => line.length))

  if (longestLine <= 20)
    return 54
  if (longestLine <= 30)
    return 44
  if (longestLine <= 40)
    return 36

  return 28
}

function qrPath(matrix: BitMatrix) {
  const commands: string[] = []
  const width = matrix.getWidth()
  const height = matrix.getHeight()

  for (let y = 0; y < height; y += 1) {
    let x = 0

    while (x < width) {
      if (!matrix.get(x, y)) {
        x += 1
        continue
      }

      const start = x
      while (x < width && matrix.get(x, y))
        x += 1

      commands.push(`M${start} ${y}h${x - start}v1H${start}z`)
    }
  }

  return commands.join('')
}

export function buildKioskCredentialSvg(data: KioskCredentialData) {
  const code = parseKioskCodePayload(data.code)
  if (!code)
    throw new Error('La credencial requiere un código de 6 dígitos.')

  const nameLines = splitAthleteName(data.athleteName)
  const fontSize = athleteNameFontSize(nameLines)
  const firstLineY = nameLines.length === 1 ? 1240 : 1205

  const nameText = nameLines
    .map((line, index) => `<text x="540" y="${firstLineY + index * 64}" class="athlete" font-size="${fontSize}">${escapeXml(line)}</text>`)
    .join('')

  const matrix = createKioskQrMatrix(code)
  const path = qrPath(matrix)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${KIOSK_CREDENTIAL_WIDTH}" height="${KIOSK_CREDENTIAL_HEIGHT}" viewBox="0 0 ${KIOSK_CREDENTIAL_WIDTH} ${KIOSK_CREDENTIAL_HEIGHT}" role="img" aria-label="Credencial de Kiosco Kronos">
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#8a3d0f"/><stop offset=".24" stop-color="#d87820"/><stop offset=".5" stop-color="#7b310b"/><stop offset=".76" stop-color="#e28a2d"/><stop offset="1" stop-color="#7a2c0b"/></linearGradient>
    <pattern id="grain" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M0 7h34M0 24h34" stroke="#fff" stroke-opacity=".035" stroke-width="2"/><path d="M8 0v34M25 0v34" stroke="#000" stroke-opacity=".08"/></pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#000" flood-opacity=".38"/></filter>
  </defs>
  <rect width="1080" height="1920" fill="url(#wood)"/>
  <rect width="1080" height="1920" fill="url(#grain)"/>
  <rect x="42" y="42" width="996" height="1836" rx="118" fill="#171716" filter="url(#shadow)"/>
  <rect x="42" y="42" width="996" height="1836" rx="118" fill="url(#grain)" opacity=".55"/>
  <rect x="180" y="260" width="720" height="720" rx="34" fill="#fff"/>
  <path d="${path}" transform="translate(220 300) scale(2)" fill="#111" shape-rendering="crispEdges"/>
  <style>.brand{font:800 78px Arial,sans-serif;letter-spacing:2px;text-anchor:middle}.athlete{font-family:Arial,sans-serif;font-weight:700;letter-spacing:5px;text-anchor:middle;fill:#f7f2ea}.label{font:600 28px Arial,sans-serif;letter-spacing:7px;text-anchor:middle;fill:#aaa49a}.code{font:800 74px ui-monospace,Consolas,monospace;letter-spacing:16px;text-anchor:middle;fill:#fff}.site{font:500 30px Arial,sans-serif;text-anchor:middle;fill:#e87d24}</style>
  <text x="540" y="1100" class="brand" fill="#e87d24">Kiosco Kronos</text>
  ${nameText}
  <text x="540" y="1390" class="label">CÓDIGO PERSONAL</text>
  <text x="548" y="1480" class="code">${code}</text>
  <rect x="190" y="1650" width="700" height="2" fill="#e87d24" opacity=".38"/>
  <text x="540" y="1740" class="site">${KIOSK_WEBSITE}</text>
</svg>`
}

export function kioskCredentialFilename(athleteName: string) {
  const slug = normalizedAthleteName(athleteName)
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'atleta'

  return `credencial-kiosco-${slug}.png`
}

export function kioskCredentialSvgDataUrl(data: KioskCredentialData) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildKioskCredentialSvg(data))}`
}

export function kioskCredentialWhatsAppMessage(data: KioskCredentialData) {
  const athleteName = normalizedAthleteName(data.athleteName)
  const code = parseKioskCodePayload(data.code)
  if (!code)
    throw new Error('La credencial requiere un código de 6 dígitos.')

  return `Hola ${athleteName}. Tu código personal para el Kiosco Kronos es: ${code}. Adjunta la imagen descargada manualmente antes de enviar este mensaje y no la compartas con otras personas.`
}

export function kioskCredentialWhatsAppUrl(data: KioskCredentialData, phone: string) {
  const normalizedPhone = phone.replace(/\D/g, '')
  const message = encodeURIComponent(kioskCredentialWhatsAppMessage(data))
  const phoneQuery = normalizedPhone ? `phone=52${normalizedPhone}&` : ''

  return `https://web.whatsapp.com/send?${phoneQuery}text=${message}`
}

function loadSvgImage(data: KioskCredentialData) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No fue posible renderizar la credencial QR.'))
    image.src = kioskCredentialSvgDataUrl(data)
  })
}

export async function createKioskCredentialPng(data: KioskCredentialData) {
  const image = await loadSvgImage(data)
  const canvas = document.createElement('canvas')

  canvas.width = KIOSK_CREDENTIAL_WIDTH
  canvas.height = KIOSK_CREDENTIAL_HEIGHT

  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('El navegador no pudo preparar la imagen de la credencial.')

  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob)
        resolve(blob)
      else
        reject(new Error('No fue posible exportar la credencial como PNG.'))
    }, 'image/png')
  })
}

export async function downloadKioskCredential(data: KioskCredentialData) {
  const blob = await createKioskCredentialPng(data)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = kioskCredentialFilename(data.athleteName)
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
