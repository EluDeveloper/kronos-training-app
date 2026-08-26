import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const authStatePath = resolve('.playwright/auth/user.json')
const hasAuthState = existsSync(authStatePath)

const viewports = [
  { name: 'mobile-small', width: 320, height: 720 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1024, height: 900 },
  { name: 'desktop-wide', width: 1440, height: 1000 },
]

test.use({ storageState: hasAuthState ? authStatePath : { cookies: [], origins: [] } })
test.skip(!hasAuthState, 'Ejecuta npm run test:e2e:auth y completa el login manual antes del QA protegido.')

for (const viewport of viewports) {
  test(`formulario de atleta conserva navegación y responsive en ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/atletas')

    await expect(page.getByRole('heading', { name: 'Atletas' })).toBeVisible()
    await page.getByRole('button', { name: 'Nuevo atleta' }).click()

    const dialog = page.getByRole('dialog', { name: 'Nuevo atleta' })
    const personalTab = dialog.getByRole('tab', { name: 'Datos personales' })
    const membershipTab = dialog.getByRole('tab', { name: 'Membresía' })
    const intakeTab = dialog.getByRole('tab', { name: 'Admisión' })
    const nameInput = dialog.getByLabel('Nombre completo')

    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('tab')).toHaveCount(3)
    await expect(personalTab).toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)

    await nameInput.fill('QA responsive sin guardar')
    await membershipTab.click()
    await expect(dialog.getByLabel('Buscar plan')).toBeVisible()
    await personalTab.click()
    await expect(nameInput).toHaveValue('QA responsive sin guardar')

    if (viewport.width === 320 || viewport.width === 1440)
      await expect(dialog).toHaveScreenshot(`athlete-form-initial-${viewport.name}.png`, { animations: 'disabled' })

    await nameInput.fill('')
    await intakeTab.click()
    await expect(dialog.getByRole('heading', { name: 'Datos de admisión' })).toBeVisible()
    if (viewport.width === 320 || viewport.width === 1440)
      await expect(dialog).toHaveScreenshot(`athlete-form-intake-${viewport.name}.png`, { animations: 'disabled' })

    await dialog.getByRole('button', { name: 'Guardar' }).click()

    await expect(personalTab).toHaveAttribute('aria-selected', 'true')
    await expect(personalTab).toHaveAccessibleName(/Datos personales, 2 errores/)
    await expect(nameInput).toBeFocused()
    if (viewport.width === 320 || viewport.width === 1440)
      await expect(dialog).toHaveScreenshot(`athlete-form-validation-${viewport.name}.png`, { animations: 'disabled' })
  })
}
