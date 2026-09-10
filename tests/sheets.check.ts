import { test, expect } from '@playwright/test'

// Every other test stubs api/_sheets.js wholesale, which is how a deleted
// function once shipped: nothing loaded the real module, so `accessToken is
// not defined` only surfaced in production. These tests drive the real client
// end to end against a stubbed network — signing a JWT, exchanging it for a
// token, and using that token on a Sheets request.
//
/* eslint-disable @typescript-eslint/no-var-requires */
const crypto = require('crypto')
const SHEETS_PATH = require.resolve('../api/_sheets.js')

const { privateKey: PEM } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

type Call = { url: string; headers: Record<string, string>; body?: string }

// Answers the two endpoints the client talks to, recording what it was sent.
function stubNetwork(values: string[][] = [['slug', 'edition_number'], ['veritas', '1']]) {
  const calls: Call[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: URL | string, init: RequestInit = {}) => {
    const href = String(url)
    calls.push({ href, url: href, headers: (init.headers || {}) as Record<string, string>,
                 body: init.body ? String(init.body) : undefined } as Call)
    if (href.includes('oauth2.googleapis.com')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok-abc123', expires_in: 3600 }) }
    }
    return { ok: true, status: 200, json: async () => ({ values }) }
  }) as typeof fetch
  return { calls, restore: () => { globalThis.fetch = realFetch } }
}

function freshClient() {
  delete require.cache[SHEETS_PATH]
  process.env.GOOGLE_SHEETS_ID = 'sheet-123'
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'bot@p.iam.gserviceaccount.com'
  process.env.GOOGLE_PRIVATE_KEY = PEM
  return require('../api/_sheets.js')
}

test.describe('sheets client — the real request path', () => {
  test('signs a JWT, gets a token, and reads a tab with it', async () => {
    const net = stubNetwork()
    try {
      const { header, rows } = await freshClient().readTab('editions')
      expect(header).toEqual(['slug', 'edition_number'])
      expect(rows).toEqual([['veritas', '1']])

      const [token, read] = net.calls
      expect(token.url).toContain('oauth2.googleapis.com')

      // The assertion must be a real three-part JWT whose signature verifies.
      const assertion = new URLSearchParams(token.body).get('assertion')!
      const [h, c, sig] = assertion.split('.')
      expect(sig).toBeTruthy()
      const verified = crypto.createVerify('RSA-SHA256').update(`${h}.${c}`)
        .verify(crypto.createPublicKey(PEM), Buffer.from(sig, 'base64url'))
      expect(verified, 'the JWT signature must verify against the key').toBe(true)

      const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
      expect(claims.iss).toBe('bot@p.iam.gserviceaccount.com')
      expect(claims.scope).toContain('spreadsheets')

      expect(read.url).toContain('sheet-123')
      expect(read.headers.Authorization).toBe('Bearer tok-abc123')
    } finally { net.restore() }
  })

  test('re-uses the token rather than signing on every request', async () => {
    const net = stubNetwork()
    try {
      const client = freshClient()
      await client.readTab('editions')
      await client.readTab('sales')
      expect(net.calls.filter(c => c.url.includes('oauth2')).length).toBe(1)
    } finally { net.restore() }
  })

  test('every function the module calls actually exists', async () => {
    // The direct guard against the regression: exercising each exported entry
    // point would have thrown ReferenceError when accessToken went missing.
    const net = stubNetwork()
    try {
      const client = freshClient()
      await client.readTab('editions')
      await client.readRow('editions', ['slug'], 2)
      await client.call('', { query: { fields: 'sheets.properties.title' } })
      await client.writeRow('editions', ['slug'], 2, { slug: 'veritas' })
      await client.appendRows('sales', ['id'], [{ id: 'x' }])
      await client.writeRows('editions', ['slug'], [{ rowNumber: 2, obj: { slug: 'v' } }])
      expect(client.columnLetter(27)).toBe('AA')
    } finally { net.restore() }
  })

  test('a missing service-account email is named, not left to crypto', async () => {
    const net = stubNetwork()
    try {
      delete require.cache[SHEETS_PATH]
      process.env.GOOGLE_SHEETS_ID = 'sheet-123'
      process.env.GOOGLE_PRIVATE_KEY = PEM
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      await expect(require('../api/_sheets.js').readTab('editions'))
        .rejects.toThrow(/GOOGLE_SERVICE_ACCOUNT_EMAIL is not set/)
    } finally { net.restore() }
  })
})
