#!/usr/bin/env node
'use strict'
// Post-migration health check against the live Neon database.
//
//   DATABASE_URL=… node scripts/neon-verify.js [--claim-test]
//
// Read-only by default. --claim-test additionally reserves a real box on a
// scratch session and releases it again, which is the only way to prove
// claim_edition's locking and idempotency actually work in this database.
// It always releases what it claimed, including on failure.
const { neon } = require('@neondatabase/serverless')
const { PRODUCT_NAMES, EDITION_SIZE } = require('../api/_constants.js')

const SCRATCH_SESSION = 'cs_verify_scratch_do_not_ship'
let failures = 0

function check(name, ok, detail) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function readOnlyChecks(sql) {
  console.log('Grid')
  const counts = await sql`select slug, count(*)::int as boxes from editions group by slug order by slug`
  const bySlug = Object.fromEntries(counts.map(r => [r.slug, r.boxes]))
  for (const slug of Object.keys(PRODUCT_NAMES)) {
    check(`${slug} has ${EDITION_SIZE} boxes`, bySlug[slug] === EDITION_SIZE,
      bySlug[slug] == null ? 'no rows at all' : `found ${bySlug[slug]}`)
  }

  console.log('\nStock')
  const stock = await sql`select slug, stock from public_stock order by slug`
  check('public_stock returns a row per design', stock.length === Object.keys(PRODUCT_NAMES).length,
    `${stock.length} rows`)
  for (const row of stock) console.log(`       ${row.slug.padEnd(22)} ${row.stock} sellable`)

  console.log('\nLedger')
  const [{ pending }] = await sql`select count(*)::int as pending from sales where shipped_at is null`
  console.log(`       ${pending} order line(s) waiting to be packed`)

  // A box reserved by a session that has no unpacked sale is a refunded or
  // abandoned checkout silently holding stock — releasable from admin.html.
  const dangling = await sql`
    select e.slug, e.edition_number, e.reserved_by
      from editions e
     where e.reserved_by is not null
       and not exists (select 1 from sales s
                        where s.stripe_session = e.reserved_by and s.shipped_at is null)
     order by e.slug, e.edition_number`
  check('no reservations without a pending order', dangling.length === 0,
    dangling.map(r => `${r.slug} #${r.edition_number}`).join(', ') || undefined)

  // The same physical print recorded as shipped twice means a buyer was told a
  // number someone else also holds.
  const dupes = await sql`
    select slug, edition_number, count(*)::int as n
      from sales
     where shipped_at is not null and edition_number is not null
     group by slug, edition_number having count(*) > 1`
  check('no edition shipped to two buyers', dupes.length === 0,
    dupes.map(r => `${r.slug} #${r.edition_number} ×${r.n}`).join(', ') || undefined)

  // Anything still reserved by a previous interrupted run of this script.
  const leftovers = await sql`select slug, edition_number from editions where reserved_by = ${SCRATCH_SESSION}`
  check('no leftover scratch reservations', leftovers.length === 0,
    leftovers.map(r => `${r.slug} #${r.edition_number}`).join(', ') || undefined)
}

async function claimTest(sql) {
  console.log('\nclaim_edition (writes, then rolls itself back)')
  const [{ slug }] = await sql`select slug from public_stock where stock > 0 order by stock desc limit 1`
  if (!slug) return check('a design with stock to test against', false, 'everything is sold out')

  const before = await sql`select stock from public_stock where slug = ${slug}`

  const [first] = await sql`select claimed, remaining from claim_edition(${slug}, ${SCRATCH_SESSION})`
  check(`claims a box of ${slug}`, first.claimed != null, `got #${first.claimed}`)

  const [again] = await sql`select claimed, remaining from claim_edition(${slug}, ${SCRATCH_SESSION})`
  check('a repeat claim returns the same box (Stripe retry safety)',
    again.claimed === first.claimed, `#${again.claimed} vs #${first.claimed}`)

  const during = await sql`select stock from public_stock where slug = ${slug}`
  check('the reservation removes the box from public stock',
    during[0].stock === before[0].stock - 1, `${before[0].stock} → ${during[0].stock}`)

  const released = await sql`
    update editions set reserved_by = null, reserved_at = null, updated_at = now()
     where slug = ${slug} and reserved_by = ${SCRATCH_SESSION} returning edition_number`
  check('the scratch reservation is released', released.length === 1)

  const after = await sql`select stock from public_stock where slug = ${slug}`
  check('stock returns to where it started', after[0].stock === before[0].stock,
    `${before[0].stock} → ${after[0].stock}`)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const sql = neon(process.env.DATABASE_URL)

  const started = Date.now()
  await sql`select 1`
  console.log(`Connected in ${Date.now() - started}ms (a cold Neon compute takes a moment to wake)\n`)

  await readOnlyChecks(sql)

  if (process.argv.includes('--claim-test')) {
    try {
      await claimTest(sql)
    } finally {
      // Never leave a real box held by this script.
      const stuck = await sql`
        update editions set reserved_by = null, reserved_at = null
         where reserved_by = ${SCRATCH_SESSION} returning slug, edition_number`
      if (stuck.length) {
        console.log(`\nCleaned up ${stuck.length} scratch reservation(s): ` +
          stuck.map(r => `${r.slug} #${r.edition_number}`).join(', '))
      }
    }
  } else {
    console.log('\n(read-only — pass --claim-test to exercise claim_edition too)')
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch(err => { console.error(err.message); process.exit(1) })
