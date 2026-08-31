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

  // A design's stock is its count of available + relisted editions not
  // reserved by a pending order — a Postgres view under the Supabase backend,
  // counted from the editions tab under Sheets.
  const { data, error } = await store().listStock()

  if (error) {
    console.error('Stock fetch failed:', error.message)
    return res.status(500).json({ error: 'Failed to fetch inventory' })
  }

  const inventory = Object.fromEntries(
    data.map(row => [row.slug, { stock: row.stock, soldOut: row.stock === 0 }])
  )

  // CDN: 60s fresh, 30s stale-while-revalidate
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
  return res.status(200).json(inventory)
}
