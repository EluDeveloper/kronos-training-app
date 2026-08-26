import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const authStatePath = resolve('.playwright/auth/user.json')

test('captura manualmente una sesión de QA sin almacenar credenciales', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000)

  await page.goto('/atletas')
  await expect(page.getByRole('heading', { name: 'Atletas' })).toBeVisible({ timeout: 4 * 60 * 1000 })
  await mkdir(dirname(authStatePath), { recursive: true })
  await page.context().storageState({ path: authStatePath })
})
