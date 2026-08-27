import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from '@zxing/library'
import {
  buildKioskCredentialSvg,
  createKioskQrMatrix,
  generateKioskCode,
  kioskCredentialFilename,
  kioskCredentialWhatsAppMessage,
  kioskCredentialWhatsAppUrl,
  parseKioskCodePayload,
} from '../src/utils/kiosk-code'

function sequence(values: number[]) {
  let index = 0

  return () => values[Math.min(index++, values.length - 1)]
}

function decodeQrMatrix(matrix: ReturnType<typeof createKioskQrMatrix>) {
  const width = matrix.getWidth()
  const height = matrix.getHeight()
  const luminances = new Uint8ClampedArray(width * height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1)
      luminances[y * width + x] = matrix.get(x, y) ? 0 : 255
  }

  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminances, width, height)))
  const hints = new Map([[DecodeHintType.PURE_BARCODE, true]])

  return new QRCodeReader().decode(bitmap, hints).getText()
}

test('genera exactamente seis dígitos y conserva ceros iniciales', () => {
  const result = generateKioskCode(new Set(), {
    randomUint32: () => 42,
  })

  assert.deepEqual(result, { ok: true, code: '000042' })
})

test('reintenta códigos ocupados y candidatos descartados', () => {
  const result = generateKioskCode(new Set(['000042']), {
    excludedCodes: new Set(['123456']),
    randomUint32: sequence([42, 123456, 654321]),
  })

  assert.deepEqual(result, { ok: true, code: '654321' })
})

test('descarta valores con sesgo y agota intentos sin producir un código', () => {
  const result = generateKioskCode(new Set(), {
    maxAttempts: 2,
    randomUint32: () => 0xFFFFFFFF,
  })

  assert.deepEqual(result, { ok: false, reason: 'generation-exhausted' })
})

test('acepta sólo payloads QR de seis dígitos', () => {
  assert.equal(parseKioskCodePayload('123456'), '123456')
  assert.equal(parseKioskCodePayload(' 123456 '), null)
  assert.equal(parseKioskCodePayload('12345'), null)
  assert.equal(parseKioskCodePayload('1234567'), null)
  assert.equal(parseKioskCodePayload('https://kronos-training.com/?code=123456'), null)
  assert.equal(parseKioskCodePayload('ABC123'), null)
})

test('el QR decodifica exactamente el código aleatorio', () => {
  const matrix = createKioskQrMatrix('004286')

  assert.equal(decodeQrMatrix(matrix), '004286')
})

test('la credencial contiene los textos autorizados y escapa el nombre', () => {
  const svg = buildKioskCredentialSvg({
    athleteName: 'Edilberto <script>alert(1)</script>',
    code: '004286',
  })

  assert.match(svg, /width="1080"/)
  assert.match(svg, /height="1920"/)
  assert.match(svg, /Kiosco Kronos/)
  assert.match(svg, /004286/)
  assert.match(svg, /https:\/\/kronos-training\.com\//)
  assert.doesNotMatch(svg, /<script>/)
  assert.match(svg, /&lt;script&gt;/)
  assert.doesNotMatch(svg, /teléfono|nacimiento|athleteId/i)
})

test('genera un nombre de archivo estable y seguro', () => {
  assert.equal(kioskCredentialFilename(' Edilberto Pérez '), 'credencial-kiosco-edilberto-perez.png')
})

test('prepara WhatsApp para adjuntar manualmente sólo la credencial persistida', () => {
  const message = kioskCredentialWhatsAppMessage({ athleteName: 'Edilberto Pérez', code: '004286' })
  const url = kioskCredentialWhatsAppUrl({ athleteName: 'Edilberto Pérez', code: '004286' }, '55 1234-5678')

  assert.match(message, /Hola Edilberto Pérez/)
  assert.match(message, /004286/)
  assert.match(message, /adjunta la imagen descargada manualmente/i)
  assert.doesNotMatch(message, /teléfono|nacimiento|athleteId/i)
  assert.match(url, /^https:\/\/web\.whatsapp\.com\/send\?phone=525512345678&text=/)
  assert.equal(decodeURIComponent(url.split('text=')[1]), message)
})
