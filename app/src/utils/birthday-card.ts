import officialLogoUrl from '@images/kronos-logo-official-dark.png?url'
import templateUrl from '@images/birthday-card-template-1080.png?url'
import { BIRTHDAY_CARD_MESSAGE, BIRTHDAY_CARD_SIGNATURE, BIRTHDAY_CARD_TITLE } from '@/utils/birthday-card-copy'

export const BIRTHDAY_CARD_VERSION = 'kronos-athlete-v2'

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()

  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('No fue posible cargar la plantilla de cumpleaños.'))
  image.src = source
})

function fitName(context: CanvasRenderingContext2D, name: string) {
  let size = 86
  while (size > 46) {
    context.font = `800 ${size}px Inter, Arial, sans-serif`
    if (context.measureText(name).width <= 820)
      break
    size -= 2
  }

  return size
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate
      continue
    }

    if (line)
      lines.push(line)
    line = word
  }

  if (line)
    lines.push(line)

  return lines
}

export async function renderBirthdayCard(name: string) {
  const canvas = document.createElement('canvas')

  canvas.width = 1080
  canvas.height = 1080

  const context = canvas.getContext('2d')

  if (!context)
    throw new Error('Tu navegador no permite generar la tarjeta.')

  const [template, officialLogo] = await Promise.all([
    loadImage(templateUrl),
    loadImage(officialLogoUrl),
  ])

  context.drawImage(template, 0, 0, 1080, 1080)
  context.drawImage(officialLogo, 220, 42, 640, 233)
  context.textAlign = 'center'
  context.fillStyle = '#F8FCFF'
  context.shadowColor = 'rgba(0,0,0,.45)'
  context.shadowBlur = 18
  context.font = '700 42px Inter, Arial, sans-serif'
  context.fillText(BIRTHDAY_CARD_TITLE, 540, 360)
  context.fillStyle = '#98D6DF'
  context.font = `800 ${fitName(context, name)}px Inter, Arial, sans-serif`
  context.fillText(name, 540, 455)
  context.fillStyle = '#ECECEC'
  context.font = '500 29px Inter, Arial, sans-serif'

  const messageLines = wrapText(context, BIRTHDAY_CARD_MESSAGE, 730)

  messageLines.forEach((line, index) => context.fillText(line, 540, 545 + index * 43))
  context.fillStyle = '#FF401B'
  context.font = '700 30px Inter, Arial, sans-serif'
  context.fillText(BIRTHDAY_CARD_SIGNATURE, 540, 545 + messageLines.length * 43 + 50)

  return canvas
}

export const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No fue posible generar el PNG.')), 'image/png'))
