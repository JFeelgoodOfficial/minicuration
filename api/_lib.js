'use strict'
// Shared by api/webhook.js and api/stock.js. The underscore prefix keeps Vercel
// from exposing this as a route of its own.
//
// Inventory lives behind api/_store.js (a Google Spreadsheet). Nothing in here
// touches it directly.
const { Resend } = require('resend')
const { store } = require('./_store.js')
const { PRODUCT_NAMES, EDITION_SIZE, EDITION_STATUSES } = require('./_constants.js')

// ── Lazy singleton (re-used across warm invocations) ─────────────────────────
let _resend
function resend() { return _resend ||= new Resend(process.env.RESEND_API_KEY) }

// ── Email addresses ──────────────────────────────────────────────────────────
// support@ is the only real mailbox on the domain, so buyers replying to a
// fulfillment email actually reach someone.
const STORE_EMAIL = 'Minicuration <support@minicuration.com>'
function notifyEmail() { return process.env.ORDER_NOTIFY_EMAIL || 'support@minicuration.com' }

// ── Order numbers ─────────────────────────────────────────────────────────────
// Derived from the Stripe session rather than a counter: no extra table, no
// race between concurrent checkouts, and the number always traces back to one
// session. cs_live_a1b2c3d4e5f6 → MC-C3D4E5F6.
function orderNumberFrom(sessionId) {
  return 'MC-' + String(sessionId || '').slice(-8).toUpperCase()
}

// ── Email ─────────────────────────────────────────────────────────────────────
// A failed send must never fail its caller: in the webhook, returning an error
// to Stripe would trigger a retry and decrement stock a second time.
//
// The Resend SDK reports API failures (rate limit, unverified domain, bad
// address) as { error } rather than throwing, so both paths are checked. A
// rate-limited send is retried once, since the webhook sends two emails
// back to back and the owner's is the second.
async function sendMail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.error(`Email skipped (${subject}): RESEND_API_KEY is not set`)
    return false
  }
  if (!to) {
    console.error(`Email skipped (${subject}): no recipient`)
    return false
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await resend().emails.send({ from: STORE_EMAIL, to, subject, html })
      if (!error) {
        console.log(`Email sent (${subject}) id=${data?.id}`)
        return true
      }
      console.error(`Email failed (${subject}), attempt ${attempt}:`, error.name, error.message)
      if (error.name !== 'rate_limit_exceeded') return false
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.error(`Email failed (${subject}):`, err.message)
      return false
    }
  }
  return false
}

module.exports = {
  store,
  resend,
  sendMail,
  notifyEmail,
  orderNumberFrom,
  STORE_EMAIL,
  PRODUCT_NAMES,
  EDITION_SIZE,
  EDITION_STATUSES,
}
