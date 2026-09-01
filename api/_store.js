'use strict'
// Every database call in api/ goes through this module. The backend is Neon
// (serverless Postgres) over its HTTP driver, which suits Vercel functions:
// no connection pool to keep warm, no TCP handshake per cold start.
//
// The schema is scripts/neon-schema.sql. Functions here return Postgres's
// answer as { data, error } so a caller branches on `error` rather than
// wrapping every call in try/catch — the handlers all read that way.
const { neon } = require('@neondatabase/serverless')

// Lazy singleton, re-used across warm invocations.
let _sql
function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    _sql = neon(process.env.DATABASE_URL)
  }
  return _sql
}

// A dropped connection or a bad query must not take the function down with an
// unhandled rejection — the callers all render a 500 from `error` instead.
async function guard(fn) {
  try {
    return { data: await fn(db()), error: null }
  } catch (err) {
    return { data: null, error: { message: err.message } }
  }
}

const store = {
  // ── Inventory ──────────────────────────────────────────────────────────────
  listStock() {
    return guard(sql => sql`select slug, stock from public_stock`)
  },

  listEditions() {
    return guard(sql => sql`
      select slug, edition_number, status, reserved_by
        from editions
       order by slug, edition_number`)
  },

  getEditionBoxes(slugs, numbers) {
    return guard(sql => sql`
      select slug, edition_number, status, reserved_by
        from editions
       where slug = any(${slugs}::text[])
         and edition_number = any(${numbers}::int[])`)
  },

  // Atomic: the whole claim happens inside one plpgsql call holding a row
  // lock, so two simultaneous checkouts for the last print cannot both win.
  async claimEdition(slug, sessionId) {
    const { data, error } = await guard(sql =>
      sql`select claimed, remaining from claim_edition(${slug}, ${sessionId})`)
    if (error) return { data: null, error }
    return { data: data[0] || null, error: null }
  },

  async setEditionStatus(slug, editionNumber, status, at) {
    const { data, error } = await guard(sql => sql`
      update editions
         set status = ${status}, updated_at = ${at}
       where slug = ${slug} and edition_number = ${editionNumber}
      returning slug, edition_number, status`)
    return { data: data?.[0] || null, error }
  },

  // Only ever releases a box that IS reserved, so the admin page can tell a
  // real release from a no-op and answer 409 for the second click.
  async releaseReservation(slug, editionNumber, at) {
    const { data, error } = await guard(sql => sql`
      update editions
         set reserved_by = null, reserved_at = null, updated_at = ${at}
       where slug = ${slug} and edition_number = ${editionNumber}
         and reserved_by is not null
      returning slug, edition_number, status`)
    return { data: data?.[0] || null, error }
  },

  releaseReservationBySession(slug, sessionId, at) {
    return guard(sql => sql`
      update editions
         set reserved_by = null, reserved_at = null, updated_at = ${at}
       where slug = ${slug} and reserved_by = ${sessionId}`)
  },

  // ── Sales ledger ───────────────────────────────────────────────────────────
  // One statement for the whole order: a six-pack inserts six rows in a single
  // round trip, and either all of them land or none do.
  insertSales(rows) {
    return guard(sql => sql`
      insert into sales (slug, edition_number, order_number, buyer_email, buyer_name, stripe_session)
      select * from unnest(
        ${rows.map(r => r.slug)}::text[],
        ${rows.map(r => r.edition_number)}::int[],
        ${rows.map(r => r.order_number)}::text[],
        ${rows.map(r => r.buyer_email ?? null)}::text[],
        ${rows.map(r => r.buyer_name ?? null)}::text[],
        ${rows.map(r => r.stripe_session ?? null)}::text[]
      )`)
  },

  listPendingSales(limit) {
    return guard(sql => sql`
      select id, order_number, slug, edition_number, buyer_name, buyer_email, created_at
        from sales
       where shipped_at is null
       order by created_at desc
       limit ${limit}`)
  },

  getPendingSalesByIds(ids) {
    return guard(sql => sql`
      select id, order_number, slug, buyer_name, buyer_email, stripe_session
        from sales
       where id = any(${ids}::text[]) and shipped_at is null`)
  },

  // The `shipped_at is null` guard is what stops a second submit from
  // re-emailing the buyer: the second update matches no row and returns null.
  async shipSale(id, editionNumber, shippedAt) {
    const { data, error } = await guard(sql => sql`
      update sales
         set edition_number = ${editionNumber}, shipped_at = ${shippedAt}
       where id = ${id} and shipped_at is null
      returning id, order_number, slug, edition_number, buyer_name, buyer_email`)
    return { data: data?.[0] || null, error }
  },
}

module.exports = { store: () => store }
