'use strict'
const { createClient } = require('@supabase/supabase-js')

let _supabase
function supabase() {
  return _supabase ||= createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY  // anon key — read-only, safe server-side
  )
}

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
  const { data, error } = await supabase()
    .from('public_stock')
    .select('slug, stock')

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
