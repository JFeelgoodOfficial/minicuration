'use strict'
// Inventory and the sales ledger, kept in a Google Spreadsheet.
//
// Two tabs, one row per record — see the README for the columns. Everything
// the shop owner does by hand (marking a print sold, freeing a reservation
// from a refunded order, recording the edition number actually packed) is done
// by editing the sheet directly, so there are only three things the website
// itself needs to do:
//
//   listStock     — how many of each design are still for sale
//   claimEdition  — a checkout reserves a print
//   insertSales   — record the sale
//
// Functions return { data, error } rather than throwing, so a Sheets outage
// renders a 500 instead of taking the function down.
const crypto = require('crypto')
const sheets = require('./_sheets.js')
const { PRODUCT_NAMES, EDITION_SIZE } = require('./_constants.js')

const EDITIONS_TAB = 'editions'
const SALES_TAB = 'sales'
const SELLABLE = new Set(['available', 'relisted'])

const EDITION_COLUMNS = ['slug', 'edition_number', 'status', 'reserved_by', 'reserved_at', 'updated_at']
const SALES_COLUMNS = ['id', 'slug', 'edition_number', 'order_number', 'buyer_email', 'buyer_name',
                       'stripe_session', 'created_at', 'shipped_at']

// Sheets hands back strings and drops trailing blank cells; normalise so the
// rest of the code sees numbers and nulls.
function edition(row) {
  return {
    _row:           row._row,
    slug:           row.slug,
    edition_number: Number(row.edition_number),
    status:         row.status || 'available',
    reserved_by:    row.reserved_by || null,
  }
}

// A print is for sale if it is available (or relisted) and no unfinished
// checkout is holding it.
const isSellable = (box) => SELLABLE.has(box.status) && !box.reserved_by

async function guard(fn) {
  try {
    return { data: await fn(), error: null }
  } catch (err) {
    return { data: null, error: { message: err.message, reason: describeFailure(err) } }
  }
}

// Turns whatever Google said into one short sentence naming the thing to fix.
// Setting this shop up is half a dozen browser forms and every one of them can
// be got subtly wrong, so "something failed" is not a good enough answer — but
// the text is also served publicly, so it names no IDs, emails or keys.
function describeFailure(err) {
  const message = err.message || ''
  if (/GOOGLE_SHEETS_ID is not set/.test(message)) return 'GOOGLE_SHEETS_ID is not set in Vercel'
  if (/GOOGLE_SERVICE_ACCOUNT_EMAIL is not set/.test(message)) return 'GOOGLE_SERVICE_ACCOUNT_EMAIL is not set in Vercel'
  if (/GOOGLE_PRIVATE_KEY is not set/.test(message)) return 'GOOGLE_PRIVATE_KEY is not set in Vercel'
  if (/does not look like a key/.test(message)) return 'GOOGLE_PRIVATE_KEY is not a private key — paste the "private_key" value from the service-account JSON'
  if (err.isAuth || /invalid_grant|invalid_client|Invalid JWT/i.test(message)) {
    return 'Google rejected the service-account key — check GOOGLE_PRIVATE_KEY and GOOGLE_SERVICE_ACCOUNT_EMAIL match the same JSON file'
  }
  if (err.status === 403) return 'the spreadsheet is not shared with the service account — share it as an Editor'
  if (err.status === 404) return 'no spreadsheet with that GOOGLE_SHEETS_ID'
  if (err.status === 429) return 'Google rate-limited us — try again in a minute'
  if (/Unable to parse range|not found/i.test(message)) return 'the spreadsheet is missing its tabs and they could not be created'
  return null
}

// ── First-run setup ──────────────────────────────────────────────────────────
// A brand-new spreadsheet is empty, so the first request to hit it builds the
// two tabs and seeds all 300 prints. Doing it here rather than in a script
// means the shop can be set up entirely from a browser: share the sheet with
// the service account, set the three variables in Vercel, and the first
// visitor completes the job.
function freshEditions() {
  const now = new Date().toISOString()
  const rows = []
  for (const slug of Object.keys(PRODUCT_NAMES)) {
    for (let n = 1; n <= EDITION_SIZE; n++) {
      rows.push({ slug, edition_number: n, status: 'available',
                  reserved_by: '', reserved_at: '', updated_at: now })
    }
  }
  return rows
}

