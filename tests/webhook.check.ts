import { test, expect } from '@playwright/test'

// The webhook decides which editions a checkout consumes. Price IDs change
// every time a product is re-priced (the summer sale created new ones), so
// resolution must also work from the Stripe product name — and a six-pack
// purchase must consume all six editions, not one.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveSlugs, slugFromName, orderNumberFrom, draftEditionEmail } = require('../api/webhook.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PRODUCT_NAMES, EDITION_SIZE } = require('../api/_lib.js')

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

// Order numbers go in the buyer's confirmation and the owner's alert, so they
// have to be stable, unique per checkout, and traceable back to Stripe.
test.describe('webhook — order numbers', () => {
  test('derives a readable order number from the session ID', () => {
    expect(orderNumberFrom('cs_live_a1b2c3d4e5f6')).toBe('MC-C3D4E5F6')
    expect(orderNumberFrom('cs_test_a1b2c3d4e5f6')).toMatch(/^MC-[A-Z0-9]{8}$/)
  })

  test('the same session always yields the same number', () => {
    const id = 'cs_live_b1PmTeSt00000000zzzz'
    expect(orderNumberFrom(id)).toBe(orderNumberFrom(id))
  })

  test('different sessions yield different numbers', () => {
    expect(orderNumberFrom('cs_live_00000000aaaaaaaa'))
      .not.toBe(orderNumberFrom('cs_live_00000000bbbbbbbb'))
  })
})

// There is no admin page any more: the owner tells the buyer their edition
// number by hand, from a draft link in the order email. If that link is
// malformed the buyer never learns the number their print was sold on.
test.describe('webhook — the buyer\'s edition-number draft', () => {
  const session = { customer_details: { name: 'Ada Lovelace', email: 'ada@example.com' } }

  test('addresses the buyer and leaves a blank for the number', () => {
    const url = new URL(draftEditionEmail('MC-AAAA0001', [{ slug: 'sweet-dreams' }], session))
    expect(decodeURIComponent(url.pathname)).toBe('ada@example.com')
    expect(url.searchParams.get('subject')).toContain('MC-AAAA0001')
    expect(url.searchParams.get('subject')).toContain('Sweet Dreams')

    const body = url.searchParams.get('body')
    expect(body).toContain('Ada,')
    expect(body).toContain(`edition ___ of ${EDITION_SIZE}`)
    expect(body).toContain('yours alone')
    expect(body).toContain('MC-AAAA0001')
  })

  test('a six-pack lists every print with its own blank', () => {
    const sold = Object.keys(PRODUCT_NAMES).map(slug => ({ slug }))
    const body = new URL(draftEditionEmail('MC-BUNDLE01', sold, session))
      .searchParams.get('body')
    for (const name of Object.values(PRODUCT_NAMES)) expect(body).toContain(name)
    expect(body.match(/edition ___ of/g)).toHaveLength(6)
    expect(body).toContain('their way')   // plural wording
  })

  test('survives a checkout with no buyer name', () => {
    const anon = { customer_details: { email: 'x@example.com' } }
    const body = new URL(draftEditionEmail('MC-NONAME01', [{ slug: 'veritas' }], anon))
      .searchParams.get('body')
    expect(body).toContain('Hello,')
    expect(body).not.toContain('undefined')
  })
})
