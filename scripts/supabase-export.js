#!/usr/bin/env node
'use strict'
// Step 1 of the Supabase → Google Sheets move: dump both tables to a local
// JSON file. Run this BEFORE pausing the Supabase project — a paused project
// cannot be read.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/supabase-export.js
//
// Writes .local/supabase-export.json, which scripts/sheets-setup.js imports.
// .local/ is gitignored: the sales table holds buyer names and emails.
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const OUT = path.join(__dirname, '..', '.local', 'supabase-export.json')

async function main() {
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
    if (!process.env[key]) {
      console.error(`${key} is not set — export needs the service key to read past RLS.`)
      process.exit(1)
    }
  }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: editions, error: edErr } = await db.from('editions')
    .select('slug, edition_number, status, reserved_by, reserved_at, updated_at')
    .order('slug').order('edition_number')
  if (edErr) throw new Error(`editions export failed: ${edErr.message}`)

  const { data: sales, error: salesErr } = await db.from('sales')
    .select('id, slug, edition_number, order_number, buyer_email, buyer_name, stripe_session, created_at, shipped_at')
    .order('created_at')
  if (salesErr) throw new Error(`sales export failed: ${salesErr.message}`)

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify({
    exportedAt: new Date().toISOString(), editions, sales,
  }, null, 2))

  const pending = sales.filter(s => !s.shipped_at).length
  console.log(`Exported ${editions.length} editions and ${sales.length} sales (${pending} not yet packed)`)
  console.log(`→ ${OUT}`)
  console.log('\nNext: node scripts/sheets-setup.js --import')
}

main().catch(err => { console.error(err.message); process.exit(1) })
