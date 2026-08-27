import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const authStatePath = resolve('.playwright/auth/user.json')
const hasAuthState = existsSync(authStatePath)

const viewports = [
  { width: 320, height: 720 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1_000 },
]

test.use({ storageState: hasAuthState ? authStatePath : { cookies: [], origins: [] } })
test.skip(!hasAuthState, 'Ejecuta npm run test:e2e:auth y completa el login manual antes del QA protegido.')

for (const viewport of viewports) {
  test(`Punto de Venta conserva Cobro y omite agotados en ${viewport.width}px`, async ({ page }) => {
    const pageErrors: string[] = []

    page.on('pageerror', error => pageErrors.push(error.message))
    await page.setViewportSize(viewport)
    await page.goto('/tienda')

    await expect(page.getByRole('heading', { name: 'Tienda' })).toBeVisible()
    await expect(page.getByTestId('pos-checkout')).toBeVisible()
    await expect(page.getByText('Ganancia bruta', { exact: true })).toBeVisible()

    const productInput = page.getByLabel('Buscar producto', { exact: true })

    await productInput.click()

    const options = page.getByRole('option')

    await expect(options.nth(1)).toBeVisible()

    const optionTexts = await options.allTextContents()

    expect(optionTexts.some(text => text.includes('0 disponibles'))).toBe(false)
    await options.first().click()
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    await productInput.click()
    await expect(options.nth(1)).toBeVisible()
    await options.nth(1).click()
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()

    const removeButtons = page.getByRole('button', { name: /^Quitar / })

    await expect(removeButtons).toHaveCount(2)
    await removeButtons.first().click()
    await expect(removeButtons).toHaveCount(1)
    await removeButtons.first().click()
    await expect(removeButtons).toHaveCount(0)
    await expect(page.getByTestId('pos-checkout')).toBeVisible()
    await expect(page.getByTestId('pos-checkout')).toContainText('$0')
    expect(pageErrors).toEqual([])
  })

  test(`Coach y configuración de Kiosco son administrables en ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/usuarios')

    await expect(page.getByRole('heading', { name: 'Usuarios y permisos' })).toBeVisible()
    await expect(page.getByText('Configuración de Kiosco', { exact: true })).toBeVisible()
    await expect(page.getByText(/configuración ausente o con error se interpreta como deshabilitada/i)).toBeVisible()

    await page.getByRole('button', { name: 'Nuevo usuario' }).click()

    const dialog = page.getByRole('dialog', { name: 'Nuevo usuario' })

    await dialog.getByLabel('Perfil').click()
    await page.getByRole('option', { name: 'Coach', exact: true }).click()
    await expect(dialog.getByText(/Coach inicia sin permisos/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
  })
}
