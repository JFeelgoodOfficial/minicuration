'use strict'
// Shared by api/webhook.js (records the sale), api/ship.js (assigns the
// edition number and tells the buyer) and api/editions.js (the admin
// inventory grid). Underscore prefix keeps Vercel from exposing this as a
// route of its own.
//
// Storage lives behind api/_store.js — Google Sheets by default, Supabase when
// STORE_BACKEND says so. Nothing in here knows which.
const crypto = require('crypto')
const { Resend } = require('resend')
const { store, backend } = require('./_store.js')
const { PRODUCT_NAMES, EDITION_SIZE, EDITION_STATUSES } = require('./_constants.js')

// ── Lazy singleton (re-used across warm invocations) ─────────────────────────
let _resend
function resend() { return _resend ||= new Resend(process.env.RESEND_API_KEY) }

// ── Email addresses ──────────────────────────────────────────────────────────
// support@ is the only real mailbox on the domain, so buyers replying to a
// fulfillment email actually reach someone.
const STORE_EMAIL = 'Minicuration <support@minicuration.com>'
function notifyEmail() { return process.env.ORDER_NOTIFY_EMAIL || 'support@minicuration.com' }

// ── Admin auth ────────────────────────────────────────────────────────────────
// Shared by api/ship.js and api/editions.js. Timing-safe so the token can't be
// recovered by measuring response times.
function checkAdminToken(supplied) {
  const expected = process.env.ADMIN_TOKEN
  if (!expected || !supplied) return false
  const a = Buffer.from(String(supplied))
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body)
  return new Promise(resolve => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

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
  store,
  backend,
  resend,
  sendMail,
  notifyEmail,
  orderNumberFrom,
  parseEditionNumber,
  checkAdminToken,
  readJsonBody,
  STORE_EMAIL,
  PRODUCT_NAMES,
  EDITION_SIZE,
  EDITION_STATUSES,
}
