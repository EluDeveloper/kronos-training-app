import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'mobile-small', width: 320, height: 720 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1024, height: 900 },
  { name: 'desktop-wide', width: 1440, height: 1000 },
]

test.setTimeout(60_000)

for (const viewport of viewports) {
  test(`login responsive sin overflow en ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`login-${viewport.name}.png`), fullPage: true })
  })
}
