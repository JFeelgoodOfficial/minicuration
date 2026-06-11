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

    // Edition info lives in the Edition Details table rows.
    const detailRows = page.locator('.edition-table tr')
    const count = await detailRows.count()
    expect(count, 'No edition detail rows found').toBeGreaterThan(0)
  })

  test('card artwork and card back images are present', async ({ page }) => {
    // Product pages show the card front and back as static .card-side images
    // (the old #cardFlipper flip interaction was removed in the redesign).
    const sides = page.locator('.card-sides .card-side')
    await expect(sides).toHaveCount(2)

    for (const side of await sides.all()) {
      const src = await side.locator('img').getAttribute('src')
      expect(src, 'card side image has empty or missing src').toBeTruthy()
    }
  })
})
