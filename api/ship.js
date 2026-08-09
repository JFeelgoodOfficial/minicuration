'use strict'
// The pack-and-ship step. Edition numbers live on physical prints, not in a
// counter, so this is the only place a buyer is ever told which one is theirs.
//   GET  → orders still waiting to be packed
//   POST → record the edition number actually written on the print, then tell
//          the buyer
const crypto = require('crypto')
const {
  supabase, sendMail, parseEditionNumber, PRODUCT_NAMES, EDITION_SIZE,
} = require('./_lib.js')

// Timing-safe so the token can't be recovered by measuring response times.
function tokenValid(supplied) {
  const expected = process.env.ADMIN_TOKEN
  if (!expected || !supplied) return false
  const a = Buffer.from(String(supplied))
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body)
  return new Promise(resolve => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

module.exports = async function handler(req, res) {
  if (!process.env.ADMIN_TOKEN) {
    console.error('ADMIN_TOKEN is not set — /api/ship is disabled')
    return res.status(503).json({ error: 'ship_endpoint_not_configured' })
  }
  // Same opaque 401 whether the token is missing or wrong.
  if (!tokenValid(req.headers['x-admin-token'])) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  // ── Pending queue ───────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase()
      .from('sales')
      .select('id, order_number, slug, edition_number, buyer_name, buyer_email, created_at')
      .is('shipped_at', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Pending fetch failed:', error.message)
      return res.status(500).json({ error: 'pending_fetch_failed' })
    }
    return res.status(200).json({
      pending: data.map(row => ({ ...row, productName: PRODUCT_NAMES[row.slug] || row.slug })),
      editionSize: EDITION_SIZE,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  // ── Mark one print packed ───────────────────────────────────────────────────
  const body = await readJsonBody(req)
  if (!body) return res.status(400).json({ error: 'invalid_json' })

  const { id, editionNumber } = body
  if (!id) return res.status(400).json({ error: 'missing_id' })

  const parsed = parseEditionNumber(editionNumber)
  if (!parsed.ok) return res.status(400).json({ error: 'invalid_edition_number', detail: parsed.error })

  // Only update while shipped_at is still NULL. If two tabs submit the same
  // order, the second matches no row and the buyer is not emailed twice.
  const { data: rows, error } = await supabase()
    .from('sales')
    .update({ edition_number: parsed.editionNumber, shipped_at: new Date().toISOString() })
    .eq('id', id)
    .is('shipped_at', null)
    .select('id, order_number, slug, edition_number, buyer_name, buyer_email')

  if (error) {
    console.error('Ship update failed:', error.message)
    return res.status(500).json({ error: 'ship_update_failed' })
  }
  if (!rows?.length) return res.status(409).json({ error: 'already_shipped_or_missing' })

  const sale = rows[0]
  const productName = PRODUCT_NAMES[sale.slug] || sale.slug

  const emailed = await sendMail({
    to:      sale.buyer_email,
    subject: `Order ${sale.order_number} — ${productName}, edition ${sale.edition_number} of ${EDITION_SIZE}`,
    html: `
      <p>${sale.buyer_name ? `${sale.buyer_name}, your` : 'Your'} print is packed and on its way.</p>
      <p>You own <strong>${productName}</strong> —
         edition <strong>${sale.edition_number} of ${EDITION_SIZE}</strong>.</p>
      <p>That number is written on the print itself and is yours alone.
         No other collector holds this edition.</p>
      <p>Order ${sale.order_number}. Reply to this email with any questions.</p>
    `,
  })

  // Order number only — no buyer name or address. See api/webhook.js.
  console.log(`Shipped ${sale.order_number}: ${sale.slug} edition ` +
    `${sale.edition_number}/${EDITION_SIZE}` +
    `${emailed ? '' : ' (EMAIL NOT SENT)'}`)

  return res.status(200).json({ shipped: sale, emailed })
}
