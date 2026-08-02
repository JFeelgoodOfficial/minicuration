'use strict'
const Stripe     = require('stripe')
const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

// ── Lazy singletons (re-used across warm invocations) ────────────────────────
let _stripe, _supabase, _resend
function stripe()    { return _stripe    ||= new Stripe(process.env.STRIPE_SECRET_KEY) }
function supabase()  { return _supabase  ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) }
function resend()    { return _resend    ||= new Resend(process.env.RESEND_API_KEY) }

// ── Stripe price ID → product slug ───────────────────────────────────────────
// Price IDs change every time a product is re-priced (e.g. the summer sale), so
// this map is a fast path only — resolveSlugs() falls back to matching the
// Stripe product name, which survives re-pricing. Old IDs stay listed so
// checkouts started before a price change still resolve.
const PRICE_TO_SLUG = {
  // Current prices — summer sale ($10 each; Sweet Dreams $8)
  'price_1U07n72mxhfkNl2YELQTDBFG':           'dreamfall',
  'price_1U07r12mxhfkNl2YYDCWyXNP':      'dream-mountain',
  'price_1U07sJ2mxhfkNl2YQgM1WlS6':           'sky-miles',
  'price_1U07sv2mxhfkNl2YiIr52Kb7': 'a-simple-meditation',
  'price_1U07tq2mxhfkNl2YeiHKsdF9':             'veritas',
  'price_1TzPZE2mxhfkNl2YTUVsFRVh':        'sweet-dreams',
  // Superseded prices — kept mapped so checkouts opened before a price
  // change still decrement stock instead of being logged as unrecognised.
  'price_1TYe162mxhfkNl2YfTEeMam4':           'dreamfall',
  'price_1TYe0Z2mxhfkNl2YQly65K69':      'dream-mountain',
  'price_1TYdzt2mxhfkNl2Y5DazJzes':           'sky-miles',
  'price_1TYdz82mxhfkNl2Y9ioFZci0': 'a-simple-meditation',
  'price_1TYdyF2mxhfkNl2Y6YezO7rQ':             'veritas',
  'price_1TYGcr2mxhfkNl2YAUNVRpw4':        'sweet-dreams',
}

// Prices that sell every edition in one checkout (the $60 six-pack).
const BUNDLE_PRICE_IDS = new Set([
  'price_1U07vq2mxhfkNl2Y8cgwskpF',
])

const PRODUCT_NAMES = {
  'dreamfall':           'Dreamfall',
  'dream-mountain':      'Dream Mountain',
  'sky-miles':           'Sky Miles',
  'a-simple-meditation': 'A Simple Meditation',
  'veritas':             'Veritas',
  'sweet-dreams':        'Sweet Dreams',
}

const ALL_SLUGS = Object.keys(PRODUCT_NAMES)

// The six-pack sells every edition in one checkout.
const BUNDLE_PATTERN = /six[\s-]?pack|bundle|complete\s+(set|collection)|all\s+six/i

// "Dream Mountain — Limited Edition Mini Art Print" → 'dream-mountain'
function slugFromName(name) {
  if (!name) return null
  const normalised = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  // Longest slug first so 'dream-mountain' is preferred over any shorter prefix.
  return [...ALL_SLUGS].sort((a, b) => b.length - a.length)
    .find(slug => normalised.includes(slug)) || null
}

// Which editions does this checkout consume? Bundle → all six, otherwise one
// slug per line item.
function resolveSlugs(lineItems) {
  const isBundle = lineItems.some(item =>
    BUNDLE_PRICE_IDS.has(item.price?.id)
    || BUNDLE_PATTERN.test(item.description || item.price?.product?.name || ''))
  if (isBundle) return { slugs: [...ALL_SLUGS], isBundle: true }

  const slugs = lineItems
    .map(item => PRICE_TO_SLUG[item.price?.id]
      || slugFromName(item.price?.product?.name)
      || slugFromName(item.description))
    .filter(Boolean)
  return { slugs: [...new Set(slugs)], isBundle: false }
}

// ── Deactivate a Payment Link so it can no longer be purchased ────────────────
async function deactivatePaymentLink(linkId) {
  if (!linkId) return
  try {
    await stripe().paymentLinks.update(linkId, { active: false })
    console.log(`Payment link deactivated: ${linkId}`)
  } catch (err) {
    console.error(`Failed to deactivate payment link ${linkId}:`, err.message)
  }
}

