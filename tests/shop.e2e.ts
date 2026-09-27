import { test, expect } from '@playwright/test'

// The Sentiments card currently has href="shop/sentiments.html" instead of
// a real Stripe URL. The "all buy buttons → Stripe" assertion below will
// catch that regression (and any future href="#" regressions too).

test.describe('Shop catalog — /shop.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shop.html')
  })

  test('both collections are present: 16 limited, 15 unlimited', async ({ page }) => {
    await expect(page.locator('.shop-card')).toHaveCount(31)
    await expect(page.locator('#limited .shop-card')).toHaveCount(16)
    await expect(page.locator('#unlimited .shop-card')).toHaveCount(15)
  })

  test('no Buy Now button has href="#"', async ({ page }) => {
    // href="#" is an explicit dead-link regression guard.
    const deadLinks = page.locator('a.btn-buy[href="#"]')
    await expect(deadLinks).toHaveCount(0)
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

  test('every card, the original six included, has an add-to-cart button and none a link', async ({ page }) => {
    const cards = page.locator('.shop-card')
    await expect(cards).toHaveCount(31)
    await expect(cards.locator('button[data-add-to-cart]')).toHaveCount(31)
    await expect(page.locator('a.btn-buy')).toHaveCount(0)
  })

  test('pricing: the originals $10 against $23 (Sweet Dreams aside); pre-order limited $7.50 against $10; unlimited $4.50 against $6', async ({ page }) => {
    for (const price of await page.locator('#unlimited .card-price').all()) {
      await expect(price).toContainText('$4.50')
      await expect(price.locator('s.price-was')).toContainText('$6')
    }
    const originals = page.locator('#limited .shop-card:not([data-preorder]):not([data-slug="sweet-dreams"]) .card-price')
    await expect(originals).toHaveCount(5)
    for (const price of await originals.all()) {
      await expect(price).toContainText('$10')
      await expect(price.locator('s.price-was')).toContainText('$23')
    }
    const newLimited = page.locator('#limited .shop-card[data-preorder] .card-price')
    await expect(newLimited).toHaveCount(10)
    for (const price of await newLimited.all()) {
      await expect(price).toContainText('$7.50')
      await expect(price.locator('s.price-was')).toContainText('$10')
    }
  })

  test('every card but the original six is badged Pre-order, and the Pre-order filter shows just those', async ({ page }) => {
    await expect(page.locator('.preorder-notice')).toContainText('pre-order at 25% off')
    await expect(page.locator('.shop-card[data-preorder]')).toHaveCount(25)
    await expect(page.locator('.shop-card .card-preorder')).toHaveCount(25)
    for (const slug of ['dreamfall', 'dream-mountain', 'sky-miles', 'a-simple-meditation', 'veritas', 'sweet-dreams']) {
      await expect(page.locator(`.shop-card[data-slug="${slug}"] .card-preorder`)).toHaveCount(0)
      await expect(page.locator(`.shop-card[data-slug="${slug}"] [data-add-to-cart]`)).toContainText('Add to cart')
    }
    await expect(page.locator('.shop-card[data-slug="pride"] [data-add-to-cart]')).toHaveText('Pre-order — $7.50')
    await expect(page.locator('.shop-card[data-slug="pride"] .card-trust')).toContainText('Ships on or before Nov 1')
    await page.getByRole('button', { name: 'Pre-order', exact: true }).click()
    await expect(page.locator('.shop-card:visible')).toHaveCount(25)
    await expect(page.locator('.shop-card[data-slug="veritas"]')).toBeHidden()
  })

  test('Flip turns the card over without leaving the shop; clicking the picture opens its page', async ({ page }) => {
    const card = page.locator('.shop-card[data-slug="moonsail"]')
    await card.scrollIntoViewIfNeeded()
    await card.locator('.flip-toggle').click()
    await expect(card.locator('.sc-spin-3d')).toHaveClass(/show-back/)
    await expect(page).toHaveURL(/\/shop(\.html)?(#.*)?$/)
    // The card spins on hover, so it never settles for Playwright's stability check.
    await card.locator('.sc-spin-wrap').click({ force: true })
    await expect(page).toHaveURL(/\/shop\/moonsail(\.html)?$/)
  })

  test('Add to cart on the shop grid adds without leaving the page', async ({ page }) => {
    const card = page.locator('.shop-card[data-slug="moonsail"]')
    await card.scrollIntoViewIfNeeded()
    await card.locator('[data-add-to-cart]').click()
    await expect(page.locator('.nav-cart [data-cart-count]')).toHaveText('(1)')
    await expect(page).toHaveURL(/\/shop(\.html)?(#.*)?$/)
  })

  test('wide paintings are landscape cards, like Veritas', async ({ page }) => {
    for (const slug of ['veritas', 'permission', 'summer-field']) {
      await expect(page.locator(`.shop-card[data-slug="${slug}"] .sc-spin-wrap`)).toHaveClass(/landscape/)
    }
    await expect(page.locator('.shop-card[data-slug="moonsail"] .sc-spin-wrap')).not.toHaveClass(/landscape/)
  })

  test('the Unlimited filter shows only the unlimited collection', async ({ page }) => {
    await page.getByRole('button', { name: /^Unlimited/ }).click()
    await expect(page.locator('#limited')).toBeHidden()
    await expect(page.locator('#unlimited')).toBeVisible()
  })

  test('Sweet Dreams is a plain $8, in the grid and in the cart', async ({ page }) => {
    await expect(page.locator('.shop-card[data-slug="sweet-dreams"] [data-add-to-cart]')).toContainText('$8')
    const sweetDreams = page.locator('.shop-card[data-slug="sweet-dreams"] .card-price')
    await expect(sweetDreams).toContainText('$8')
    await expect(sweetDreams.locator('s.price-was')).toHaveCount(0)
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
