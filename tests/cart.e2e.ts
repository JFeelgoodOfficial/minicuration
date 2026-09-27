import { test, expect } from '@playwright/test'

// The cart: adding cards from a product page, the bundle discount shown in
// cart.html, and the hand-off to /api/checkout (stubbed here — the static test
// server has no functions, and the real endpoint is covered in
// checkout.check.ts).

test.describe('Cart', () => {
  test('an unlimited card page adds to the cart and the nav counts it', async ({ page }) => {
    await page.goto('/shop/moonsail.html')
    // On pre-order: $4.50 against the $6 it returns to.
    await expect(page.locator('.product-price')).toContainText('$4.50')
    await expect(page.locator('.product-price s.price-was')).toContainText('$6')
    await page.locator('[data-add-to-cart="moonsail"]').click()
    await page.locator('[data-add-to-cart="moonsail"]').click()
    await expect(page.locator('.nav-cart [data-cart-count]')).toHaveText('(2)')
    await expect(page.locator('[data-add-to-cart="moonsail"]')).toContainText('2 in cart')
  })

  test('a limited card goes in once, then its button leads to the cart', async ({ page }) => {
    await page.goto('/shop/pride.html')
    const add = page.locator('[data-add-to-cart="pride"]')
    await expect(add).toContainText('Pre-order — $7.50')
    await add.click()
    await expect(page.locator('.nav-cart [data-cart-count]')).toHaveText('(1)')
    await add.click()
    await expect(page).toHaveURL(/\/cart(\.html)?$/)
    await expect(page.locator('.cart-line')).toHaveCount(1)
    await expect(page.locator('.cart-qty-fixed')).toBeVisible()
  })

  test('ten unlimited cards on pre-order cost $37.50 plus a $2 letter', async ({ page }) => {
    await page.goto('/cart.html')
    await page.evaluate(() => localStorage.setItem('mc-cart', JSON.stringify({ moonsail: 4, reach: 6 })))
    await page.reload()
    // $4.50 each, then the bundle at the pre-order rate.
    await expect(page.locator('[data-subtotal]')).toHaveText('$45')
    await expect(page.locator('[data-discount-row]')).toBeVisible()
    await expect(page.locator('[data-discount]')).toHaveText('−$7.50')
    await expect(page.locator('[data-shipping]')).toHaveText('$2')
    await expect(page.locator('[data-total]')).toHaveText('$39.50')
    await expect(page.locator('[data-ship-note]')).toContainText('Pre-order · ships on or before Nov 1')
    await expect(page.locator('[data-ship-note]')).toContainText('You save $15')
    await expect(page.locator('.cart-line-ships')).toHaveCount(2)

    await page.locator('[data-qty="reach"][data-step="-1"]').click()
    await expect(page.locator('[data-discount-row]')).toBeHidden()
    // Nine cards are $40.50: a letter.
    await expect(page.locator('[data-shipping]')).toHaveText('$2')
    await page.locator('[data-remove="reach"]').click()
    // Four unlimited cards, $18: one letter, $2.
    await expect(page.locator('[data-shipping]')).toHaveText('$2')
    await expect(page.locator('[data-shipping-how]')).toHaveText('(letter mail)')
    await expect(page.locator('[data-bundle-hint]')).toContainText('Add $32 more for free shipping')
    await page.locator('[data-qty="moonsail"][data-step="1"]').click()
    await page.locator('[data-qty="moonsail"][data-step="-1"]').click()
    await expect(page.locator('[data-bundle-hint]')).toContainText('Add 6 more')
  })

  test('checkout posts slugs and quantities only, then the thanks page empties the cart', async ({ page }) => {
    let sent: unknown
    await page.route('**/api/checkout', async route => {
      sent = route.request().postDataJSON()
      // The static test server rewrites /thanks.html to /thanks and drops the
      // query string on the way, so point it at the clean URL directly.
      await route.fulfill({ json: { url: '/thanks?order=cs_test_123' } })
    })
    await page.goto('/cart.html')
    await page.evaluate(() => localStorage.setItem('mc-cart', JSON.stringify({ moonsail: 2, lush: 1 })))
    await page.reload()
    await page.locator('[data-checkout]').click()
    await expect(page).toHaveURL(/\/thanks\?order=cs_test_123/)
    expect(sent).toEqual({ items: [{ slug: 'moonsail', qty: 2 }, { slug: 'lush', qty: 1 }] })
    await expect.poll(() => page.evaluate(() => localStorage.getItem('mc-cart'))).toBe('{}')
  })

  test('the thanks page is generic and suggests four cards from the catalog', async ({ page }) => {
    await page.goto('/thanks?order=cs_test_123')
    await expect(page.locator('h1')).toHaveText('Thank you for your order.')
    const cards = page.locator('#more-cards .cross-card')
    await expect(cards).toHaveCount(4)
    await expect(cards.first()).toHaveAttribute('href', /^\/shop\/[a-z0-9-]+\.html$/)
    await expect(cards.first()).toContainText(/(Limited edition|Unlimited) · \$\d+(\.\d\d)?/)
  })

  test('an original design goes in the cart with other cards and ships as one order', async ({ page }) => {
    await page.goto('/shop.html')
    await page.locator('[data-add-to-cart="veritas"]').click()
    await page.locator('[data-add-to-cart="sweet-dreams"]').click()
    await page.goto('/cart.html')
    await expect(page.locator('.cart-line')).toHaveCount(2)
    // $10 + $8, one tracked package; the originals are in stock, not on pre-order.
    await expect(page.locator('[data-subtotal]')).toHaveText('$18')
    await expect(page.locator('[data-shipping]')).toHaveText('$7')
    await expect(page.locator('[data-total]')).toHaveText('$25')
    await expect(page.locator('.cart-line-ships')).toHaveCount(0)
    await expect(page.locator('[data-ship-note]')).toHaveText('Ships in 5–7 days.')
  })

  test('a pre-order card page says so, and a mixed cart says what ships when', async ({ page }) => {
    await page.goto('/shop/pride.html')
    await expect(page.locator('.tag.is-preorder')).toContainText('Pre-order · ships on or before Nov 1')
    await expect(page.locator('.product-price')).toContainText('$7.50')
    await expect(page.locator('.product-price s.price-was')).toContainText('$10')
    await expect(page.locator('.trust-row')).toContainText('Ships on or before Nov 1')
    await expect(page.locator('.edition-table')).toContainText('Pre-order — ships on or before Nov 1')
    await expect(page.locator('.faq-q').first()).toHaveText('When does it ship?')
    await page.locator('[data-add-to-cart="pride"]').click()
    await page.goto('/shop/veritas.html')
    await page.locator('[data-add-to-cart="veritas"]').click()
    await page.goto('/cart.html')
    await expect(page.locator('.cart-line')).toHaveCount(2)
    await expect(page.locator('.cart-line', { hasText: 'Pride' })).toContainText('Pre-order')
    await expect(page.locator('.cart-line', { hasText: 'Pride' }).locator('.cart-line-ships')).toHaveText('Ships on or before Nov 1')
    await expect(page.locator('.cart-line', { hasText: 'Veritas' }).locator('.cart-line-ships')).toHaveCount(0)
    await expect(page.locator('[data-subtotal]')).toHaveText('$17.50')
    await expect(page.locator('[data-ship-note]')).toContainText('In-stock cards ship within 5–7 business days; pre-order cards ship on or before Nov 1 in a second package')
  })

  test('the thanks page reports the purchase once, with its value, then empties the cart', async ({ page }) => {
    await page.goto('/cart.html')
    await page.evaluate(() => localStorage.setItem('mc-cart', JSON.stringify({ moonsail: 2, lush: 1 })))
    await page.goto('/thanks?order=cs_test_456')
    const purchases = () => page.evaluate(() =>
      (window as unknown as { dataLayer: Record<string, unknown>[] }).dataLayer.filter(e => e.event === 'purchase'))
    // $9 + $7.50 on pre-order, $7 tracked shipping.
    await expect.poll(purchases).toEqual([{ event: 'purchase', transaction_id: 'cs_test_456', value: 23.5, currency: 'USD', items: 3 }])
    await page.reload()
    await expect.poll(purchases).toEqual([])
  })

  test('a card that sold out at checkout is taken out of the cart with a note', async ({ page }) => {
    await page.route('**/api/checkout', route =>
      route.fulfill({ status: 409, json: { error: 'sold_out', slugs: ['lush'] } }))
    await page.goto('/cart.html')
    await page.evaluate(() => localStorage.setItem('mc-cart', JSON.stringify({ moonsail: 1, lush: 1 })))
    await page.reload()
    await page.locator('[data-checkout]').click()
    await expect(page.locator('[data-cart-status]')).toContainText('Lush has just sold out')
    await expect(page.locator('.cart-line')).toHaveCount(1)
  })

  test('the add-on checkboxes add a $4 case and a $1 stand with the card', async ({ page }) => {
    await page.goto('/shop/moonsail.html')
    await page.locator('[data-addon-for="moonsail"][value="acrylic-case"]').check()
    await page.locator('[data-addon-for="moonsail"][value="acrylic-stand"]').check()
    await page.locator('[data-add-to-cart="moonsail"]').click()
    await expect(page.locator('[data-addon-for="moonsail"]:checked')).toHaveCount(0)
    await page.goto('/cart.html')
    await expect(page.locator('.cart-line')).toHaveCount(3)
    await expect(page.locator('.cart-line').nth(1)).toContainText('Magnetic Acrylic Case')
    await expect(page.locator('.cart-line').nth(2)).toContainText('Acrylic Stand')
    // $4.50 on pre-order + $4 + $1; the add-ons are not discounted.
    await expect(page.locator('[data-subtotal]')).toHaveText('$9.50')
    // The case makes it a tracked package.
    await expect(page.locator('[data-shipping]')).toHaveText('$7')
    await expect(page.locator('[data-shipping-how]')).toHaveText('(tracked)')
    await expect(page.locator('.cart-upsell')).toHaveCount(0)
  })

  test('limited pages offer no add-ons (they come with a case and stand)', async ({ page }) => {
    await page.goto('/shop/pride.html')
    await expect(page.locator('[data-addon-for]')).toHaveCount(0)
    await expect(page.locator('.edition-table')).toContainText('Acrylic display stand included')
  })

  test('cases stay capped at one per unlimited card', async ({ page }) => {
    await page.goto('/cart.html')
    await page.evaluate(() => localStorage.setItem('mc-cart', JSON.stringify({ moonsail: 2, reach: 1 })))
    await page.reload()
    const addCase = page.locator('[data-add-addon="acrylic-case"]')
    await addCase.click()
    await addCase.click()
    await addCase.click()
    await expect(addCase).toHaveCount(0)
    await expect(page.locator('[data-add-addon="acrylic-stand"]')).toHaveCount(1)
    await expect(page.locator('[data-qty="acrylic-case"][data-step="1"]')).toBeDisabled()
    await page.locator('[data-remove="moonsail"]').click()
    await expect(page.locator('.cart-line', { hasText: 'Acrylic Case' }).locator('.cart-qty span')).toHaveText('1')
  })
})
