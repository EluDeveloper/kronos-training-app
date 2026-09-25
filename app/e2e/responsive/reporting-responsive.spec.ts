import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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
test.skip(!hasAuthState, 'Ejecuta npm run test:e2e:auth y completa el login manual en el emulador local.')

for (const viewport of viewports) {
  test(`Reporte de Tienda concilia KPI → cobros → registro en ${viewport.width}px`, async ({ page }) => {
    const pageErrors: string[] = []

    await page.setViewportSize(viewport)
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto('/reportes?qaFixture=store')

    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /Fixture QA sintética en memoria/ })).toBeVisible()
    await expect(page.getByText('$120', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Ver detalle de Cobrado' }).click()
    await expect(page).toHaveURL(/metric=collected/)
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/)
    await expect(page.locator('#report-detail tbody tr')).toHaveCount(4)
    await expect(page.locator('#report-detail')).toContainText('Transferencia')

    await page.getByRole('button', { name: /Ver registro qa-store-sale-001/ }).first().click()

    const dialog = page.getByRole('dialog')

    await expect(dialog).toContainText('Registro auditable de Tienda')
    await expect(dialog).toContainText('qa-payment-cash')
    await expect(dialog).toContainText('Efectivo')
    await expect(dialog).not.toContainText('customerName')
    await expect(dialog).not.toContainText('visitante')
    expect(pageErrors).toEqual([])
  })

  test(`Atletas y mensualidades recorren registro auditable en ${viewport.width}px`, async ({ page }) => {
    const pageErrors: string[] = []

    await page.setViewportSize(viewport)
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto('/reportes?qaFixture=athletes-memberships')

    await expect(page.getByRole('heading', { name: 'Atletas' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mensualidades' })).toBeVisible()
    await page.getByRole('button', { name: /Ver evento de qa-athlete-001/ }).first().click()
    await expect(page.getByRole('dialog')).toContainText('Evento auditable de atleta')
    await page.getByRole('button', { name: 'Cerrar' }).click()
    await page.getByRole('button', { name: /Ver mensualidad 2026-10/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Saldo al corte')
    await expect(page.getByRole('dialog')).not.toContainText('phone')
    expect(pageErrors).toEqual([])
  })

  test(`Inventario y personal concilian KPI → registro en ${viewport.width}px`, async ({ page }) => {
    const pageErrors: string[] = []

    await page.setViewportSize(viewport)
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto('/reportes?qaFixture=inventory-workforce')

    await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Personal' })).toBeVisible()
    await expect(page.getByText('-$30', { exact: true })).toBeVisible()
    await expect(page.getByText('$200', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Ver detalle de Faltante cubierto' }).click()
    await page.getByRole('button', { name: 'Ver resolución qa-resolution-covered' }).click()
    await expect(page.getByRole('dialog')).toContainText('Faltante cubierto')
    await expect(page.getByRole('dialog')).toContainText('Efectivo')
    await page.getByRole('button', { name: 'Cerrar' }).click()
    await page.getByRole('button', { name: 'Ver detalle de Pendiente' }).click()
    await page.getByRole('button', { name: 'Ver línea qa-work-pending de Entrenadora QA' }).click()
    await expect(page.getByRole('dialog')).toContainText('Sin liquidar')
    await expect(page.getByRole('dialog')).not.toContainText(/phone|reference|createdBy/i)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    expect(pageErrors).toEqual([])
  })

  test(`Finanzas y conciliación separan conceptos y llegan al origen en ${viewport.width}px`, async ({ page }) => {
    const pageErrors: string[] = []

    await page.setViewportSize(viewport)
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto('/reportes?qaFixture=finance')

    await expect(page.getByRole('heading', { name: 'Finanzas' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Conciliación' })).toBeVisible()
    await expect(page.getByText('$120', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('$230', { exact: true })).toBeVisible()
    await expect(page.getByText('-$5', { exact: true }).last()).toBeVisible()
    await page.getByRole('button', { name: 'Ver detalle de Egresos pagados' }).click()
    await expect(page.locator('#finance-report-detail')).toContainText('qa-finance-expense')
    await page.getByRole('link', { name: 'Abrir egreso qa-finance-expense' }).click()
    await expect(page).toHaveURL(/\/egresos/)
    await page.goBack()
    await expect(page).toHaveURL(/qaFixture=finance/)
    await expect(page.getByRole('heading', { name: 'Finanzas' })).toBeVisible()

    const requestsBeforeExport = await page.evaluate(() => performance.getEntriesByType('resource').length)
    const downloadPromise = page.waitForEvent('download')

    await page.getByRole('button', { name: 'Exportar CSV' }).click()

    const download = await downloadPromise
    const downloadPath = await download.path()
    const csv = await readFile(downloadPath!, 'utf8')

    expect(download.suggestedFilename()).toBe('kronos-reportes_2026-12-01_2026-12-31.csv')
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv).toContain('Finanzas,recognizedStoreRevenue')
    expect(csv).toContain('Conciliación,cashVariance')
    expect(csv).not.toMatch(/phone|health|receipt|registeredBy|closedBy|notes|description/i)
    expect(await page.evaluate(() => performance.getEntriesByType('resource').length)).toBe(requestsBeforeExport)
    await expect(page.getByRole('status').filter({ hasText: /CSV creado con/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    expect(pageErrors).toEqual([])
  })
}
