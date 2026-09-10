'use strict'
const { store } = require('./_store.js')

// Sister sites allowed to read inventory cross-origin (jfeelgood.com "Collect" section)
const ALLOWED_ORIGINS = [
  'https://jfeelgood.com',
  'https://www.jfeelgood.com',
  'https://jfeelgoodofficial.github.io',
]

module.exports = async function handler(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Vary', 'Origin')

  if (req.method !== 'GET') return res.status(405).end()

  // public_stock is a view over the editions grid: a design's stock is its
  // count of available + relisted editions not reserved by a pending order.
  const { data, error } = await store().listStock()

  if (error) {
    console.error('Stock fetch failed:', error.message)
    // `reason` names the setup step to fix; it deliberately contains no IDs,
    // addresses or keys, because this endpoint is public.
    return res.status(500).json({
      error: 'Failed to fetch inventory',
      ...(error.reason ? { reason: error.reason } : {}),
    })
  }

  const inventory = Object.fromEntries(
    data.map(row => [row.slug, { stock: row.stock, soldOut: row.stock === 0 }])
  )

  // CDN: 5 min fresh, 10 min stale-while-revalidate. Longer than it looks:
  // stock only moves on a sale or an edit to the sheet, and overselling is
  // prevented in api/webhook.js (the payment link is deactivated the moment a
  // design empties), not by the freshness of this badge. The long window also
  // keeps us well inside Google's per-minute API quota.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  return res.status(200).json(inventory)
}
