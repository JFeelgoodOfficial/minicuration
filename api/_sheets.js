'use strict'
// Minimal Google Sheets v4 client — where the shop's inventory and orders live
// (see api/_store.js).
//
// Deliberately dependency-free: a service-account JWT is ~30 lines of crypto
// and avoids pulling googleapis (and its cold-start cost) into every Vercel
// function. Only the four calls the store actually needs are implemented.
const crypto = require('crypto')

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://sheets.googleapis.com/v4/spreadsheets'

// ── Auth ─────────────────────────────────────────────────────────────────────
// Access tokens last an hour; cached on the warm invocation and refreshed a
// minute early so a token never expires mid-request.
let _token = null   // { value, expiresAt }

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Vercel's env UI stores newlines as the two characters \n, so unescape them.
function privateKey() {
  const key = process.env.GOOGLE_PRIVATE_KEY
  if (!key) throw new Error('GOOGLE_PRIVATE_KEY is not set')
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key
}

async function accessToken() {
  if (_token && _token.expiresAt > Date.now()) return _token.value

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  if (!email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set')

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }))
  const signature = base64url(
    crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey()))

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Google token request failed (${res.status}): ${body.error_description || body.error || 'unknown'}`)
  }
  _token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 }
  return _token.value
}

function spreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_ID
  if (!id) throw new Error('GOOGLE_SHEETS_ID is not set')
  return id
}

async function call(path, { method = 'GET', query, body } = {}) {
  const url = new URL(`${API}/${spreadsheetId()}${path}`)
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v)

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Sheets ${method} ${path} failed (${res.status}): ${json.error?.message || 'unknown'}`)
  }
  return json
}

// ── Values ───────────────────────────────────────────────────────────────────
// Every tab is read whole: 300 edition rows and a sales ledger of the same
// order of magnitude are a single sub-100KB response, so paging would add
// round trips for nothing.
async function readTab(tab) {
  const { values } = await call(`/values/${encodeURIComponent(tab)}`, {
    query: { majorDimension: 'ROWS' },
  })
  const [header = [], ...rows] = values || []
  return { header, rows }
}

// Sheets omits trailing empty cells, so short rows are padded to the header.
function toObjects(header, rows) {
  return rows.map((cells, i) => {
    const obj = { _row: i + 2 }  // +2: 1-indexed sheet, row 1 is the header
    header.forEach((name, col) => { obj[name] = cells[col] ?? '' })
    return obj
  })
}

function toCells(header, obj) {
  return header.map(name => (obj[name] == null ? '' : String(obj[name])))
}

// A1 range for a whole row: 'editions'!A7:F7
function rowRange(tab, header, rowNumber) {
  return `${tab}!A${rowNumber}:${columnLetter(header.length)}${rowNumber}`
}

function columnLetter(n) {
  let letter = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    n = Math.floor((n - 1) / 26)
  }
  return letter
}

async function writeRow(tab, header, rowNumber, obj) {
  await call(`/values/${encodeURIComponent(rowRange(tab, header, rowNumber))}`, {
    method: 'PUT',
    query: { valueInputOption: 'RAW' },
    body: { values: [toCells(header, obj)] },
  })
}

async function writeRows(tab, header, updates) {
  if (!updates.length) return
  await call('/values:batchUpdate', {
    method: 'POST',
    body: {
      valueInputOption: 'RAW',
      data: updates.map(({ rowNumber, obj }) => ({
        range: rowRange(tab, header, rowNumber),
        values: [toCells(header, obj)],
      })),
    },
  })
}

async function appendRows(tab, header, objects) {
  if (!objects.length) return
  await call(`/values/${encodeURIComponent(tab)}:append`, {
    method: 'POST',
    query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
    body: { values: objects.map(obj => toCells(header, obj)) },
  })
}

// Read one row back by its sheet row number — used to confirm a write landed
// before acting on it (see claimEdition's reservation check).
async function readRow(tab, header, rowNumber) {
  const { values } = await call(
    `/values/${encodeURIComponent(rowRange(tab, header, rowNumber))}`)
  return toObjects(header, values || [[]])[0]
}

module.exports = {
  call, readTab, readRow, toObjects, writeRow, writeRows, appendRows, columnLetter,
}
