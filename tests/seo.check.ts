import { test, expect } from '@playwright/test'

// All 14 product page slugs — keep in sync with /shop/*.html files.
const PRODUCT_SLUGS = [
  'dreamfall',
  'dream-mountain',
  'sky-miles',
  'pooh',
  'a-simple-meditation',
  'sisters',
  'sentiments',
  'transcend',
  'veritas',
  'serenade',
  'worth-the-trip',
  'vicarious',
  'crowned',
  'sweet-dreams',
]

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
