'use strict'
// The pack-and-ship step. Edition numbers live on physical prints, not in a
// counter, so this is the only place a buyer is ever told which one is theirs.
// Orders are grouped: a six-pack is one card with six edition inputs, shipped
// as one action, and the buyer gets ONE email listing every print.
//   GET  → orders still waiting to be packed, grouped by order number
//   POST → record the numbers actually written on the prints, mark those
//          editions sold in the grid, then tell the buyer
const {
  supabase, sendMail, checkAdminToken, readJsonBody, parseEditionNumber,
  orderNumberFrom, PRODUCT_NAMES, EDITION_SIZE,
} = require('./_lib.js')

// Six distinct designs is the largest real order (the six-pack).
const MAX_ITEMS = 6

// Pure so tests can cover it: collapse pending sales rows (newest first) into
// one entry per order. Keeps the rows' order, so orders stay newest-first.
function groupPendingByOrder(rows) {
  const orders = []
  const byNumber = new Map()
  for (const row of rows) {
    let order = byNumber.get(row.order_number)
    if (!order) {
      order = {
        orderNumber: row.order_number,
        createdAt:   row.created_at,
        buyerName:   row.buyer_name,
        buyerEmail:  row.buyer_email,
        items:       [],
      }
      byNumber.set(row.order_number, order)
      orders.push(order)
    }
    order.items.push({
      id:               row.id,
      slug:             row.slug,
      productName:      PRODUCT_NAMES[row.slug] || row.slug,
      suggestedEdition: row.edition_number,
    })
  }
  for (const order of orders) order.isBundle = order.items.length > 1
  return orders
}

// One email per order, single or bundle. items = [{ productName, editionNumber }].
function buildShippedEmail(orderNumber, items, buyerName) {
  if (items.length === 1) {
    const { productName, editionNumber } = items[0]
    return {
      subject: `Order ${orderNumber} — ${productName}, edition ${editionNumber} of ${EDITION_SIZE}`,
      html: `
        <p>${buyerName ? `${buyerName}, your` : 'Your'} print is packed and on its way.</p>
        <p>You own <strong>${productName}</strong> —
           edition <strong>${editionNumber} of ${EDITION_SIZE}</strong>.</p>
        <p>That number is written on the print itself and is yours alone.
           No other collector holds this edition.</p>
        <p>Order ${orderNumber}. Reply to this email with any questions.</p>
      `,
    }
  }
  return {
    subject: `Order ${orderNumber} — your prints are packed, edition numbers inside`,
    html: `
      <p>${buyerName ? `${buyerName}, your` : 'Your'} prints are packed and on their way.</p>
      <p>You own:</p>
      <ul>${items.map(({ productName, editionNumber }) =>
        `<li><strong>${productName}</strong> —
         edition <strong>${editionNumber} of ${EDITION_SIZE}</strong></li>`).join('')}</ul>
      <p>Those numbers are written on the prints themselves and are yours alone.
         No other collector holds these editions.</p>
      <p>Order ${orderNumber}. Reply to this email with any questions.</p>
    `,
  }
}

// Validate a POST body's items array without touching the database. Returns
// { ok: true, items: [{ id, editionNumber }] } or { ok: false, error, detail }.
function parseShipItems(body) {
  const items = body?.items
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'missing_items' }
  }
  if (items.length > MAX_ITEMS) {
    return { ok: false, error: 'too_many_items', detail: `at most ${MAX_ITEMS} prints ship per order` }
  }
  const parsed = []
  const seenIds = new Set()
  for (const item of items) {
    if (!item?.id) return { ok: false, error: 'missing_id' }
    if (seenIds.has(item.id)) return { ok: false, error: 'duplicate_item' }
    seenIds.add(item.id)
    const n = parseEditionNumber(item.editionNumber)
    if (!n.ok) return { ok: false, error: 'invalid_edition_number', detail: n.error }
    parsed.push({ id: item.id, editionNumber: n.editionNumber })
  }
  return { ok: true, items: parsed }
}

