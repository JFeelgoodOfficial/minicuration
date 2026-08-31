'use strict'
// Storage adapter. Every database call in api/ goes through this module so the
// backend can be switched with one environment variable:
//
//   STORE_BACKEND=sheets    → a Google Spreadsheet (the default while the
//                             Supabase project is paused)
//   STORE_BACKEND=supabase  → the original Postgres schema, untouched
//
// Both drivers return Supabase's { data, error } shape, so callers branch on
// `error` exactly as they always have and flipping back is a config change
// rather than a revert.
const crypto = require('crypto')
const { PRODUCT_NAMES } = require('./_constants.js')

const SELLABLE = new Set(['available', 'relisted'])

function backend() {
  return (process.env.STORE_BACKEND || 'sheets').toLowerCase()
}

// ═════════════════════════════════════════════════════════════════════════════
// Supabase driver — thin passthrough to the original queries.
// ═════════════════════════════════════════════════════════════════════════════
let _supabase
function supabase() {
  // Required lazily: with STORE_BACKEND=sheets the package is never loaded.
  const { createClient } = require('@supabase/supabase-js')
  return _supabase ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

const supabaseDriver = {
  listStock() {
    return supabase().from('public_stock').select('slug, stock')
  },

  listEditions() {
    return supabase().from('editions')
      .select('slug, edition_number, status, reserved_by')
      .order('slug').order('edition_number')
  },

  getEditionBoxes(slugs, numbers) {
    return supabase().from('editions')
      .select('slug, edition_number, status, reserved_by')
      .in('slug', slugs).in('edition_number', numbers)
  },

  async claimEdition(slug, sessionId) {
    const { data, error } = await supabase().rpc('claim_edition', {
      product_slug: slug, session_id: sessionId,
    })
    if (error) return { data: null, error }
    const row = Array.isArray(data) ? data[0] : data
    return { data: row || null, error: null }
  },

  async setEditionStatus(slug, editionNumber, status, at) {
    const { data, error } = await supabase().from('editions')
      .update({ status, updated_at: at })
      .eq('slug', slug).eq('edition_number', editionNumber)
      .select('slug, edition_number, status')
    return { data: data?.[0] || null, error }
  },

  async releaseReservation(slug, editionNumber, at) {
    const { data, error } = await supabase().from('editions')
      .update({ reserved_by: null, reserved_at: null, updated_at: at })
      .eq('slug', slug).eq('edition_number', editionNumber)
      .not('reserved_by', 'is', null)
      .select('slug, edition_number, status')
    return { data: data?.[0] || null, error }
  },

  async releaseReservationBySession(slug, sessionId, at) {
    const { error } = await supabase().from('editions')
      .update({ reserved_by: null, reserved_at: null, updated_at: at })
      .eq('slug', slug).eq('reserved_by', sessionId)
    return { data: null, error }
  },

  async insertSales(rows) {
    const { error } = await supabase().from('sales').insert(rows)
    return { data: null, error }
  },

  listPendingSales(limit) {
    return supabase().from('sales')
      .select('id, order_number, slug, edition_number, buyer_name, buyer_email, created_at')
      .is('shipped_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)
  },

  getPendingSalesByIds(ids) {
    return supabase().from('sales')
      .select('id, order_number, slug, buyer_name, buyer_email, stripe_session')
      .in('id', ids).is('shipped_at', null)
  },

  async shipSale(id, editionNumber, shippedAt) {
    const { data, error } = await supabase().from('sales')
      .update({ edition_number: editionNumber, shipped_at: shippedAt })
      .eq('id', id).is('shipped_at', null)
      .select('id, order_number, slug, edition_number, buyer_name, buyer_email')
    return { data: data?.[0] || null, error }
  },
}

// ═════════════════════════════════════════════════════════════════════════════
// Google Sheets driver
// ═════════════════════════════════════════════════════════════════════════════
// Two tabs, one row per record. Postgres constraints have no equivalent here,
// so the invariants the schema used to guarantee are enforced in code below —
// and where they cannot be (see claimEdition), the limitation is documented
// rather than papered over.
const EDITIONS_TAB = 'editions'
const SALES_TAB = 'sales'

const sheets = () => require('./_sheets.js')

// Sheets hands back strings and drops trailing blanks; normalise to the types
// the handlers were written against so a driver swap is invisible to them.
function edition(row) {
  return {
    _row:           row._row,
    slug:           row.slug,
    edition_number: Number(row.edition_number),
    status:         row.status || 'available',
    reserved_by:    row.reserved_by || null,
    reserved_at:    row.reserved_at || null,
  }
}

function sale(row) {
  return {
    _row:           row._row,
    id:             row.id,
    slug:           row.slug,
    edition_number: row.edition_number === '' ? null : Number(row.edition_number),
    order_number:   row.order_number,
    buyer_email:    row.buyer_email || null,
    buyer_name:     row.buyer_name || null,
    stripe_session: row.stripe_session || null,
    created_at:     row.created_at,
    shipped_at:     row.shipped_at || null,
  }
}

function isSellable(box) {
  return SELLABLE.has(box.status) && !box.reserved_by
}

// Any thrown Sheets/auth failure becomes the { data, error } the callers expect.
async function guard(fn) {
  try {
    return { data: await fn(), error: null }
  } catch (err) {
    return { data: null, error: { message: err.message } }
  }
}

async function loadEditions() {
  const { header, rows } = await sheets().readTab(EDITIONS_TAB)
  return { header, boxes: sheets().toObjects(header, rows).map(edition) }
}

async function loadSales() {
  const { header, rows } = await sheets().readTab(SALES_TAB)
  return { header, sales: sheets().toObjects(header, rows).map(sale) }
}

// Write back only the columns this driver owns, preserving anything else the
// owner has added by hand to the sheet (notes, a shipping-carrier column…).
async function patchRow(tab, header, rowNumber, patch) {
  const current = await sheets().readRow(tab, header, rowNumber)
  await sheets().writeRow(tab, header, rowNumber, { ...current, ...patch })
}

const sheetsDriver = {
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

  listEditions() {
    return guard(async () => {
      const { boxes } = await loadEditions()
      return boxes
        .sort((a, b) => a.slug.localeCompare(b.slug) || a.edition_number - b.edition_number)
        .map(({ slug, edition_number, status, reserved_by }) =>
          ({ slug, edition_number, status, reserved_by }))
    })
  },

  getEditionBoxes(slugs, numbers) {
    return guard(async () => {
      const wantSlug = new Set(slugs)
      const wantNumber = new Set(numbers.map(Number))
      const { boxes } = await loadEditions()
      return boxes
        .filter(b => wantSlug.has(b.slug) && wantNumber.has(b.edition_number))
        .map(({ slug, edition_number, status, reserved_by }) =>
          ({ slug, edition_number, status, reserved_by }))
    })
  },

  // The one place Postgres did something Sheets cannot: claim_edition held a
  // row lock, so two simultaneous checkouts for the last print could never
  // both win. Sheets has no compare-and-swap, so this reads, writes, and then
  // reads the row back to confirm the reservation is ours; a loser retries on
  // the next free box. That closes the common race but not a write landing
  // between our write and our read-back. At this shop's volume (a handful of
  // sales a week, six independent designs) a genuine collision needs two
  // checkouts of the SAME design within about a second — and the pack-time
  // duplicate-edition check in api/ship.js catches the result before any
  // print is mislabelled.
  claimEdition(slug, sessionId) {
    return guard(async () => {
      const { header, boxes } = await loadEditions()
      const mine = boxes.filter(b => b.slug === slug)

      const remaining = () => mine.filter(isSellable).length

      // Idempotent across Stripe retries: an existing reservation wins.
      const held = mine.find(b => b.reserved_by === sessionId)
      if (held) return { claimed: held.edition_number, remaining: remaining() }

      const now = new Date().toISOString()
      const free = mine.filter(isSellable).sort((a, b) => a.edition_number - b.edition_number)

      for (const box of free) {
        await patchRow(EDITIONS_TAB, header, box._row, {
          reserved_by: sessionId, reserved_at: now, updated_at: now,
        })
        const confirmed = edition(await sheets().readRow(EDITIONS_TAB, header, box._row))
        if (confirmed.reserved_by === sessionId) {
          box.reserved_by = sessionId  // so remaining() counts it as taken
          return { claimed: box.edition_number, remaining: remaining() }
        }
        // Another checkout got there first — mark it taken and try the next.
        box.reserved_by = confirmed.reserved_by
      }
      return { claimed: null, remaining: 0 }
    })
  },

  setEditionStatus(slug, editionNumber, status, at) {
    return guard(async () => {
      const { header, boxes } = await loadEditions()
      const box = boxes.find(b => b.slug === slug && b.edition_number === Number(editionNumber))
      if (!box) return null
      await patchRow(EDITIONS_TAB, header, box._row, { status, updated_at: at })
      return { slug, edition_number: box.edition_number, status }
    })
  },

  releaseReservation(slug, editionNumber, at) {
    return guard(async () => {
      const { header, boxes } = await loadEditions()
      const box = boxes.find(b => b.slug === slug && b.edition_number === Number(editionNumber))
      if (!box || !box.reserved_by) return null   // matches the .not(...) filter
      await patchRow(EDITIONS_TAB, header, box._row, {
        reserved_by: '', reserved_at: '', updated_at: at,
      })
      return { slug, edition_number: box.edition_number, status: box.status }
    })
  },

  releaseReservationBySession(slug, sessionId, at) {
    return guard(async () => {
      const { header, boxes } = await loadEditions()
      const updates = boxes
        .filter(b => b.slug === slug && b.reserved_by === sessionId)
        .map(b => ({ rowNumber: b._row, obj: { reserved_by: '', reserved_at: '', updated_at: at } }))
      for (const { rowNumber, obj } of updates) {
        await patchRow(EDITIONS_TAB, header, rowNumber, obj)
      }
      return null
    })
  },

  insertSales(rows) {
    return guard(async () => {
      const { header } = await sheets().readTab(SALES_TAB)
      const now = new Date().toISOString()
      await sheets().appendRows(SALES_TAB, header, rows.map(row => ({
        id:         crypto.randomUUID(),
        created_at: now,
        shipped_at: '',
        ...row,
      })))
      return null
    })
  },

  listPendingSales(limit) {
    return guard(async () => {
      const { sales } = await loadSales()
      return sales
        .filter(s => !s.shipped_at)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit)
        .map(({ id, order_number, slug, edition_number, buyer_name, buyer_email, created_at }) =>
          ({ id, order_number, slug, edition_number, buyer_name, buyer_email, created_at }))
    })
  },

  getPendingSalesByIds(ids) {
    return guard(async () => {
      const want = new Set(ids.map(String))
      const { sales } = await loadSales()
      return sales
        .filter(s => want.has(String(s.id)) && !s.shipped_at)
        .map(({ id, order_number, slug, buyer_name, buyer_email, stripe_session }) =>
          ({ id, order_number, slug, buyer_name, buyer_email, stripe_session }))
    })
  },

  shipSale(id, editionNumber, shippedAt) {
    return guard(async () => {
      const { header, sales } = await loadSales()
      const row = sales.find(s => String(s.id) === String(id) && !s.shipped_at)
      if (!row) return null   // already shipped, or gone — same as the SQL guard
      await patchRow(SALES_TAB, header, row._row, {
        edition_number: editionNumber, shipped_at: shippedAt,
      })
      return {
        id:             row.id,
        order_number:   row.order_number,
        slug:           row.slug,
        edition_number: editionNumber,
        buyer_name:     row.buyer_name,
        buyer_email:    row.buyer_email,
      }
    })
  },
}

// ═════════════════════════════════════════════════════════════════════════════
const DRIVERS = { sheets: sheetsDriver, supabase: supabaseDriver }

function store() {
  const driver = DRIVERS[backend()]
  if (!driver) {
    throw new Error(`Unknown STORE_BACKEND '${backend()}' — use 'sheets' or 'supabase'`)
  }
  return driver
}

module.exports = { store, backend }
