import { test, expect } from '@playwright/test'

// Tests run against dreamfall.html as the canonical product page shape.
// All 14 product pages share the same HTML template, so failures here
// signal a structural regression that likely affects the whole catalog.

const PRODUCT_URL = '/shop/dreamfall.html'

test.describe(`Product page — ${PRODUCT_URL}`, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PRODUCT_URL)
  })

  test('product title (H1) is visible', async ({ page }) => {
    const h1 = page.locator('.product-info h1')
    await expect(h1).toBeVisible()
    const text = await h1.textContent()
    expect(text?.trim().length, 'H1 is empty').toBeGreaterThan(0)
  })

  test('Buy Now button links to a real Stripe URL', async ({ page }) => {
    const buyBtn = page.locator('a.btn-buy')
    await expect(buyBtn).toBeVisible()
    const href = await buyBtn.getAttribute('href')
    expect(
      href,
      `btn-buy href="${href}" must start with https://buy.stripe.com/`,
    ).toMatch(/^https:\/\/buy\.stripe\.com\//)
  })

  test('artist statement copy is present and non-empty', async ({ page }) => {
    // .product-quote holds the artist's italic statement on every product page.
    const quote = page.locator('.product-quote')
    await expect(quote).toBeVisible()
    const text = await quote.textContent()
    expect(text?.trim().length, '.product-quote is empty').toBeGreaterThan(0)
  })

  test('medium and edition text is visible', async ({ page }) => {
    // .product-medium: e.g. "Acrylic, Spray Paint, Ink on Canvas"
    const medium = page.locator('.product-medium')
    await expect(medium).toBeVisible()
    const mediumText = await medium.textContent()
    expect(mediumText?.trim().length, '.product-medium is empty').toBeGreaterThan(0)

    // Edition info is inside .product-details li items.
    const detailItems = page.locator('.product-details li')
    const count = await detailItems.count()
    expect(count, 'No edition detail items found').toBeGreaterThan(0)
  })

  test('flip card works on mobile touch', async ({ page, isMobile }) => {
    if (!isMobile) test.skip()

    // Product pages use #cardFlipper (img-flip-inner) toggled by toggleFlip().
    // Tapping the .flip-btn button adds the "flipped" class to #cardFlipper,
    // which drives the CSS rotateY(180deg) transition to reveal the back face.
    const flipBtn = page.locator('.flip-btn')
    await expect(flipBtn).toBeVisible()
    await flipBtn.tap()

    const cardFlipper = page.locator('#cardFlipper')
    await expect(cardFlipper).toHaveClass(/flipped/)
  })
})