async function handler(req, res) {
  if (!process.env.ADMIN_TOKEN) {
    console.error('ADMIN_TOKEN is not set — /api/ship is disabled')
    return res.status(503).json({ error: 'ship_endpoint_not_configured' })
  }
  // Same opaque 401 whether the token is missing or wrong.
  if (!checkAdminToken(req.headers['x-admin-token'])) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  // ── Pending queue, grouped by order ─────────────────────────────────────────
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
      orders: groupPendingByOrder(data),
      editionSize: EDITION_SIZE,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  // ── Mark an order packed (one or six prints) ────────────────────────────────
  const body = await readJsonBody(req)
  if (!body) return res.status(400).json({ error: 'invalid_json' })

  const parsed = parseShipItems(body)
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error, detail: parsed.detail })
  }

  const ids = parsed.items.map(i => i.id)
  const { data: pending, error: fetchError } = await supabase()
    .from('sales')
    .select('id, order_number, slug, buyer_name, buyer_email, stripe_session')
    .in('id', ids)
    .is('shipped_at', null)

  if (fetchError) {
    console.error('Ship fetch failed:', fetchError.message)
    return res.status(500).json({ error: 'ship_fetch_failed' })
  }
  // If two tabs submit the same order, the second finds nothing pending and
  // the buyer is not emailed twice.
  if (pending.length !== parsed.items.length) {
    return res.status(409).json({ error: 'already_shipped_or_missing' })
  }
  if (new Set(pending.map(r => r.order_number)).size > 1) {
    return res.status(400).json({ error: 'mixed_orders' })
  }

  const editionById = new Map(parsed.items.map(i => [i.id, i.editionNumber]))
  const sales = pending.map(row => ({ ...row, editionNumber: editionById.get(row.id) }))

  // The same physical print cannot ship twice in one order.
  const pairs = new Set()
  for (const sale of sales) {
    const key = `${sale.slug}#${sale.editionNumber}`
    if (pairs.has(key)) {
      return res.status(400).json({ error: 'duplicate_edition', detail: `${sale.slug} edition ${sale.editionNumber} appears twice` })
    }
    pairs.add(key)
  }

  // ── Duplicate-edition protection ────────────────────────────────────────────
  // Warn (409, retryable with force:true) if a typed number points at a box
  // that is already sold or gifted, or is reserved for a DIFFERENT order.
  // This order's own reservation is expected and not a conflict.
  const slugs = [...new Set(sales.map(s => s.slug))]
  const { data: boxes, error: boxError } = await supabase()
    .from('editions')
    .select('slug, edition_number, status, reserved_by')
    .in('slug', slugs)
    .in('edition_number', [...new Set(sales.map(s => s.editionNumber))])

  if (boxError) {
    console.error('Edition lookup failed:', boxError.message)
    return res.status(500).json({ error: 'edition_lookup_failed' })
  }

  if (body.force !== true) {
    const conflicts = []
    for (const sale of sales) {
      const box = boxes.find(b => b.slug === sale.slug && b.edition_number === sale.editionNumber)
      if (!box) continue  // no grid row (pre-migration design) — nothing to check
      const takenByStatus = box.status === 'sold' || box.status === 'gifted'
      const takenByOther  = box.reserved_by && box.reserved_by !== sale.stripe_session
      if (takenByStatus || takenByOther) {
        conflicts.push({
          slug:          sale.slug,
          productName:   PRODUCT_NAMES[sale.slug] || sale.slug,
          edition:       sale.editionNumber,
          status:        box.status,
          reservedOrder: takenByOther ? orderNumberFrom(box.reserved_by) : null,
        })
      }
    }
    if (conflicts.length) {
      return res.status(409).json({ error: 'edition_conflict', conflicts })
    }
  }

  // ── Ship each row, then update the grid ─────────────────────────────────────
  // Sequential and non-transactional (Supabase REST cannot batch). If a write
  // fails mid-loop, some rows are shipped and no email has gone out; the
  // shipped_at guard makes retrying the remainder safe and email-once.
  const shippedAt = new Date().toISOString()
  const shipped = []
  for (const sale of sales) {
    const { data: rows, error } = await supabase()
      .from('sales')
      .update({ edition_number: sale.editionNumber, shipped_at: shippedAt })
      .eq('id', sale.id)
      .is('shipped_at', null)
      .select('id, order_number, slug, edition_number, buyer_name, buyer_email')

    if (error) {
      console.error('Ship update failed:', error.message)
      return res.status(500).json({ error: 'ship_update_failed', shippedSoFar: shipped.length })
    }
    if (!rows?.length) return res.status(409).json({ error: 'already_shipped_or_missing' })
    shipped.push(rows[0])

    // The packed print's box turns green, and this order's reservation is
    // released — if the owner packed a different print than was reserved, the
    // reserved box simply returns to circulation untouched.
    const { error: gridError } = await supabase()
      .from('editions')
      .update({ status: 'sold', updated_at: shippedAt })
      .eq('slug', sale.slug)
      .eq('edition_number', sale.editionNumber)
    if (gridError) console.error('Grid mark-sold failed:', gridError.message)

    if (sale.stripe_session) {
      const { error: releaseError } = await supabase()
        .from('editions')
        .update({ reserved_by: null, reserved_at: null, updated_at: shippedAt })
        .eq('slug', sale.slug)
        .eq('reserved_by', sale.stripe_session)
      if (releaseError) console.error('Reservation release failed:', releaseError.message)
    }
  }

  const first = shipped[0]
  const emailed = await sendMail({
    to: first.buyer_email,
    ...buildShippedEmail(
      first.order_number,
      shipped.map(s => ({
        productName:   PRODUCT_NAMES[s.slug] || s.slug,
        editionNumber: s.edition_number,
      })),
      first.buyer_name,
    ),
  })

  // Order number only — no buyer name or address. See api/webhook.js.
  console.log(`Shipped ${first.order_number}: ` +
    shipped.map(s => `${s.slug} edition ${s.edition_number}/${EDITION_SIZE}`).join(', ') +
    `${emailed ? '' : ' (EMAIL NOT SENT)'}`)

  return res.status(200).json({ shipped, emailed })
}

module.exports = handler
// Exported for unit tests — grouping and email wording must not regress.
module.exports.groupPendingByOrder = groupPendingByOrder
module.exports.buildShippedEmail = buildShippedEmail
module.exports.parseShipItems = parseShipItems
