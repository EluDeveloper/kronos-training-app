import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const authStatePath = resolve('.playwright/auth/user.json')
const hasAuthState = existsSync(authStatePath)

const viewports = [
  { width: 320, height: 720 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
]

test.use({ storageState: hasAuthState ? authStatePath : { cookies: [], origins: [] } })
test.skip(!hasAuthState, 'Ejecuta npm run test:e2e:auth y completa el login manual antes del QA protegido.')

for (const viewport of viewports) {
  test(`credencial QR de quiosco genera candidatos sin guardar en ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/atletas')

    await expect(page.getByRole('heading', { name: 'Atletas' })).toBeVisible()
    await page.getByRole('button', { name: /Credencial QR de/ }).first().click()

    const dialog = page.getByRole('dialog', { name: 'Credencial QR de Kiosco' })

    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/El QR contiene únicamente el código aleatorio de 6 dígitos/)).toBeVisible()
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)

    await dialog.getByRole('button', { name: /^(Generar código|Regenerar código)$/ }).click()

    const confirmButton = dialog.getByRole('button', { name: 'Preparar código' })
    if (await confirmButton.isVisible())
      await confirmButton.click()

    const card = dialog.getByTestId('kiosk-credential-card')
    const caption = card.getByText(/Código personal \d{6}/)

    await expect(card.getByText('Pendiente de guardar')).toBeVisible()
    await expect(caption).toBeVisible()
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)

    const firstCode = (await caption.textContent())?.match(/\d{6}/)?.[0]

    expect(firstCode).toMatch(/^\d{6}$/)

    const image = card.getByRole('img')

    await expect(image).toHaveAttribute('width', '1080')
    await expect(image).toHaveAttribute('height', '1920')
    await expect(image).toHaveJSProperty('naturalWidth', 1080)
    await expect(image).toHaveJSProperty('naturalHeight', 1920)

    const imageSource = await image.getAttribute('src')

    expect(decodeURIComponent(imageSource ?? '')).toContain('Kiosco Kronos')
    expect(decodeURIComponent(imageSource ?? '')).toContain('https://kronos-training.com/')

    await dialog.getByRole('button', { name: 'Generar otro candidato' }).click()
    await expect(caption).not.toContainText(firstCode ?? '')
    await expect(dialog.getByRole('button', { name: 'Guardar código nuevo' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Cerrar' }).click()
    await expect(dialog).toBeHidden()
  })
}
