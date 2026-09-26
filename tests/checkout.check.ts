import { test, expect } from '@playwright/test'

// /api/checkout prices the cart on the server. The browser only says which
// cards and how many, so these pin down that the prices, the "$10 off every 10
// unlimited cards" bundle and shipping all come from api/_catalog.js, and that
// a sold-out limited card is refused before anyone pays for it.
//
/* eslint-disable @typescript-eslint/no-var-requires */
const STORE = require.resolve('../api/_store.js')
const STRIPE = require.resolve('stripe')
const CHECKOUT = require.resolve('../api/checkout.js')
const { quote, CARDS } = require('../api/_catalog.js')

type Call = { kind: string; args: Record<string, unknown> }
type Result = { status: number; body: Record<string, unknown>; calls: Call[] }

async function checkout(
  body: unknown,
  { stock = {} as Record<string, number>, stockFails = false, host = 'minicuration.com' } = {},
): Promise<Result> {
  const calls: Call[] = []
  require.cache[STORE] = {
    id: STORE, filename: STORE, loaded: true,
    exports: {
      store: () => ({
        listStock: async () => (stockFails
          ? { data: null, error: { message: 'boom' } }
          : { data: CARDS.filter((c: { kind: string }) => c.kind === 'limited')
              .map((c: { slug: string }) => ({ slug: c.slug, stock: stock[c.slug] ?? 50 })), error: null }),
      }),
    },
  } as never
  function FakeStripe() {
    return {
      coupons: { create: async (args: Record<string, unknown>) => { calls.push({ kind: 'coupon', args }); return { id: 'co_test' } } },
      checkout: { sessions: { create: async (args: Record<string, unknown>) => { calls.push({ kind: 'session', args }); return { url: 'https://checkout.stripe.com/c/pay/cs_test' } } } },
    }
  }
  require.cache[STRIPE] = { id: STRIPE, filename: STRIPE, loaded: true, exports: FakeStripe } as never
  delete require.cache[CHECKOUT]
  const handler = require('../api/checkout.js')

  let status = 200
  let payload: Record<string, unknown> = {}
  const res = {
    status: (code: number) => { status = code; return res },
    json: (p: Record<string, unknown>) => { payload = p; return res },
    end: () => res,
  }
  try {
    await handler({ method: 'POST', headers: { host }, body }, res)
  } finally {
    delete require.cache[STORE]; delete require.cache[STRIPE]; delete require.cache[CHECKOUT]
  }
  return { status, body: payload, calls }
}

