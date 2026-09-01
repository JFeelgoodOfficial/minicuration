'use strict'
const Stripe = require('stripe')
const {
  store, sendMail, notifyEmail, orderNumberFrom, PRODUCT_NAMES, EDITION_SIZE,
} = require('./_lib.js')

// ── Lazy singleton (re-used across warm invocations) ─────────────────────────
let _stripe
function stripe() { return _stripe ||= new Stripe(process.env.STRIPE_SECRET_KEY) }

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

function formatAmount(session) {
  if (session.amount_total == null) return 'unknown'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (session.currency || 'usd').toUpperCase(),
  }).format(session.amount_total / 100)
}

// Payment Links put the shipping address in collected_information; older
// sessions carry it on shipping_details, and digital-only ones only have the
// billing address.
function formatAddress(session) {
  const details = session.collected_information?.shipping_details
    || session.shipping_details
    || session.customer_details
  const addr = details?.address
  if (!addr) return 'No address collected'
  return [
    details.name,
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postal_code].filter(Boolean).join(' '),
    addr.country,
  ].filter(Boolean).join('<br>')
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

  const session     = event.data.object
  const orderNumber = orderNumberFrom(session.id)
  const lineItems   = await stripe().checkout.sessions.listLineItems(session.id, {
    limit: 10,
    expand: ['data.price.product'],
  })
  const { slugs, isBundle } = resolveSlugs(lineItems.data)

  if (!slugs.length) {
    const items = lineItems.data.map(item => item.description || item.price?.id).join(', ')
    console.warn('Unrecognised checkout — no product matched:', items)
    // Money changed hands but nothing was fulfilled — this must not sit in a log.
    await sendMail({
      to:      notifyEmail(),
      subject: `ACTION NEEDED — order ${orderNumber} matched no product`,
      html: `
        <p>A checkout completed but the webhook could not match it to any print,
           so no stock was decremented and no confirmation was sent.</p>
        <p><strong>Order:</strong> ${orderNumber}<br>
           <strong>Line items:</strong> ${items || 'none'}<br>
           <strong>Total:</strong> ${formatAmount(session)}<br>
           <strong>Buyer:</strong> ${session.customer_details?.email || 'unknown'}<br>
           <strong>Stripe session:</strong> ${session.id}</p>
        <p>Fulfil this order by hand and add its price ID to PRICE_TO_SLUG.</p>
      `,
    })
    return res.status(200).json({ received: true })
  }

  // 3. Atomically reserve one edition per slug (a Postgres function holding a
  // row lock, so concurrent checkouts cannot both take the last print).
  // claim_edition reserves the lowest available box for this session — the box
  // only turns "sold" in the grid at pack time, when the real number is known.
  // The claim is idempotent per session, so a Stripe retry after our 500 below
  // cannot reserve a second print.
  const sold      = []  // { slug, editionNumber } — editionNumber is provisional
  const soldOut   = []  // nothing left to reserve when this purchase landed
  let   emptiedAn = false

  for (const slug of slugs) {
    const { data: row, error } = await store().claimEdition(slug, session.id)

    if (error || !row) {
      console.error(`Edition claim failed for ${slug}:`, error?.message)
      return res.status(500).json({ error: 'stock_update_failed', slug })
    }

    if (row.claimed == null) { soldOut.push(slug); continue }

    sold.push({ slug, editionNumber: row.claimed })
    if (row.remaining === 0) emptiedAn = true
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
        `MANUAL REVIEW — six-pack ${orderNumber} included sold-out edition(s): ${soldOut.join(', ')}. ` +
        `Fulfilled: ${sold.map(s => s.slug).join(', ') || 'none'}. Partial refund required.`)
      await sendMail({
        to:      notifyEmail(),
        subject: `ACTION NEEDED — six-pack ${orderNumber} needs a partial refund`,
        html: `
          <p>A six-pack sold, but ${soldOut.length} edition(s) in it were already gone.
             Nothing was refunded automatically — the rest of the set is valid and shipping.</p>
          <p><strong>Order:</strong> ${orderNumber}<br>
             <strong>Sold out:</strong> ${soldOut.join(', ')}<br>
             <strong>Fulfilled:</strong> ${sold.map(s => `${s.slug} #${s.editionNumber}`).join(', ') || 'none'}<br>
             <strong>Total paid:</strong> ${formatAmount(session)}<br>
             <strong>Buyer:</strong> ${session.customer_details?.email || 'unknown'}<br>
             <strong>Stripe session:</strong> ${session.id}</p>
          <p>Issue a partial refund in Stripe and tell the buyer what shipped.</p>
        `,
      })
      return res.status(200).json({ received: true, warning: 'bundle_partial_sold_out', soldOut })
    }

    // Single print that was already gone: close the link and refund in full.
    console.error(`OVERSELL BLOCKED: ${soldOut.join(', ')} already sold out — refunding ${session.id}`)
    let refunded = false
    if (session.payment_intent) {
      try {
        await stripe().refunds.create({
          payment_intent: session.payment_intent,
          reason: 'requested_by_customer',
        })
        refunded = true
        console.log(`Auto-refunded oversell: ${session.payment_intent}`)
      } catch (refundErr) {
        console.error('Auto-refund failed (needs manual refund):', refundErr.message)
      }
    }
    await sendMail({
      to:      notifyEmail(),
      subject: refunded
        ? `Order ${orderNumber} refunded — ${soldOut.join(', ')} was already sold out`
        : `ACTION NEEDED — order ${orderNumber} oversold and the refund failed`,
      html: `
        <p>Someone bought <strong>${soldOut.join(', ')}</strong> after it sold out.
           ${refunded
             ? 'It was refunded automatically and the payment link is now closed.'
             : '<strong>The automatic refund failed — refund this in Stripe by hand.</strong>'}</p>
        <p><strong>Order:</strong> ${orderNumber}<br>
           <strong>Total:</strong> ${formatAmount(session)}<br>
           <strong>Buyer:</strong> ${session.customer_details?.email || 'unknown'}<br>
           <strong>Stripe session:</strong> ${session.id}</p>
      `,
    })
    return res.status(200).json({ received: true, warning: 'sold_out_refunded' })
  }

  // 4. Append to permanent sales ledger — one row per edition sold.
  // edition_number here is PROVISIONAL: it is the box claim_edition reserved,
  // but the owner may pack a different print. The number the buyer is told is
  // set in api/ship.js when the print is actually packed, which is also when
  // shipped_at stops being NULL and the reservation is released.
  const { error: ledgerError } = await store().insertSales(
    sold.map(({ slug, editionNumber }) => ({
      slug,
      edition_number: editionNumber,
      order_number:   orderNumber,
      buyer_email:    session.customer_details?.email,
      buyer_name:     session.customer_details?.name,
      stripe_session: session.id,
    })))
  if (ledgerError) console.error('Ledger insert failed:', ledgerError.message)

  // No buyer name or address in logs — the order number is enough to find the
  // sale in the ledger or Stripe, and log retention is not the place for PII.
  console.log(`Sold${isBundle ? ' (six-pack)' : ''} ${orderNumber}: ` +
    sold.map(s => `${s.slug} (provisional edition ${s.editionNumber}/${EDITION_SIZE})`).join(', '))

  const productList = sold
    .map(({ slug }) => `<li><strong>${PRODUCT_NAMES[slug]}</strong></li>`)
    .join('')

  // 5. Confirm the order to the buyer. Deliberately no edition number: it is
  // not known until the print is picked, and a number stated here that later
  // turns out wrong is worse than one stated a day later and correct.
  await sendMail({
    to:      session.customer_details?.email,
    subject: isBundle
      ? `Order ${orderNumber} — your Minicuration six-pack is confirmed`
      : `Order ${orderNumber} — your Minicuration print is confirmed`,
    html: `
      <p>Thank you for your order. Your order number is <strong>${orderNumber}</strong>.</p>
      <p>You ordered${isBundle ? ' the complete collection:' : ':'}</p>
      <ul>${productList}</ul>
      <p>${sold.length > 1 ? 'Each print is' : 'Your print is'} hand-numbered from an
         edition of ${EDITION_SIZE}. We confirm
         ${sold.length > 1 ? 'your exact edition numbers' : 'your exact edition number'}
         by email the moment ${sold.length > 1 ? 'they are' : 'it is'} packed —
         ${sold.length > 1 ? 'those numbers are' : 'that number is'} yours alone.</p>
      <p>${sold.length > 1 ? 'Prints ship' : 'Your print ships'} within 5–7 business days.
         Reply to this email with any questions and quote ${orderNumber}.</p>
    `,
  })

  // 6. Tell the shop owner there is something to pack
  await sendMail({
    to:      notifyEmail(),
    subject: `New order ${orderNumber} — ${sold.map(s => PRODUCT_NAMES[s.slug]).join(', ')}`,
    html: `
      <p><strong>${orderNumber}</strong>${isBundle ? ' — six-pack' : ''}</p>
      <ul>${sold.map(({ slug, editionNumber }) =>
        `<li><strong>${PRODUCT_NAMES[slug]}</strong> — reserved box
         <strong>${editionNumber}</strong> (provisional)</li>`).join('')}</ul>
      <p><strong>Paid:</strong> ${formatAmount(session)}<br>
         <strong>Buyer:</strong> ${session.customer_details?.name || 'unknown'}
         &lt;${session.customer_details?.email || 'no email'}&gt;</p>
      <p><strong>Ship to:</strong><br>${formatAddress(session)}</p>
      <p><strong>Stripe session:</strong> ${session.id}</p>
      <p>The buyer has <em>not</em> been given an edition number yet. Enter the
         number actually written on the print at
         <a href="https://minicuration.com/admin.html">minicuration.com/admin.html</a>
         to confirm it to them.</p>
    `,
  })

  return res.status(200).json({ received: true, orderNumber, isBundle, sold })
}

// Disable Vercel's body parser so we can read the raw body for Stripe verification
handler.config = { api: { bodyParser: false } }

module.exports = handler
// Exported for unit tests — resolution must keep working across re-pricing.
module.exports.resolveSlugs = resolveSlugs
module.exports.slugFromName = slugFromName
module.exports.orderNumberFrom = orderNumberFrom
