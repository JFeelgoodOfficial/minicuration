'use strict'
const { createClient } = require('@supabase/supabase-js')

let _supabase
function supabase() {
  return _supabase ||= createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY  // anon key — read-only, safe server-side
  )
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { data, error } = await supabase()
    .from('inventory')
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
