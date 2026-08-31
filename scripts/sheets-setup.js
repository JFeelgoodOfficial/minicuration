#!/usr/bin/env node
'use strict'
// Step 2 of the Supabase → Google Sheets move: build the spreadsheet the
// Sheets store driver expects.
//
//   GOOGLE_SHEETS_ID=... GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_PRIVATE_KEY=... \
//     node scripts/sheets-setup.js [--import] [--force]
//
//   (no flag)  create both tabs and seed 6 × 50 fresh 'available' editions
//   --import   seed from .local/supabase-export.json instead (keeps history)
//   --force    overwrite tabs that already have data
//
// Safe to re-run: without --force it refuses to touch a tab that has rows, so
// a stray second run cannot wipe the ledger.
const fs = require('fs')
const path = require('path')
const sheets = require('../api/_sheets.js')
const { PRODUCT_NAMES, EDITION_SIZE } = require('../api/_constants.js')

const EDITION_COLUMNS = ['slug', 'edition_number', 'status', 'reserved_by', 'reserved_at', 'updated_at']
const SALES_COLUMNS = ['id', 'slug', 'edition_number', 'order_number', 'buyer_email', 'buyer_name', 'stripe_session', 'created_at', 'shipped_at']
const EXPORT = path.join(__dirname, '..', '.local', 'supabase-export.json')

async function existingTabs() {
  const meta = await sheets.call('', { query: { fields: 'sheets.properties.title' } })
  return new Set(meta.sheets.map(s => s.properties.title))
}

async function addTab(title) {
  await sheets.call(':batchUpdate', {
    method: 'POST',
    body: { requests: [{ addSheet: { properties: { title } } }] },
  })
}

// One write per tab: header row plus every data row in a single range update,
// which keeps a 300-row seed inside one API call.
async function writeTab(title, columns, rows) {
  const values = [columns, ...rows.map(row => columns.map(c => (row[c] == null ? '' : String(row[c]))))]
  const end = `${sheets.columnLetter(columns.length)}${values.length}`
  await sheets.call(`/values/${encodeURIComponent(`${title}!A1:${end}`)}`, {
    method: 'PUT', query: { valueInputOption: 'RAW' }, body: { values },
  })
}

function freshEditions() {
  const now = new Date().toISOString()
  const rows = []
  for (const slug of Object.keys(PRODUCT_NAMES)) {
    for (let n = 1; n <= EDITION_SIZE; n++) {
      rows.push({ slug, edition_number: n, status: 'available', reserved_by: '', reserved_at: '', updated_at: now })
    }
  }
  return rows
}

function loadExport() {
  if (!fs.existsSync(EXPORT)) {
    console.error(`No export found at ${EXPORT} — run scripts/supabase-export.js first.`)
    process.exit(1)
  }
  const { editions, sales } = JSON.parse(fs.readFileSync(EXPORT, 'utf8'))
  // Any design missing from the export still needs its full 50 boxes, or its
  // stock reads as zero and the storefront shows it sold out.
  const seen = new Set(editions.map(r => `${r.slug}#${r.edition_number}`))
  const filled = [...editions, ...freshEditions().filter(r => !seen.has(`${r.slug}#${r.edition_number}`))]
  return { editions: filled, sales }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const { editions, sales } = args.has('--import')
    ? loadExport()
    : { editions: freshEditions(), sales: [] }

  const tabs = await existingTabs()
  for (const [title, columns, rows] of [
    ['editions', EDITION_COLUMNS, editions],
    ['sales', SALES_COLUMNS, sales],
  ]) {
    if (!tabs.has(title)) {
      await addTab(title)
      console.log(`Created tab '${title}'`)
    } else if (!args.has('--force')) {
      const { rows: existing } = await sheets.readTab(title)
      if (existing.length) {
        console.error(`Tab '${title}' already has ${existing.length} rows — re-run with --force to overwrite.`)
        process.exit(1)
      }
    }
    await writeTab(title, columns, rows)
    console.log(`Wrote ${rows.length} rows to '${title}'`)
  }

  const sellable = editions.filter(r =>
    ['available', 'relisted'].includes(r.status || 'available') && !r.reserved_by).length
  console.log(`\nDone. ${sellable} editions are currently sellable.`)
  console.log('Set STORE_BACKEND=sheets in Vercel, redeploy, then check /api/stock.')
}

main().catch(err => { console.error(err.message); process.exit(1) })
