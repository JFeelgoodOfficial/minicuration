#!/usr/bin/env node
'use strict'
// One-time move of live data from Supabase to Neon.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… DATABASE_URL=… \
//     node scripts/migrate-to-neon.js [--dry-run]
//
// Run scripts/neon-schema.sql against DATABASE_URL first, and run this BEFORE
// pausing the Supabase project — a paused project cannot be read.
//
// Re-runnable. Editions are upserted (Supabase's status and reservations win);
// sales are inserted by primary key and rows already present are skipped, so a
// second run after a partial failure completes the move rather than duplicating
// the ledger.
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const { neon } = require('@neondatabase/serverless')

const BACKUP = path.join(__dirname, '..', '.local', 'supabase-export.json')
const dryRun = process.argv.includes('--dry-run')

function requireEnv(...keys) {
  const missing = keys.filter(k => !process.env[k])
  if (missing.length) {
    console.error(`Missing environment: ${missing.join(', ')}`)
    process.exit(1)
  }
}

async function readSupabase() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: editions, error: edErr } = await db.from('editions')
    .select('slug, edition_number, status, reserved_by, reserved_at, updated_at')
    .order('slug').order('edition_number')
  if (edErr) throw new Error(`editions read failed: ${edErr.message}`)

  const { data: sales, error: salesErr } = await db.from('sales')
    .select('id, slug, edition_number, order_number, buyer_email, buyer_name, stripe_session, created_at, shipped_at')
    .order('created_at')
  if (salesErr) throw new Error(`sales read failed: ${salesErr.message}`)

  return { editions, sales }
}

// Written before anything is sent to Neon: a one-way move deserves a copy on
// disk. .local/ is gitignored — sales rows hold buyer names and emails.
function backup(data) {
  fs.mkdirSync(path.dirname(BACKUP), { recursive: true })
  fs.writeFileSync(BACKUP, JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2))
  console.log(`Backed up to ${BACKUP}`)
}

const column = (rows, name, fallback = null) => rows.map(r => r[name] ?? fallback)

async function writeNeon({ editions, sales }) {
  const sql = neon(process.env.DATABASE_URL)

  if (editions.length) {
    await sql`
      insert into editions (slug, edition_number, status, reserved_by, reserved_at, updated_at)
      select * from unnest(
        ${column(editions, 'slug')}::text[],
        ${column(editions, 'edition_number')}::int[],
        ${editions.map(r => r.status || 'available')}::text[],
        ${column(editions, 'reserved_by')}::text[],
        ${column(editions, 'reserved_at')}::timestamptz[],
        ${editions.map(r => r.updated_at || new Date().toISOString())}::timestamptz[]
      )
      on conflict (slug, edition_number) do update
        set status      = excluded.status,
            reserved_by = excluded.reserved_by,
            reserved_at = excluded.reserved_at,
            updated_at  = excluded.updated_at`
  }

  if (sales.length) {
    await sql`
      insert into sales (id, slug, edition_number, order_number, buyer_email, buyer_name, stripe_session, created_at, shipped_at)
      select * from unnest(
        ${sales.map(r => String(r.id))}::text[],
        ${column(sales, 'slug')}::text[],
        ${column(sales, 'edition_number')}::int[],
        ${column(sales, 'order_number')}::text[],
        ${column(sales, 'buyer_email')}::text[],
        ${column(sales, 'buyer_name')}::text[],
        ${column(sales, 'stripe_session')}::text[],
        ${sales.map(r => r.created_at || new Date().toISOString())}::timestamptz[],
        ${column(sales, 'shipped_at')}::timestamptz[]
      )
      on conflict (id) do nothing`
  }

  // Read back from Neon rather than trusting the write: these are the numbers
  // the storefront and the pack queue will actually show.
  const stock = await sql`select slug, stock from public_stock order by slug`
  const [{ pending }] = await sql`select count(*)::int as pending from sales where shipped_at is null`
  const [{ total }] = await sql`select count(*)::int as total from sales`
  return { stock, pending, total }
}

async function main() {
  requireEnv('SUPABASE_URL', 'SUPABASE_SERVICE_KEY')
  if (!dryRun) requireEnv('DATABASE_URL')

  const data = await readSupabase()
  const reserved = data.editions.filter(r => r.reserved_by).length
  const unpacked = data.sales.filter(r => !r.shipped_at).length
  console.log(`Read from Supabase: ${data.editions.length} editions (${reserved} reserved), ` +
    `${data.sales.length} sales (${unpacked} not yet packed)`)

  backup(data)

  if (dryRun) {
    console.log('\n--dry-run: nothing written to Neon.')
    return
  }

  const { stock, pending, total } = await writeNeon(data)
  console.log(`\nNeon now holds ${total} sales (${pending} in the pack queue).`)
  console.log('Stock by design:')
  for (const row of stock) console.log(`  ${row.slug.padEnd(22)} ${row.stock}`)

  if (pending !== unpacked) {
    console.warn(`\nWARNING: Supabase had ${unpacked} unpacked orders, Neon has ${pending}. ` +
      'Check the ledger before pausing Supabase.')
  }
  console.log('\nNext: set DATABASE_URL in Vercel, redeploy, check /api/stock and admin.html.')
}

main().catch(err => { console.error(err.message); process.exit(1) })
