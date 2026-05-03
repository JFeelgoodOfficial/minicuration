import { test, expect } from '@playwright/test'

// The Sentiments card currently has href="shop/sentiments.html" instead of
// a real Stripe URL. The "all buy buttons → Stripe" assertion below will
// catch that regression (and any future href="#" regressions too).

test.describe('Shop catalog — /shop.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shop.html')
  })

  test('all 14 product cards are present in the grid', async ({ page }) => {
    const cards = page.locator('.shop-card')
    await expect(cards).toHaveCount(14)
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
    expect(count, 'Expected 14 buy buttons (one per product)').toBe(14)

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
    const images = page.locator('.cf-front img')
    const count = await images.count()
    expect(count, 'Expected front images on shop cards').toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const img = images.nth(i)
      const src = await img.getAttribute('src')
      expect(src, `cf-front img[${i}] has empty or missing src`).toBeTruthy()

      const loaded = await img.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
      )
      expect(loaded, `cf-front img[${i}] with src="${src}" failed to load`).toBe(true)
    }
  })

  test('flip interaction works on first card (mobile touch)', async ({ page, isMobile }) => {
    if (!isMobile) test.skip()

    // Tap the Flip toggle button on the first card — stopPropagation keeps
    // the card from navigating. The .card-flip-inner should receive class
    // "flipped" which drives the CSS rotateY(180deg) transition.
    const firstCard = page.locator('.shop-card').first()
    const flipBtn = firstCard.locator('.flip-toggle')
    await flipBtn.tap()

    const flipInner = firstCard.locator('.card-flip-inner')
    await expect(flipInner).toHaveClass(/flipped/)
  })
})
