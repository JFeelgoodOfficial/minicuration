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
const { PRODUCT_NAMES } = require('./_constants.js')

const EDITIONS_TAB = 'editions'
const SALES_TAB = 'sales'
const SELLABLE = new Set(['available', 'relisted'])

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
    return { data: null, error: { message: err.message } }
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
    return guard(async () => {
      const { boxes } = await loadEditions()
      const counts = Object.fromEntries(Object.keys(PRODUCT_NAMES).map(slug => [slug, 0]))
      for (const box of boxes) {
        if (box.slug in counts && isSellable(box)) counts[box.slug]++
      }
      return Object.entries(counts).map(([slug, stock]) => ({ slug, stock }))
    })
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
    return guard(async () => {
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
    })
  },

  insertSales(rows) {
    return guard(async () => {
      const { header } = await sheets.readTab(SALES_TAB)
      const now = new Date().toISOString()
      await sheets.appendRows(SALES_TAB, header, rows.map(row => ({
        id:         crypto.randomUUID(),
        created_at: now,
        shipped_at: '',
        ...row,
      })))
      return null
    })
  },
}

module.exports = { store: () => store }
