#!/usr/bin/env node
'use strict'
// Sets up the Neon database in one command:
//
//   npm run db:setup
//
// Reads its settings from .env.local (see .env.example), then:
//   1. creates the tables, the claim_edition function and the stock view
//   2. copies the live data from Supabase, if Supabase details are present
//   3. reports what the storefront will now show
//
// Safe to run more than once. Nothing is deleted: the tables are only created
// if missing, editions already there keep their status, and sales already
// copied are skipped rather than duplicated. If it fails halfway, run it again.
const fs = require('fs')
const path = require('path')
const { neon } = require('@neondatabase/serverless')
const { splitStatements } = require('./_sql-file.js')

const ROOT = path.join(__dirname, '..')
const SCHEMA = path.join(ROOT, 'scripts', 'neon-schema.sql')
const BACKUP = path.join(ROOT, '.local', 'supabase-export.json')
const dryRun = process.argv.includes('--dry-run')

// ── .env.local ───────────────────────────────────────────────────────────────
// Real environment variables win, so this never overrides something set on the
// command line or by Vercel.
function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '')
    }
    return name
  }
  return null
}

function fail(message, help) {
  console.error(`\n${message}\n`)
  if (help) console.error(help + '\n')
  process.exit(1)
}

// ── 1. Schema ────────────────────────────────────────────────────────────────
async function applySchema(sql) {
  const statements = splitStatements(fs.readFileSync(SCHEMA, 'utf8'))
  for (const statement of statements) await sql.query(statement)
  console.log(`Tables, stock view and claim_edition are in place (${statements.length} statements).`)
}

// ── 2. Copy from Supabase ────────────────────────────────────────────────────
async function readSupabase() {
  const { createClient } = require('@supabase/supabase-js')
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: editions, error: edErr } = await db.from('editions')
    .select('slug, edition_number, status, reserved_by, reserved_at, updated_at')
    .order('slug').order('edition_number')
  if (edErr) fail(`Could not read the editions table from Supabase: ${edErr.message}`,
    'Check SUPABASE_URL and SUPABASE_SERVICE_KEY, and that the project is not paused.')

  const { data: sales, error: salesErr } = await db.from('sales')
    .select('id, slug, edition_number, order_number, buyer_email, buyer_name, stripe_session, created_at, shipped_at')
    .order('created_at')
  if (salesErr) fail(`Could not read the sales table from Supabase: ${salesErr.message}`)

  return { editions, sales }
}

// Written before anything is sent to Neon: a one-way move deserves a copy on
// disk. .local/ is gitignored — sales rows hold buyer names and emails.
function backup(data) {
  fs.mkdirSync(path.dirname(BACKUP), { recursive: true })
  fs.writeFileSync(BACKUP, JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2))
  console.log(`Saved a backup of the Supabase data to ${path.relative(ROOT, BACKUP)}`)
}

const column = (rows, name, fallback = null) => rows.map(r => r[name] ?? fallback)

async function copyIn(sql, { editions, sales }) {
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
}

// ── 3. Report ────────────────────────────────────────────────────────────────
async function report(sql) {
  const stock = await sql`select slug, stock from public_stock order by slug`
  const [{ pending }] = await sql`select count(*)::int as pending from sales where shipped_at is null`
  const [{ total }] = await sql`select count(*)::int as total from sales`

  console.log('\nWhat the shop will show:')
  for (const row of stock) {
    console.log(`  ${row.slug.padEnd(22)} ${String(row.stock).padStart(2)} available` +
      (row.stock === 0 ? '   (sold out)' : ''))
  }
  console.log(`\n  ${total} order line(s) on record, ${pending} still to pack.`)
  return { pending }
}

async function main() {
  const envFile = loadEnvFile()
  if (envFile) console.log(`Read settings from ${envFile}\n`)

  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL is not set, so there is no database to set up.',
      'Create a project at neon.com, copy its connection string, and put it in a\n' +
      'file called .env.local in this folder:\n\n' +
      '  DATABASE_URL=postgresql://...\n\n' +
      'See .env.example for the full list of settings.')
  }

  const sql = neon(process.env.DATABASE_URL)
  try {
    await sql`select 1`
  } catch (err) {
    fail(`Could not reach the database: ${err.message}`,
      'Check that DATABASE_URL is the full connection string from the Neon console,\n' +
      'including the password and the ?sslmode=require at the end.')
  }
  console.log('Connected to Neon.')

  await applySchema(sql)

  const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  if (!hasSupabase) {
    console.log('\nNo Supabase details found, so nothing was copied over — the grid starts')
    console.log('with all 300 prints available. Add SUPABASE_URL and SUPABASE_SERVICE_KEY')
    console.log('to .env.local and run this again to bring your real sales history across.')
  } else {
    const data = await readSupabase()
    const reserved = data.editions.filter(r => r.reserved_by).length
    const unpacked = data.sales.filter(r => !r.shipped_at).length
    console.log(`\nRead from Supabase: ${data.editions.length} prints (${reserved} reserved for ` +
      `unfinished orders), ${data.sales.length} order line(s), ${unpacked} still to pack.`)
    backup(data)

    if (dryRun) {
      console.log('\n--dry-run: stopping here, nothing was copied into Neon.')
      return
    }
    await copyIn(sql, data)
    console.log('Copied into Neon.')

    const { pending } = await report(sql)
    if (pending !== unpacked) {
      console.warn(`\nWARNING: Supabase had ${unpacked} order line(s) still to pack but Neon has ` +
        `${pending}. Do not pause Supabase until you know why.`)
    }
    console.log('\nDone. Next: put the same DATABASE_URL into Vercel (Project → Settings →')
    console.log('Environment Variables), redeploy, then open minicuration.com/admin.html.')
    return
  }

  await report(sql)
  console.log('\nDone. Next: put the same DATABASE_URL into Vercel (Project → Settings →')
  console.log('Environment Variables), redeploy, then open minicuration.com/admin.html.')
}

main().catch(err => { console.error(`\n${err.message}\n`); process.exit(1) })
