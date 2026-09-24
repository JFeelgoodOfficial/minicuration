import { test, expect } from '@playwright/test'

// The cart: adding cards from a product page, the bundle discount shown in
// cart.html, and the hand-off to /api/checkout (stubbed here — the static test
// server has no functions, and the real endpoint is covered in
// checkout.check.ts).

test.describe('Cart', () => {
  test('an unlimited card page adds to the cart and the nav counts it', async ({ page }) => {
    await page.goto('/shop/moonsail.html')
    await expect(page.locator('.product-price')).toContainText('$6')
    await expect(page.locator('.product-price s.price-was')).toContainText('$15')
    await page.locator('[data-add-to-cart="moonsail"]').click()
    await page.locator('[data-add-to-cart="moonsail"]').click()
    await expect(page.locator('.nav-cart [data-cart-count]')).toHaveText('(2)')
    await expect(page.locator('[data-add-to-cart="moonsail"]')).toContainText('2 in cart')
  })

  test('a limited card goes in once, then its button leads to the cart', async ({ page }) => {
    await page.goto('/shop/pride.html')
    const add = page.locator('[data-add-to-cart="pride"]')
    await expect(add).toContainText('$23')
    await add.click()
    await expect(page.locator('.nav-cart [data-cart-count]')).toHaveText('(1)')
    await add.click()
    await expect(page).toHaveURL(/\/cart(\.html)?$/)
    await expect(page.locator('.cart-line')).toHaveCount(1)
    await expect(page.locator('.cart-qty-fixed')).toBeVisible()
  })

  test('ten unlimited cards cost $50 and ship free', async ({ page }) => {
    await page.goto('/cart.html')
    await page.evaluate(() => localStorage.setItem('mc-cart', JSON.stringify({ moonsail: 4, reach: 6 })))
    await page.reload()
    await expect(page.locator('[data-subtotal]')).toHaveText('$60')
    await expect(page.locator('[data-discount-row]')).toBeVisible()
    await expect(page.locator('[data-discount]')).toHaveText('−$10')
    await expect(page.locator('[data-shipping]')).toHaveText('Free')
    await expect(page.locator('[data-total]')).toHaveText('$50')

    await page.locator('[data-qty="reach"][data-step="-1"]').click()
    await expect(page.locator('[data-discount-row]')).toBeHidden()
    await expect(page.locator('[data-shipping]')).toHaveText('$9')
    await expect(page.locator('[data-bundle-hint]')).toContainText('Add 1 more')
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
})
