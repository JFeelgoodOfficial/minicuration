#!/usr/bin/env node
/* eslint-env node */
'use strict'
/* One-off maintenance script.
 *
 * Stripe Payment Links show a generic Stripe confirmation page after payment by
 * default, so the buyer never returns to the site. This script points every
 * active Payment Link at the on-site /thanks page (newsletter capture + second
 * card pitch), which is how we reclaim the buyer after the Stripe handoff.
 *
 * Run once (and again whenever you add a Payment Link):
 *
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/set-stripe-redirects.js
 *
 * Pass --dry to preview without writing.
 */
const Stripe = require('stripe')

const REDIRECT_URL = 'https://minicuration.com/thanks.html'
const DRY = process.argv.includes('--dry')

async function main() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    console.error('STRIPE_SECRET_KEY is not set. Aborting.')
    process.exit(1)
  }
  const stripe = new Stripe(key)

  let updated = 0
  let scanned = 0
  for await (const link of stripe.paymentLinks.list({ limit: 100 })) {
    scanned++
    if (!link.active) continue
    const current = link.after_completion
    const alreadySet =
      current &&
      current.type === 'redirect' &&
      current.redirect &&
      current.redirect.url === REDIRECT_URL
    if (alreadySet) {
      console.error('already set: ' + link.id)
      continue
    }
    if (DRY) {
      console.error('would update ' + link.id + ' -> ' + REDIRECT_URL)
      updated++
      continue
    }
    await stripe.paymentLinks.update(link.id, {
      after_completion: { type: 'redirect', redirect: { url: REDIRECT_URL } }
    })
    console.error('updated ' + link.id + ' -> ' + REDIRECT_URL)
    updated++
  }

  console.error('\nScanned ' + scanned + ' payment link(s); ' + (DRY ? 'would update ' : 'updated ') + updated + '.')
}

main().catch(function (err) {
  console.error(err.message)
  process.exit(1)
})
