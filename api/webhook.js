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
// Replace each placeholder with the real price ID from:
//   Stripe Dashboard → Products → [product] → Pricing → copy "Price ID"
const PRICE_TO_SLUG = {
  'price_1THqBC2mxhfkNl2YBY8WvOMV':           'dreamfall',
  'price_1TLRuH2mxhfkNl2Y79qbJAxg':      'dream-mountain',
  'price_1TLRv52mxhfkNl2YApKWxTqX':           'sky-miles',
  'price_1TLRwB2mxhfkNl2YSBrpZOaE': 'a-simple-meditation',
  'price_1TLRy02mxhfkNl2Yb3iw3bCd':             'veritas',
  'price_1TLS0S2mxhfkNl2YwCu7HMrZ':        'sweet-dreams',
}

const PRODUCT_NAMES = {
  'dreamfall':           'Dreamfall',
  'dream-mountain':      'Dream Mountain',
  'sky-miles':           'Sky Miles',
  'a-simple-meditation': 'A Simple Meditation',
  'veritas':             'Veritas',
  'sweet-dreams':        'Sweet Dreams',
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
  const lineItems = await stripe().checkout.sessions.listLineItems(session.id, { limit: 5 })
  const priceId   = lineItems.data[0]?.price?.id
  const slug      = PRICE_TO_SLUG[priceId]

  if (!slug) {
    console.warn('Unrecognised price ID:', priceId)
    return res.status(200).json({ received: true })
  }

  // 3. Atomic stock decrement via Postgres RPC (prevents race conditions)
  const { data, error } = await supabase().rpc('decrement_stock', { product_slug: slug })

  if (error || data === null) {
    console.error('Stock decrement failed:', error?.message)
    return res.status(500).json({ error: 'stock_update_failed' })
  }

  if (data === -1) {
    // RPC returned -1: stock was already 0 when this purchase hit
    console.error(`OVERSELL BLOCKED: ${slug} was already sold out`)
    return res.status(200).json({ received: true, warning: 'sold_out' })
  }

  const editionNumber = 50 - data  // remaining stock after decrement → edition number

  // 4. Append to permanent sales ledger
  const { error: ledgerError } = await supabase().from('sales').insert({
    slug,
    edition_number: editionNumber,
    buyer_email:    session.customer_details?.email,
    buyer_name:     session.customer_details?.name,
    stripe_session: session.id,
  })
  if (ledgerError) console.error('Ledger insert failed:', ledgerError.message)

  console.log(`Sold: ${slug} edition ${editionNumber}/50 → ${session.customer_details?.email}`)

  // 5. Fulfillment email (skipped if RESEND_API_KEY not set)
  if (process.env.RESEND_API_KEY && session.customer_details?.email) {
    try {
      await resend().emails.send({
        from:    'Minicuration <hello@minicuration.com>',
        to:      session.customer_details.email,
        subject: `Your Minicuration print — edition ${editionNumber} of 50`,
        html: `
          <p>Thank you for your order.</p>
          <p>You own <strong>${PRODUCT_NAMES[slug]}</strong>,
             edition <strong>${editionNumber} of 50</strong>.</p>
          <p>This number is yours alone. No other collector holds this edition.</p>
          <p>Your print ships within 5–7 business days.
             Reply to this email with any questions.</p>
        `,
      })
    } catch (emailErr) {
      console.error('Fulfillment email failed:', emailErr.message)
      // Don't fail the webhook — email is non-critical
    }
  }

  return res.status(200).json({ received: true, slug, editionNumber })
}

// Disable Vercel's body parser so we can read the raw body for Stripe verification
handler.config = { api: { bodyParser: false } }

module.exports = handler