test.describe('catalog pricing — quote()', () => {
  const open = (qty: number) => quote([{ slug: 'moonsail', qty }])

  test('unlimited cards are $6 each and go by letter: $2 an order, however many', () => {
    expect(open(1)).toMatchObject({ subtotal: 600, discount: 0, method: 'letter', shipping: 200, total: 800 })
    expect(open(3)).toMatchObject({ subtotal: 1800, method: 'letter', shipping: 200, total: 2000 })
  })

  test('a limited card, case or stand makes it a $7 tracked package', () => {
    expect(quote([{ slug: 'pride', qty: 1 }, { slug: 'lush', qty: 1 }])).toMatchObject({ subtotal: 2000, method: 'parcel', shipping: 700 })
    expect(quote([{ slug: 'pride', qty: 1 }, { slug: 'moonsail', qty: 2 }])).toMatchObject({ method: 'parcel', shipping: 700 })
    expect(quote([{ slug: 'moonsail', qty: 1 }, { slug: 'acrylic-case', qty: 1 }])).toMatchObject({ method: 'parcel', shipping: 700 })
    expect(quote([{ slug: 'moonsail', qty: 1 }, { slug: 'acrylic-stand', qty: 1 }])).toMatchObject({ method: 'parcel', shipping: 700 })
  })

  test('orders of $50 or more ship free, add-ons included in the $50', () => {
    expect(open(8)).toMatchObject({ subtotal: 4800, shipping: 200 })
    expect(open(9)).toMatchObject({ subtotal: 5400, shipping: 0 })
    expect(quote([{ slug: 'moonsail', qty: 7 }, { slug: 'acrylic-case', qty: 2 }]))
      .toMatchObject({ subtotal: 5000, method: 'parcel', shipping: 0 })
  })

  test('10 unlimited pieces for $50 with free shipping; $10 off every full 10', () => {
    expect(open(9)).toMatchObject({ discount: 0 })
    expect(open(10)).toMatchObject({ subtotal: 6000, discount: 1000, shipping: 0, total: 5000 })
    expect(open(13)).toMatchObject({ subtotal: 7800, discount: 1000 })
    expect(open(20)).toMatchObject({ subtotal: 12000, discount: 2000 })
  })

  test('the bundle counts across different unlimited cards, and ignores limited ones', () => {
    const q = quote([{ slug: 'pride', qty: 1 }, { slug: 'moonsail', qty: 6 }, { slug: 'reach', qty: 4 }])
    expect(q).toMatchObject({ openCount: 10, subtotal: 1000 + 6000, discount: 1000 })
    expect(quote([{ slug: 'pride', qty: 1 }, { slug: 'moonsail', qty: 9 }]).discount).toBe(0)
  })

  test('the acrylic case is $4, one per unlimited card, and not part of the bundle', () => {
    expect(quote([{ slug: 'moonsail', qty: 2 }, { slug: 'acrylic-case', qty: 2 }]))
      .toMatchObject({ openCount: 2, subtotal: 1200 + 800, discount: 0, shipping: 700, total: 2000 + 700 })
    expect(quote([{ slug: 'moonsail', qty: 1 }, { slug: 'acrylic-case', qty: 2 }]).error).toBe('too_many_addons')
    expect(quote([{ slug: 'pride', qty: 1 }, { slug: 'acrylic-case', qty: 1 }]).error).toBe('too_many_addons')
    expect(quote([{ slug: 'moonsail', qty: 9 }, { slug: 'acrylic-case', qty: 9 }]).discount).toBe(0)
  })

  test('the acrylic stand is $1, one per unlimited card, alongside a case', () => {
    expect(quote([{ slug: 'moonsail', qty: 2 }, { slug: 'acrylic-case', qty: 2 }, { slug: 'acrylic-stand', qty: 2 }]))
      .toMatchObject({ subtotal: 1200 + 800 + 200 })
    expect(quote([{ slug: 'moonsail', qty: 1 }, { slug: 'acrylic-stand', qty: 2 }]))
      .toMatchObject({ error: 'too_many_addons', slug: 'acrylic-stand' })
  })

  test('refuses what the browser should never send', () => {
    expect(quote([]).error).toBe('empty_cart')
    expect(quote([{ slug: 'not-a-card', qty: 1 }]).error).toBe('unknown_card')
    expect(quote([{ slug: 'veritas', qty: 2 }]).error).toBe('one_per_limited')
    expect(quote([{ slug: 'pride', qty: 2 }]).error).toBe('one_per_limited')
    expect(quote([{ slug: 'moonsail', qty: 0 }]).error).toBe('bad_quantity')
    expect(quote([{ slug: 'moonsail', qty: 1.5 }]).error).toBe('bad_quantity')
    expect(quote([{ slug: 'moonsail', qty: 1 }, { slug: 'moonsail', qty: 1 }]).error).toBe('duplicate_card')
  })
})

