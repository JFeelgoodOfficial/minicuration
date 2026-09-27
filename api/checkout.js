'use strict'
// POST /api/checkout — turns the cart into a Stripe Checkout session.
//
// The browser sends only which cards and how many: [{ slug, qty }]. Every price,
// the open-edition bundle discount and shipping come from api/_catalog.js, so
// a hand-edited request cannot change what anything costs.
//
// Limited cards are checked against the spreadsheet first, so a sold-out
// design is refused here rather than paid for and refunded. The webhook still
// reserves the print when payment lands and refunds that item if it lost a
// race for the last one.
const Stripe = require('stripe')
const { quote, SHIPPING, BUNDLE, PREORDER } = require('./_catalog.js')
const { store } = require('./_store.js')

let _stripe
function stripe() { return _stripe ||= new Stripe(process.env.STRIPE_SECRET_KEY) }

// Return URLs and product images point back at whichever deployment took the
// order (a Vercel preview or the live site), but never at an arbitrary host
// header.
function siteUrl(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  return /^(minicuration\.com|[a-z0-9-]+\.vercel\.app)$/.test(host)
    ? `https://${host}` : 'https://minicuration.com'
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  try { return JSON.parse(req.body || '{}') } catch { return {} }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const order = quote(readBody(req).items)
  if (order.error) return res.status(400).json(order)

  const limited = order.lines.filter(l => l.card.kind === 'limited').map(l => l.card.slug)
  if (limited.length) {
    const { data, error } = await store().listStock()
    if (error) {
      console.error('Checkout stock check failed:', error.message)
      return res.status(503).json({ error: 'inventory_unavailable' })
    }
    const stock = Object.fromEntries(data.map(row => [row.slug, row.stock]))
    const soldOut = limited.filter(slug => !stock[slug])
    if (soldOut.length) return res.status(409).json({ error: 'sold_out', slugs: soldOut })
  }

  const site = siteUrl(req)
  try {
    // A coupon can only be attached by ID, so the bundle discount gets a
    // single-use one per checkout. The lines already carry each card's unit
    // (pre-order) price, so the coupon is only ever the bundle's share and
    // Stripe's total equals quote()'s.
    let discounts
    if (order.discount) {
      const coupon = await stripe().coupons.create({
        amount_off: order.discount,
        currency: 'usd',
        duration: 'once',
        max_redemptions: 1,
        name: `Open edition bundle — $${order.discount / 100} off every ${BUNDLE.size}${order.preorder ? ' (pre-order price)' : ''}`,
      })
      discounts = [{ coupon: coupon.id }]
    }

    // The webhook reads the line metadata to know what was bought, and
    // `preorder` to know what was promised: a pre-order line waits for stock.
    const preorderMeta = (line) => (line.preorder ? { preorder: '1', ships: PREORDER.ships } : {})
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: order.lines.map((line) => ({
        quantity: line.qty,
        price_data: {
          currency: 'usd',
          unit_amount: line.unit,
          product_data: line.card.kind === 'addon' ? {
            name: `${line.card.title} (add-on)`,
            description: line.card.note,
            metadata: { slug: line.card.slug, kind: line.card.kind },
          } : {
            name: `${line.card.title} — ${line.card.kind === 'limited' ? 'Limited Edition' : 'Open Edition'} Mini Art Print`
              + (line.preorder ? ` — pre-order, ships ${PREORDER.label}` : ''),
            images: [`${site}/image/cards/${line.card.slug}-front.webp`],
            metadata: { slug: line.card.slug, kind: line.card.kind, ...preorderMeta(line) },
          },
        },
      })),
      ...(discounts ? { discounts } : {}),
      ...(order.preorder ? {
        custom_text: { submit: { message: `Pre-order cards ship ${PREORDER.label}. In-stock cards ship within 5–7 business days.` } },
      } : {}),
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: order.shipping
            ? (order.method === 'parcel' ? SHIPPING.parcelLabel : SHIPPING.letterLabel)
            : SHIPPING.freeLabel,
          // Letter or tracked package, free from $50; quote() has already
          // worked it out.
          fixed_amount: { amount: order.shipping, currency: 'usd' },
        },
      }],
      // ship tells whoever packs the order: an envelope, or a tracked package.
      // preorder says part of it waits for stock, and until when.
      metadata: {
        source: 'cart', ship: order.method,
        ...(order.preorder ? { preorder: '1', preorder_ships: PREORDER.ships } : {}),
      },
      success_url: `${site}/thanks.html?order={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/cart.html`,
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Checkout session failed:', err.message)
    return res.status(502).json({ error: 'checkout_failed' })
  }
}

module.exports = handler
module.exports.siteUrl = siteUrl
