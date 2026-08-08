'use strict'
// Shared by api/webhook.js (records the sale) and api/ship.js (assigns the
// edition number and tells the buyer). Underscore prefix keeps Vercel from
// exposing this as a route of its own.
const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

// ── Lazy singletons (re-used across warm invocations) ────────────────────────
let _supabase, _resend
function supabase() {
  return _supabase ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}
function resend() { return _resend ||= new Resend(process.env.RESEND_API_KEY) }

// ── Email addresses ──────────────────────────────────────────────────────────
// support@ is the only real mailbox on the domain, so buyers replying to a
// fulfillment email actually reach someone.
const STORE_EMAIL = 'Minicuration <support@minicuration.com>'
function notifyEmail() { return process.env.ORDER_NOTIFY_EMAIL || 'support@minicuration.com' }

const PRODUCT_NAMES = {
  'dreamfall':           'Dreamfall',
  'dream-mountain':      'Dream Mountain',
  'sky-miles':           'Sky Miles',
  'a-simple-meditation': 'A Simple Meditation',
  'veritas':             'Veritas',
  'sweet-dreams':        'Sweet Dreams',
}

const EDITION_SIZE = 50

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

// ── Edition numbers ───────────────────────────────────────────────────────────
// The number written on the print the owner physically packs. It is NOT
// derivable from the stock counter: a missed webhook, a hand-sold print, or
// packing out of order all put the counter out of step with the box of prints.
// So it is only ever accepted as explicit input, and validated here.
function parseEditionNumber(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > EDITION_SIZE) {
    return { ok: false, error: `edition number must be a whole number from 1 to ${EDITION_SIZE}` }
  }
  return { ok: true, editionNumber: n }
}

module.exports = {
  supabase,
  resend,
  sendMail,
  notifyEmail,
  orderNumberFrom,
  parseEditionNumber,
  STORE_EMAIL,
  PRODUCT_NAMES,
  EDITION_SIZE,
}
