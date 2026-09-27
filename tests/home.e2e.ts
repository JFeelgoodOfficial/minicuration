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

  test('the spotlight arrow swaps the card front and back', async ({ page }) => {
    await page.goto('/')
    const swap = page.locator('[data-swap]').first()
    const btn = swap.locator('.swap-btn')
    await swap.scrollIntoViewIfNeeded()
    await expect(swap).not.toHaveClass(/is-flipped/)
    await btn.click()
    await expect(swap).toHaveClass(/is-flipped/)
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
    await btn.click()
    await expect(swap).not.toHaveClass(/is-flipped/)
  })

  test('clicking the card behind brings it to the front', async ({ page }) => {
    await page.goto('/')
    const swap = page.locator('[data-swap]').first()
    await swap.scrollIntoViewIfNeeded()
    // The back card peeks out above and left of the front one.
    await swap.locator('.swap-back').click({ position: { x: 20, y: 20 } })
    await expect(swap).toHaveClass(/is-flipped/)
  })

  test('the bundle fan rearranges on hover, never the same way twice running, and settles on leave', async ({ page }) => {
    await page.goto('/')
    const fan = page.locator('.bundle-fan')
    await expect(fan.locator('.bundle-card')).toHaveCount(10)
    await fan.scrollIntoViewIfNeeded()
    const seen: (string | null)[] = []
    for (let i = 0; i < 4; i++) {
      await fan.hover()
      seen.push(await fan.getAttribute('data-mode'))
      await page.mouse.move(0, 0)
      await expect(fan).not.toHaveAttribute('data-mode')
    }
    for (const mode of seen) expect(['spread', 'scatter', 'grid']).toContain(mode)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  })

  test('the limited-edition row lists every limited card', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#limited-editions .ltd-item')).toHaveCount(16)
    await expect(page.locator('#limited-editions .ltd-item').first()).toHaveAttribute('href', 'shop/dreamfall.html')
  })
})
