import { expect, test } from '@playwright/test'

for (const width of [320, 768, 1024, 1440]) {
  test(`panel sintético: estados, foco y sin desbordes en ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = []
    const external: string[] = []

    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type()))
        errors.push(message.text())
    })
    await page.route('**/*', route => {
      const host = new URL(route.request().url()).hostname
      if (!['127.0.0.1', 'localhost'].includes(host)) {
        external.push(host)

        return route.abort()
      }

      return route.continue()
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/e2e/fixtures/payment-notifications.html')

    const opener = page.getByRole('button', { name: 'Abrir notificaciones de QA' })
    const dialog = page.getByRole('dialog', { name: 'Notificaciones del atleta' })

    await opener.click()
    await expect(dialog.getByRole('listitem')).toHaveCount(20)
    await expect(dialog.getByText('Atleta sintético con nombre largo para comprobar el ajuste en pantallas pequeñas')).toBeInViewport()
    await expect(dialog.getByText('Últimas 20 notificaciones del atleta, no sólo del pago seleccionado.')).toBeInViewport()
    await expect(dialog.getByText('Aceptado', { exact: true }).first()).toBeVisible()

    const contrastTargets = [
      { name: 'Cerrar', locator: dialog.getByRole('button', { name: 'Cerrar', exact: true }) },
      { name: 'Folio', locator: dialog.getByText('Folio:', { exact: false }).first() },
    ]

    for (const target of contrastTargets) {
      const contrast = await target.locator.evaluate(button => {
        const rgba = (value: string) => value.match(/[\d.]+/g)!.map(Number)

        const composite = (foreground: number[], background: number[], opacity = 1) => {
          const alpha = (foreground[3] ?? 1) * opacity

          return foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha))
        }

        const luminance = (rgb: number[]) => rgb.map(channel => {
          const value = channel / 255

          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
        }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)

        let background = rgba(getComputedStyle(button.closest('.v-card')!).backgroundColor)

        background = composite(rgba(getComputedStyle(button).backgroundColor), background)
        for (const layer of button.querySelectorAll('.v-btn__underlay, .v-btn__overlay')) {
          const style = getComputedStyle(layer)

          background = composite(rgba(style.backgroundColor), background, Number(style.opacity))
        }
        const label = button.querySelector('.v-btn__content') ?? button
        const foreground = composite(rgba(getComputedStyle(label).color), background)
        const light = Math.max(luminance(foreground), luminance(background))
        const dark = Math.min(luminance(foreground), luminance(background))

        return (light + 0.05) / (dark + 0.05)
      })

      expect(contrast, `${target.name} debe alcanzar contraste AA de texto normal`).toBeGreaterThanOrEqual(4.5)
    }
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`panel-${width}.png`), animations: 'disabled' })
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()

    const scenarios = [
      ['loading', 'Cargando notificaciones…'],
      ['empty', 'Sin notificaciones disponibles para este atleta. Esto no indica un fallo de pago.'],
      ['error', /No fue posible consultar las notificaciones/],
      ['forbidden', 'Ya no tienes permiso para consultar estas notificaciones.'],
    ] as const

    for (const [value, label] of scenarios) {
      await page.getByLabel('Escenario de QA').selectOption(value)
      await opener.click()
      await expect(dialog.getByText(label)).toBeVisible()
      await expect(dialog.getByRole('listitem')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath(`${value}-${width}.png`), animations: 'disabled' })
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
      await expect(opener).toBeFocused()
    }
    expect(errors).toEqual([])
    expect(external).toEqual([])
  })
}
