import { test, expect } from '@playwright/test'

// All 6 product page slugs — keep in sync with /shop/*.html files.
// Prices reflect the summer sale ($10, regularly $23); Sweet Dreams is $8.
const PRODUCTS: Record<string, string> = {
  'dreamfall': '10.00',
  'dream-mountain': '10.00',
  'sky-miles': '10.00',
  'a-simple-meditation': '10.00',
  'veritas': '10.00',
  'sweet-dreams': '8.00',
}
const PRODUCT_SLUGS = Object.keys(PRODUCTS)

for (const slug of PRODUCT_SLUGS) {
  test.describe(`SEO — /shop/${slug}.html`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/shop/${slug}.html`)
    })

    test('meta description exists and is not empty', async ({ page }) => {
      const metaDesc = page.locator('meta[name="description"]')
      await expect(metaDesc).toHaveCount(1)
      const content = await metaDesc.getAttribute('content')
      expect(content?.trim().length, 'meta[name="description"] is empty').toBeGreaterThan(0)
    })

    test('og:title exists and is not empty', async ({ page }) => {
      const ogTitle = page.locator('meta[property="og:title"]')
      await expect(ogTitle).toHaveCount(1)
      const content = await ogTitle.getAttribute('content')
      expect(content?.trim().length, 'og:title is empty').toBeGreaterThan(0)
    })

    test('og:description exists and is not empty', async ({ page }) => {
      const ogDesc = page.locator('meta[property="og:description"]')
      await expect(ogDesc).toHaveCount(1)
      const content = await ogDesc.getAttribute('content')
      expect(content?.trim().length, 'og:description is empty').toBeGreaterThan(0)
    })

    test('og:image exists and is not empty', async ({ page }) => {
      const ogImage = page.locator('meta[property="og:image"]')
      await expect(ogImage).toHaveCount(1)
      const content = await ogImage.getAttribute('content')
      expect(content?.trim().length, 'og:image is empty').toBeGreaterThan(0)
    })

    test('Product JSON-LD schema block is present', async ({ page }) => {
      // Evaluate in-page to find a ld+json script containing "@type":"Product".
      const hasProductSchema = await page.evaluate(() => {
        const scripts = Array.from(
          document.querySelectorAll('script[type="application/ld+json"]'),
        )
        return scripts.some(s => {
          try {
            const data = JSON.parse(s.textContent || '')
            // Handle both top-level @type and @graph arrays.
            if (data['@type'] === 'Product') return true
            if (Array.isArray(data['@graph'])) {
              return data['@graph'].some((node: { '@type': string }) => node['@type'] === 'Product')
            }
          } catch {
            // Malformed JSON-LD — still report false so the test fails.
          }
          return false
        })
      })
      expect(
        hasProductSchema,
        'No <script type="application/ld+json"> with @type:"Product" found',
      ).toBe(true)
    })

    test('og:price and JSON-LD offer price match the expected price', async ({ page }) => {
      const expected = PRODUCTS[slug]

      const ogPrice = page.locator('meta[property="og:price:amount"]')
      await expect(ogPrice).toHaveCount(1)
      expect(await ogPrice.getAttribute('content')).toBe(expected)

      const jsonLdPrice = await page.evaluate(() => {
        const scripts = Array.from(
          document.querySelectorAll('script[type="application/ld+json"]'),
        )
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent || '')
            const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data]
            for (const node of nodes) {
              if (node['@type'] === 'Product') return node.offers?.price ?? null
            }
          } catch { /* fall through */ }
        }
        return null
      })
      expect(jsonLdPrice, 'JSON-LD Product offers.price').toBe(expected)
    })

    test('page <title> contains "Minicuration"', async ({ page }) => {
      await expect(page).toHaveTitle(/Minicuration/i)
    })

    test('<link rel="canonical"> exists', async ({ page }) => {
      const canonical = page.locator('link[rel="canonical"]')
      await expect(canonical).toHaveCount(1)
      const href = await canonical.getAttribute('href')
      expect(href?.trim().length, 'canonical href is empty').toBeGreaterThan(0)
    })
  })
}
