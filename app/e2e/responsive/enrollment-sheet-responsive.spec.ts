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
  test(`ficha de inscripción conserva contenido y responsive en ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/atletas')

    await expect(page.getByRole('heading', { name: 'Atletas' })).toBeVisible()
    await page.getByRole('button', { name: /Ficha de inscripción de/ }).first().click()

    const dialog = page.getByRole('dialog', { name: 'Ficha de inscripción' })

    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/Tu fecha de pago será el \d+ de cada mes\./)).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Contacto de emergencia' })).toBeVisible()
    await expect(dialog.getByText('Nombre', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Teléfono', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Parentesco', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Datos de admisión', { exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Imprimir' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'PDF' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'WhatsApp Web' })).toBeVisible()
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  })
}
