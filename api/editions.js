'use strict'
// The admin inventory grid: 6 designs × 50 editions, each box cycling
// available → sold → gifted → relisted → available. This table is the source
// of truth for public stock (see public_stock view / api/stock.js).
//   GET  → the full grid
//   POST → set one box's status, or release a dangling reservation
const {
  store, checkAdminToken, readJsonBody, parseEditionNumber, orderNumberFrom,
  PRODUCT_NAMES, EDITION_SIZE, EDITION_STATUSES,
} = require('./_lib.js')

module.exports = async function handler(req, res) {
  if (!process.env.ADMIN_TOKEN) {
    console.error('ADMIN_TOKEN is not set — /api/editions is disabled')
    return res.status(503).json({ error: 'editions_endpoint_not_configured' })
  }
  // Same opaque 401 whether the token is missing or wrong.
  if (!checkAdminToken(req.headers['x-admin-token'])) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  // ── Full grid ───────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await store().listEditions()

    if (error) {
      console.error('Grid fetch failed:', error.message)
      return res.status(500).json({ error: 'grid_fetch_failed' })
    }

    const grid = {}
    for (const slug of Object.keys(PRODUCT_NAMES)) grid[slug] = []
    for (const row of data) {
      if (!grid[row.slug]) continue  // ignore rows for retired designs
      grid[row.slug].push({
        n:      row.edition_number,
        status: row.status,
        // The order number is enough to find the sale; the raw Stripe session
        // ID stays server-side even though this is an admin page.
        reservedOrder: row.reserved_by ? orderNumberFrom(row.reserved_by) : null,
      })
    }
    return res.status(200).json({ editionSize: EDITION_SIZE, names: PRODUCT_NAMES, grid })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const body = await readJsonBody(req)
  if (!body) return res.status(400).json({ error: 'invalid_json' })

  const { slug, edition } = body
  if (!PRODUCT_NAMES[slug]) return res.status(400).json({ error: 'unknown_slug' })

  const parsed = parseEditionNumber(edition)
  if (!parsed.ok) return res.status(400).json({ error: 'invalid_edition_number', detail: parsed.error })

  // ── Release a reservation ───────────────────────────────────────────────────
  // For orders that were refunded or cancelled after the webhook reserved a
  // box — until released, that box silently counts against public stock.
  if (body.action === 'release') {
    const { data: row, error } = await store()
      .releaseReservation(slug, parsed.editionNumber, new Date().toISOString())

    if (error) {
      console.error('Reservation release failed:', error.message)
      return res.status(500).json({ error: 'release_failed' })
    }
    if (!row) return res.status(409).json({ error: 'not_reserved_or_missing' })

    console.log(`Released reservation on ${slug} #${parsed.editionNumber}`)
    return res.status(200).json({ slug, edition: parsed.editionNumber, status: row.status })
  }

  // ── Set a box's status ──────────────────────────────────────────────────────
  const { status } = body
  if (!EDITION_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'invalid_status', detail: `status must be one of: ${EDITION_STATUSES.join(', ')}` })
  }

  // Last write wins: with a single owner clicking one grid, a stale tab
  // overwriting a fresher one is acceptable — reload beats a conflict dance.
  const { data: row, error } = await store()
    .setEditionStatus(slug, parsed.editionNumber, status, new Date().toISOString())

  if (error) {
    console.error('Status update failed:', error.message)
    return res.status(500).json({ error: 'status_update_failed' })
  }
  if (!row) return res.status(404).json({ error: 'edition_not_found' })

  // Slug and number only — never buyer data. See api/webhook.js.
  console.log(`Edition ${slug} #${parsed.editionNumber} → ${status}`)
  return res.status(200).json({ slug, edition: parsed.editionNumber, status })
}