async function createTab(title, columns, rows) {
  try {
    await sheets.call(':batchUpdate', {
      method: 'POST',
      body: { requests: [{ addSheet: { properties: { title } } }] },
    })
  } catch (err) {
    // Two cold requests can race to create the same tab; the loser carries on
    // and writes into the tab the winner just made.
    if (!/already exists/i.test(err.message)) throw err
  }
  const values = [columns, ...rows.map(row => columns.map(c => (row[c] == null ? '' : String(row[c]))))]
  await sheets.call(
    `/values/${encodeURIComponent(`${title}!A1:${sheets.columnLetter(columns.length)}${values.length}`)}`,
    { method: 'PUT', query: { valueInputOption: 'RAW' }, body: { values } })
}

async function ensureSetUp() {
  const meta = await sheets.call('', { query: { fields: 'sheets.properties.title' } })
  const existing = new Set((meta.sheets || []).map(s => s.properties.title))

  // Never overwrite a tab that is already there — that would wipe real sales.
  if (!existing.has(EDITIONS_TAB)) await createTab(EDITIONS_TAB, EDITION_COLUMNS, freshEditions())
  if (!existing.has(SALES_TAB)) await createTab(SALES_TAB, SALES_COLUMNS, [])
}

// Sheets answers a request for a tab that does not exist with a parse error on
// the range. That is the signal to build the spreadsheet, once, then retry.
const isMissingTab = (err) => /Unable to parse range|not found/i.test(err.message)

async function withSetup(fn) {
  try {
    return await fn()
  } catch (err) {
    if (!isMissingTab(err)) throw err
    await ensureSetUp()
    return fn()
  }
}

async function loadEditions() {
  const { header, rows } = await sheets.readTab(EDITIONS_TAB)
  return { header, boxes: sheets.toObjects(header, rows).map(edition) }
}

// Write back only the columns we own, so any extra column added by hand in the
// spreadsheet (a note, a shipping date) survives.
async function patchRow(tab, header, rowNumber, patch) {
  const current = await sheets.readRow(tab, header, rowNumber)
  await sheets.writeRow(tab, header, rowNumber, { ...current, ...patch })
}

const store = {
  listStock() {
    return guard(() => withSetup(async () => {
      const { boxes } = await loadEditions()
      const counts = Object.fromEntries(Object.keys(PRODUCT_NAMES).map(slug => [slug, 0]))
      for (const box of boxes) {
        if (box.slug in counts && isSellable(box)) counts[box.slug]++
      }
      return Object.entries(counts).map(([slug, stock]) => ({ slug, stock }))
    }))
  },

  // Reserves the lowest-numbered print still for sale and returns it as the
  // provisional edition number, plus how many remain.
  //
  // The Sheets API has no compare-and-swap, so this writes the reservation and
  // reads it back to confirm it stuck, moving to the next print if another
  // checkout got there first. That closes the ordinary race but leaves a
  // sub-second window where two checkouts of the SAME design could land on one
  // print. At a few sales a week across six designs that is unlikely, and the
  // result is visible in the sheet (two orders showing the same number) rather
  // than silent — but it is a real difference from a database, not an equal.
  claimEdition(slug, sessionId) {
    return guard(() => withSetup(async () => {
      const { header, boxes } = await loadEditions()
      const mine = boxes.filter(b => b.slug === slug)
      const remaining = () => mine.filter(isSellable).length

      // Stripe retries the same checkout on failure; an existing reservation
      // wins so one order never consumes two prints.
      const held = mine.find(b => b.reserved_by === sessionId)
      if (held) return { claimed: held.edition_number, remaining: remaining() }

      const now = new Date().toISOString()
      const free = mine.filter(isSellable).sort((a, b) => a.edition_number - b.edition_number)

      for (const box of free) {
        await patchRow(EDITIONS_TAB, header, box._row, {
          reserved_by: sessionId, reserved_at: now, updated_at: now,
        })
        const confirmed = edition(await sheets.readRow(EDITIONS_TAB, header, box._row))
        if (confirmed.reserved_by === sessionId) {
          box.reserved_by = sessionId          // so remaining() counts it as taken
          return { claimed: box.edition_number, remaining: remaining() }
        }
        box.reserved_by = confirmed.reserved_by   // lost the race — try the next
      }
      return { claimed: null, remaining: 0 }
    }))
  },

  insertSales(rows) {
    return guard(() => withSetup(async () => {
      const { header } = await sheets.readTab(SALES_TAB)
      const now = new Date().toISOString()
      await sheets.appendRows(SALES_TAB, header, rows.map(row => ({
        id:         crypto.randomUUID(),
        created_at: now,
        shipped_at: '',
        ...row,
      })))
      return null
    }))
  },
}

module.exports = { store: () => store, describeFailure, EDITION_COLUMNS, SALES_COLUMNS }
