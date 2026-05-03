import { test, expect } from '@playwright/test'

test.describe('Homepage — /', () => {
  test('page title contains "Minicuration"', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Minicuration/i)
  })

  test('hero/collection images load without broken src', async ({ page }) => {
    await page.goto('/')
    const images = page.locator('img')
    const count = await images.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const img = images.nth(i)
      const src = await img.getAttribute('src')
      expect(src, `img[${i}] has empty or missing src`).toBeTruthy()

      // naturalWidth > 0 means the browser successfully decoded the image.
      const loaded = await img.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
      )
      expect(loaded, `img[${i}] with src="${src}" failed to load`).toBe(true)
    }
  })

  test('at least one flip card is visible in the DOM', async ({ page }) => {
    await page.goto('/')
    // Homepage hero uses .flip-wrap for the 3D card flip components.
    const flipCards = page.locator('.flip-wrap')
    await expect(flipCards.first()).toBeVisible()
    const count = await flipCards.count()
    expect(count, 'Expected at least one flip card on the homepage').toBeGreaterThan(0)
  })

  test('zero console errors on load', async ({ page }) => {
    // Listener must be registered before navigation to catch all errors.
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', err => errors.push(err.message))

    await page.goto('/')
    // Allow async resources to settle.
    await page.waitForLoadState('networkidle')

    expect(errors, `Console errors on load:\n${errors.join('\n')}`).toHaveLength(0)
  })
})
