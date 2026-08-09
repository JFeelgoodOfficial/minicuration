import { test, expect } from '@playwright/test'

// Pack & ship groups a six-pack into one order card and one buyer email, so
// grouping and email wording are load-bearing: a regression either splits a
// bundle back into six emails or mangles the numbers a buyer is promised.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { groupPendingByOrder, buildShippedEmail, parseShipItems } = require('../api/ship.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EDITION_STATUSES, PRODUCT_NAMES } = require('../api/_lib.js')

const ALL_SLUGS = [
  'dreamfall',
  'dream-mountain',
  'sky-miles',
  'a-simple-meditation',
  'veritas',
  'sweet-dreams',
]

function saleRow(overrides: Record<string, unknown>) {
  return {
    id: 'row-1',
    order_number: 'MC-AAAA0001',
    slug: 'dreamfall',
    edition_number: 7,
    buyer_name: 'Ada',
    buyer_email: 'ada@example.com',
    created_at: '2026-08-01T12:00:00Z',
    ...overrides,
  }
}

test.describe('ship — grouping pending sales into orders', () => {
  test('six rows sharing an order number become one bundle order with six items', () => {
    const rows = ALL_SLUGS.map((slug, i) =>
      saleRow({ id: `row-${i}`, slug, edition_number: i + 1 }))
    const orders = groupPendingByOrder(rows)
    expect(orders).toHaveLength(1)
    expect(orders[0].isBundle).toBe(true)
    expect(orders[0].items).toHaveLength(6)
    expect(orders[0].items.map((i: { slug: string }) => i.slug)).toEqual(ALL_SLUGS)
    expect(orders[0].items[0].productName).toBe('Dreamfall')
    expect(orders[0].items[0].suggestedEdition).toBe(1)
  })

  test('rows from different orders do not merge', () => {
    const orders = groupPendingByOrder([
      saleRow({ id: 'a', order_number: 'MC-AAAA0001' }),
      saleRow({ id: 'b', order_number: 'MC-BBBB0002', slug: 'veritas' }),
    ])
    expect(orders).toHaveLength(2)
    expect(orders[0].isBundle).toBe(false)
    expect(orders[1].isBundle).toBe(false)
  })

  test('a single-print order stays a single-item, non-bundle order', () => {
    const orders = groupPendingByOrder([saleRow({})])
    expect(orders).toHaveLength(1)
    expect(orders[0].isBundle).toBe(false)
    expect(orders[0].items).toHaveLength(1)
    expect(orders[0].buyerName).toBe('Ada')
    expect(orders[0].buyerEmail).toBe('ada@example.com')
  })

  test('newest-first row order is preserved', () => {
    const orders = groupPendingByOrder([
      saleRow({ id: 'new', order_number: 'MC-NEW00001' }),
      saleRow({ id: 'old', order_number: 'MC-OLD00001' }),
    ])
    expect(orders.map((o: { orderNumber: string }) => o.orderNumber))
      .toEqual(['MC-NEW00001', 'MC-OLD00001'])
  })
})

test.describe('ship — buyer email', () => {
  test('a single print keeps the established wording', () => {
    const mail = buildShippedEmail('MC-AAAA0001',
      [{ productName: 'Dreamfall', editionNumber: 7 }], 'Ada')
    expect(mail.subject).toBe('Order MC-AAAA0001 — Dreamfall, edition 7 of 50')
    expect(mail.html).toContain('Ada, your')
    expect(mail.html).toContain('edition <strong>7 of 50</strong>')
    expect(mail.html).toContain('No other collector holds this edition.')
  })

  test('a bundle lists every print with its edition number in one email', () => {
    const items = ALL_SLUGS.map((slug, i) =>
      ({ productName: PRODUCT_NAMES[slug], editionNumber: i + 10 }))
    const mail = buildShippedEmail('MC-AAAA0001', items, 'Ada')
    expect(mail.subject).toBe('Order MC-AAAA0001 — your prints are packed, edition numbers inside')
    for (const item of items) {
      expect(mail.html).toContain(`<strong>${item.productName}</strong>`)
      expect(mail.html).toContain(`edition <strong>${item.editionNumber} of 50</strong>`)
    }
    expect(mail.html).toContain('No other collector holds these editions.')
    expect(mail.html).not.toContain('undefined')
  })

  test('a missing buyer name falls back gracefully', () => {
    const single = buildShippedEmail('MC-X',
      [{ productName: 'Veritas', editionNumber: 1 }], null)
    expect(single.html).toContain('Your print is packed')
    const bundle = buildShippedEmail('MC-X', [
      { productName: 'Veritas', editionNumber: 1 },
      { productName: 'Dreamfall', editionNumber: 2 },
    ], null)
    expect(bundle.html).toContain('Your prints are packed')
    expect(bundle.html).not.toContain('undefined')
  })
})

test.describe('ship — POST body validation', () => {
  test('accepts one item and six items', () => {
    expect(parseShipItems({ items: [{ id: 'a', editionNumber: 5 }] }).ok).toBe(true)
    const six = ALL_SLUGS.map((_, i) => ({ id: `id-${i}`, editionNumber: i + 1 }))
    expect(parseShipItems({ items: six }).ok).toBe(true)
  })

  test('rejects empty, missing, and oversized item lists', () => {
    expect(parseShipItems({}).ok).toBe(false)
    expect(parseShipItems({ items: [] }).ok).toBe(false)
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `id-${i}`, editionNumber: 1 }))
    expect(parseShipItems({ items: seven })).toMatchObject({ ok: false, error: 'too_many_items' })
  })

  test('rejects the same sales row listed twice', () => {
    expect(parseShipItems({ items: [
      { id: 'a', editionNumber: 1 },
      { id: 'a', editionNumber: 2 },
    ] })).toMatchObject({ ok: false, error: 'duplicate_item' })
  })

  test('rejects bad edition numbers anywhere in the list', () => {
    for (const bad of [0, 51, 1.5, 'two', null, undefined]) {
      const result = parseShipItems({ items: [
        { id: 'a', editionNumber: 1 },
        { id: 'b', editionNumber: bad },
      ] })
      expect(result.ok, `${String(bad)} should be rejected`).toBe(false)
    }
  })
})

// The admin grid cycle is available → sold → gifted → relisted → available;
// the API validates statuses against this list and admin.html mirrors it.
test.describe('editions — status list', () => {
  test('the cycle has exactly the four owner statuses in click order', () => {
    expect(EDITION_STATUSES).toEqual(['available', 'sold', 'gifted', 'relisted'])
  })

  test('the catalog covers all six designs', () => {
    expect(Object.keys(PRODUCT_NAMES).sort()).toEqual([...ALL_SLUGS].sort())
  })
})
