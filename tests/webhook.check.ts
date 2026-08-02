import { test, expect } from '@playwright/test'

// The webhook decides which editions a checkout consumes. Price IDs change
// every time a product is re-priced (the summer sale created new ones), so
// resolution must also work from the Stripe product name — and a six-pack
// purchase must consume all six editions, not one.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveSlugs, slugFromName } = require('../api/webhook.js')

const ALL_SLUGS = [
  'dreamfall',
  'dream-mountain',
  'sky-miles',
  'a-simple-meditation',
  'veritas',
  'sweet-dreams',
]

test.describe('webhook — product resolution', () => {
  test('resolves a slug from the Stripe product name', () => {
    expect(slugFromName('Dream Mountain — Limited Edition Mini Art Print')).toBe('dream-mountain')
    expect(slugFromName('A Simple Meditation')).toBe('a-simple-meditation')
    // 'Sweet Dreams' must not collide with 'Dreamfall'
    expect(slugFromName('Sweet Dreams')).toBe('sweet-dreams')
    expect(slugFromName('Totally Unknown Print')).toBeNull()
  })

  test('current sale price IDs resolve to their product', () => {
    const CURRENT: Record<string, string> = {
      'price_1U07n72mxhfkNl2YELQTDBFG': 'dreamfall',
      'price_1U07r12mxhfkNl2YYDCWyXNP': 'dream-mountain',
      'price_1U07sJ2mxhfkNl2YQgM1WlS6': 'sky-miles',
      'price_1U07sv2mxhfkNl2YiIr52Kb7': 'a-simple-meditation',
      'price_1U07tq2mxhfkNl2YeiHKsdF9': 'veritas',
      'price_1TzPZE2mxhfkNl2YTUVsFRVh': 'sweet-dreams',
    }
    for (const [priceId, slug] of Object.entries(CURRENT)) {
      expect(resolveSlugs([{ price: { id: priceId } }]), `${slug} price ID`)
        .toEqual({ slugs: [slug], isBundle: false })
    }
  })

  test('superseded price IDs still resolve (in-flight checkouts)', () => {
    expect(resolveSlugs([{ price: { id: 'price_1TYe162mxhfkNl2YfTEeMam4' } }]))
      .toEqual({ slugs: ['dreamfall'], isBundle: false })
    expect(resolveSlugs([{ price: { id: 'price_1TYGcr2mxhfkNl2YAUNVRpw4' } }]))
      .toEqual({ slugs: ['sweet-dreams'], isBundle: false })
  })

  test('the six-pack price ID consumes all six editions', () => {
    const result = resolveSlugs([{ price: { id: 'price_1U07vq2mxhfkNl2Y8cgwskpF' } }])
    expect(result.isBundle).toBe(true)
    expect(result.slugs.sort()).toEqual([...ALL_SLUGS].sort())
  })

  test('a price ID absent from the map resolves via product name', () => {
    // This is the sale case: new $10 prices whose IDs were never hardcoded.
    expect(resolveSlugs([{ price: { id: 'price_unknown', product: { name: 'Veritas' } } }]))
      .toEqual({ slugs: ['veritas'], isBundle: false })
  })

  test('a six-pack consumes all six editions', () => {
    for (const name of ['Six-Pack', 'Six Pack Bundle', 'The Complete Collection', 'All Six Prints']) {
      const result = resolveSlugs([{ description: name }])
      expect(result.isBundle, `${name} should be detected as a bundle`).toBe(true)
      expect(result.slugs.sort()).toEqual([...ALL_SLUGS].sort())
    }
  })

  test('a single print is not treated as a bundle', () => {
    const result = resolveSlugs([{ description: 'Dreamfall' }])
    expect(result.isBundle).toBe(false)
    expect(result.slugs).toEqual(['dreamfall'])
  })

  test('unrecognised checkouts resolve to nothing rather than guessing', () => {
    expect(resolveSlugs([{ description: 'Mystery Box' }]).slugs).toEqual([])
  })
})
