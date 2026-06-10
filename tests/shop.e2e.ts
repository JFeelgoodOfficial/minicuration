import { test, expect } from '@playwright/test'

// The Sentiments card currently has href="shop/sentiments.html" instead of
// a real Stripe URL. The "all buy buttons → Stripe" assertion below will
// catch that regression (and any future href="#" regressions too).

test.describe('Shop catalog — /shop.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shop.html')
  })

  test('all 6 product cards are present in the grid', async ({ page }) => {
    const cards = page.locator('.shop-card')
    await expect(cards).toHaveCount(6)
  })

  test('no Buy Now button has href="#"', async ({ page }) => {
    // href="#" is an explicit dead-link regression guard.
    const deadLinks = page.locator('a.btn-buy[href="#"]')
    await expect(deadLinks).toHaveCount(0)
  })

  test('every Buy Now button links to a real Stripe URL', async ({ page }) => {
    // This catches the Sentiments bug where the href points to a product page
    // instead of https://buy.stripe.com/…
    const buyButtons = page.locator('a.btn-buy')
    const count = await buyButtons.count()
    expect(count, 'Expected 6 buy buttons (one per product)').toBe(6)

    for (let i = 0; i < count; i++) {
      const btn = buyButtons.nth(i)
      const href = await btn.getAttribute('href')
      expect(
        href,
        `Buy button ${i + 1} has href="${href}" — must start with https://buy.stripe.com/`,
      ).toMatch(/^https:\/\/buy\.stripe\.com\//)
    }
  })

  test('all card front images load without broken src', async ({ page }) => {
    // Shop cards render the artwork inside .sc-front (3D spin front face).
    const images = page.locator('.sc-front img')
    const count = await images.count()
    expect(count, 'Expected front images on shop cards').toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const src = await images.nth(i).getAttribute('src')
      expect(src, `sc-front img[${i}] has empty or missing src`).toBeTruthy()
    }

    // Card images use loading="lazy" and never load without scrolling, so
    // force eager loading and let decode() flag broken srcs.
    const broken = await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.sc-front img'))
      imgs.forEach(img => { img.loading = 'eager' })
      const results = await Promise.allSettled(imgs.map(img => img.decode()))
      return imgs
        .filter((img, i) => results[i].status === 'rejected' || img.naturalWidth === 0)
        .map(img => img.getAttribute('src'))
    })
    expect(broken, `Card images failed to load: ${broken.join(', ')}`).toHaveLength(0)
  })

  test('tapping a card opens its product page (mobile touch)', async ({ page, isMobile }) => {
    if (!isMobile) test.skip()

    // Cards navigate to their product page via openModal() → location.href.
    const firstCard = page.locator('.shop-card').first()
    const slug = await firstCard.getAttribute('data-slug')
    await firstCard.locator('.card-flipper').tap()

    // The static server in CI serves clean URLs (strips .html), so accept both.
    await expect(page).toHaveURL(new RegExp(`/shop/${slug}(\\.html)?$`))
  })
})