// ── Raw body reader (required for Stripe signature verification) ──────────────
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end',  ()    => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // 1. Verify signature
  const rawBody = await getRawBody(req)
  let event
  try {
    event = stripe().webhooks.constructEvent(
      rawBody,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  // 2. Only handle completed checkouts
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true })
  }

  const session   = event.data.object
  const lineItems = await stripe().checkout.sessions.listLineItems(session.id, {
    limit: 10,
    expand: ['data.price.product'],
  })
  const { slugs, isBundle } = resolveSlugs(lineItems.data)

  if (!slugs.length) {
    console.warn('Unrecognised checkout — no product matched:',
      lineItems.data.map(item => item.description || item.price?.id).join(', '))
    return res.status(200).json({ received: true })
  }

  // 3. Atomic stock decrement per edition (Postgres RPC prevents race conditions)
  const sold      = []  // { slug, editionNumber }
  const soldOut   = []  // already at zero when this purchase landed
  let   emptiedAn = false

  for (const slug of slugs) {
    const { data, error } = await supabase().rpc('decrement_stock', { product_slug: slug })

    if (error || data === null) {
      console.error(`Stock decrement failed for ${slug}:`, error?.message)
      return res.status(500).json({ error: 'stock_update_failed', slug })
    }

    if (data === -1) { soldOut.push(slug); continue }

    sold.push({ slug, editionNumber: 50 - data })  // remaining after decrement → edition number
    if (data === 0) emptiedAn = true
  }

  // A sold-out edition also makes the six-pack unfulfillable, so close that link
  // too when its ID is configured.
  if (emptiedAn || soldOut.length) {
    await deactivatePaymentLink(session.payment_link)
    if (!isBundle) await deactivatePaymentLink(process.env.STRIPE_BUNDLE_LINK_ID)
  }

  if (soldOut.length) {
    if (isBundle) {
      // Never auto-refund a whole six-pack: the other editions in it are valid
      // and shipping. Refund amount is a judgement call, so escalate instead.
      console.error(
        `MANUAL REVIEW — six-pack ${session.id} included sold-out edition(s): ${soldOut.join(', ')}. ` +
        `Fulfilled: ${sold.map(s => s.slug).join(', ') || 'none'}. Partial refund required.`)
      return res.status(200).json({ received: true, warning: 'bundle_partial_sold_out', soldOut })
    }

    // Single print that was already gone: close the link and refund in full.
    console.error(`OVERSELL BLOCKED: ${soldOut.join(', ')} already sold out — refunding ${session.id}`)
    if (session.payment_intent) {
      try {
        await stripe().refunds.create({
          payment_intent: session.payment_intent,
          reason: 'requested_by_customer',
        })
        console.log(`Auto-refunded oversell: ${session.payment_intent}`)
      } catch (refundErr) {
        console.error('Auto-refund failed (needs manual refund):', refundErr.message)
      }
    }
    return res.status(200).json({ received: true, warning: 'sold_out_refunded' })
  }

  // 4. Append to permanent sales ledger — one row per edition sold
  const { error: ledgerError } = await supabase().from('sales').insert(
    sold.map(({ slug, editionNumber }) => ({
      slug,
      edition_number: editionNumber,
      buyer_email:    session.customer_details?.email,
      buyer_name:     session.customer_details?.name,
      stripe_session: session.id,
    })))
  if (ledgerError) console.error('Ledger insert failed:', ledgerError.message)

  console.log(`Sold${isBundle ? ' (six-pack)' : ''}: ` +
    sold.map(s => `${s.slug} edition ${s.editionNumber}/50`).join(', ') +
    ` → ${session.customer_details?.email}`)

  // 5. Fulfillment email (skipped if RESEND_API_KEY not set)
  if (process.env.RESEND_API_KEY && session.customer_details?.email) {
    const editionList = sold
      .map(({ slug, editionNumber }) =>
        `<li><strong>${PRODUCT_NAMES[slug]}</strong> — edition <strong>${editionNumber} of 50</strong></li>`)
      .join('')
    try {
      await resend().emails.send({
        from:    'Minicuration <hello@minicuration.com>',
        to:      session.customer_details.email,
        subject: isBundle
          ? 'Your Minicuration six-pack — all six editions'
          : `Your Minicuration print — edition ${sold[0].editionNumber} of 50`,
        html: `
          <p>Thank you for your order.</p>
          <p>You own${isBundle ? ' the complete collection:' : ':'}</p>
          <ul>${editionList}</ul>
          <p>${sold.length > 1 ? 'These numbers are' : 'This number is'} yours alone.
             No other collector holds ${sold.length > 1 ? 'this set of editions' : 'this edition'}.</p>
          <p>Your ${sold.length > 1 ? 'prints ship' : 'print ships'} within 5–7 business days.
             Reply to this email with any questions.</p>
        `,
      })
    } catch (emailErr) {
      console.error('Fulfillment email failed:', emailErr.message)
      // Don't fail the webhook — email is non-critical
    }
  }

  return res.status(200).json({ received: true, isBundle, sold })
}

// Disable Vercel's body parser so we can read the raw body for Stripe verification
handler.config = { api: { bodyParser: false } }

module.exports = handler
// Exported for unit tests — resolution must keep working across re-pricing.
module.exports.resolveSlugs = resolveSlugs
module.exports.slugFromName = slugFromName