test.describe('/api/checkout', () => {
  test('builds a Stripe session priced from the catalog, with each card named in metadata', async () => {
    const { status, body, calls } = await checkout({ items: [{ slug: 'moonsail', qty: 3 }, { slug: 'pride', qty: 1 }] })
    expect(status).toBe(200)
    expect(body.url).toContain('checkout.stripe.com')
    const session = calls.find(c => c.kind === 'session')!.args as {
      line_items: { quantity: number; price_data: { unit_amount: number; product_data: { metadata: Record<string, string> } } }[]
      discounts?: unknown; metadata: Record<string, string>; success_url: string
    }
    expect(session.line_items.map(l => [l.price_data.product_data.metadata.slug, l.quantity, l.price_data.unit_amount]))
      .toEqual([['moonsail', 3, 600], ['pride', 1, 1000]])
    expect(session.discounts).toBeUndefined()
    expect(session.metadata).toEqual({ source: 'cart', ship: 'parcel' })
    expect(session.success_url).toBe('https://minicuration.com/thanks.html?order={CHECKOUT_SESSION_ID}')
  })

  test('ten unlimited cards get a single-use $10 coupon', async () => {
    const { calls } = await checkout({ items: [{ slug: 'moonsail', qty: 4 }, { slug: 'reach', qty: 6 }] })
    const coupon = calls.find(c => c.kind === 'coupon')!.args
    expect(coupon).toMatchObject({ amount_off: 1000, currency: 'usd', max_redemptions: 1 })
    const session = calls.find(c => c.kind === 'session')!.args as { shipping_options: { shipping_rate_data: { fixed_amount: { amount: number } } }[] }
    expect(session.shipping_options[0].shipping_rate_data.fixed_amount.amount).toBe(0)
    expect(calls.find(c => c.kind === 'session')!.args.discounts).toEqual([{ coupon: 'co_test' }])
  })

  test('the case goes to Stripe as its own add-on line, named in metadata', async () => {
    const { calls } = await checkout({ items: [{ slug: 'moonsail', qty: 1 }, { slug: 'acrylic-case', qty: 1 }] })
    const session = calls.find(c => c.kind === 'session')!.args as {
      line_items: { quantity: number; price_data: { unit_amount: number; product_data: { name: string; metadata: Record<string, string> } } }[]
      shipping_options: { shipping_rate_data: { display_name: string; fixed_amount: { amount: number } } }[]
    }
    expect(session.shipping_options[0].shipping_rate_data).toMatchObject({
      display_name: 'US shipping (tracked package)', fixed_amount: { amount: 700 },
    })
    const line = session.line_items[1]
    expect(line.price_data.unit_amount).toBe(400)
    expect(line.price_data.product_data.metadata).toEqual({ slug: 'acrylic-case', kind: 'addon' })
    expect(line.price_data.product_data.name).toContain('add-on')
  })

  test('a price sent by the browser is ignored', async () => {
    const { calls } = await checkout({ items: [{ slug: 'moonsail', qty: 1, price: 1 }] })
    const session = calls.find(c => c.kind === 'session')!.args as { line_items: { price_data: { unit_amount: number } }[] }
    expect(session.line_items[0].price_data.unit_amount).toBe(600)
  })

  test('a sold-out limited card is refused before payment', async () => {
    const { status, body, calls } = await checkout({ items: [{ slug: 'lush', qty: 1 }] }, { stock: { lush: 0 } })
    expect(status).toBe(409)
    expect(body).toEqual({ error: 'sold_out', slugs: ['lush'] })
    expect(calls).toHaveLength(0)
  })

  test('limited cards are not sold blind when the inventory sheet is down', async () => {
    const { status } = await checkout({ items: [{ slug: 'lush', qty: 1 }] }, { stockFails: true })
    expect(status).toBe(503)
  })

  test('unlimited-only carts do not need the inventory sheet', async () => {
    const { status } = await checkout({ items: [{ slug: 'moonsail', qty: 2 }] }, { stockFails: true })
    expect(status).toBe(200)
  })

  test('a bad cart is a 400, and nothing is created in Stripe', async () => {
    const { status, calls } = await checkout({ items: [{ slug: 'nope', qty: 1 }] })
    expect(status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  test('return URLs follow a Vercel preview but never an arbitrary host', async () => {
    const preview = await checkout({ items: [{ slug: 'moonsail', qty: 1 }] }, { host: 'minicuration-git-x.vercel.app' })
    expect((preview.calls.find(c => c.kind === 'session')!.args as { cancel_url: string }).cancel_url)
      .toBe('https://minicuration-git-x.vercel.app/cart.html')
    const evil = await checkout({ items: [{ slug: 'moonsail', qty: 1 }] }, { host: 'evil.example' })
    expect((evil.calls.find(c => c.kind === 'session')!.args as { cancel_url: string }).cancel_url)
      .toBe('https://minicuration.com/cart.html')
  })
})
