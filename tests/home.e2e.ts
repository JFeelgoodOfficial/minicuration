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
      const src = await images.nth(i).getAttribute('src')
      expect(src, `img[${i}] has empty or missing src`).toBeTruthy()
    }

    // Below-the-fold images use loading="lazy" and never load without
    // scrolling, so force eager loading and let decode() flag broken srcs.
    const broken = await page.evaluate(async () => {
      const imgs = Array.from(document.images)
      imgs.forEach(img => { img.loading = 'eager' })
      const results = await Promise.allSettled(imgs.map(img => img.decode()))
      return imgs
        .filter((img, i) => results[i].status === 'rejected' || img.naturalWidth === 0)
        .map(img => img.getAttribute('src'))
    })
    expect(broken, `Images failed to load: ${broken.join(', ')}`).toHaveLength(0)
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
