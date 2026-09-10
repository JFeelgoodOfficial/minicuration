#!/usr/bin/env node
'use strict'
// Builds the spreadsheet the shop reads from:
//
//   npm run sheet:setup
//
// Creates the two tabs with their headers and fills the editions tab with all
// 300 prints (6 designs x 50) marked available. Reads its settings from
// .env.local — see .env.example.
//
// Safe to re-run: it refuses to touch a tab that already has rows unless you
// pass --force, so a stray second run cannot wipe your sales.
const fs = require('fs')
const path = require('path')
const { loadEnvFile } = require('./_env.js')
loadEnvFile()
const sheets = require('../api/_sheets.js')
const { PRODUCT_NAMES, EDITION_SIZE } = require('../api/_constants.js')

const EDITION_COLUMNS = ['slug', 'edition_number', 'status', 'reserved_by', 'reserved_at', 'updated_at']
const SALES_COLUMNS = ['id', 'slug', 'edition_number', 'order_number', 'buyer_email', 'buyer_name', 'stripe_session', 'created_at', 'shipped_at']

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

async function main() {
  const args = new Set(process.argv.slice(2))
  const editions = freshEditions()
  const sales = []

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
  console.log(`\nDone — ${sellable} prints are ready to sell.`)
  console.log('Next: put the same three GOOGLE_ settings into Vercel, redeploy,')
  console.log('then open minicuration.com/api/stock to check it.')
}

main().catch(err => { console.error(err.message); process.exit(1) })
