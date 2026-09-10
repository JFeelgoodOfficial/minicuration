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
async function sendMail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY || !to) return false
  try {
    await resend().emails.send({ from: STORE_EMAIL, to, subject, html })
    return true
  } catch (err) {
    console.error(`Email failed (${subject}):`, err.message)
    return false
  }
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
