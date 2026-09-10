import { test, expect } from '@playwright/test'

// /api/stock answers the same URL two ways: a browser navigating to it gets a
// page, while js/store.js and jfeelgood.com's Collect section call it with
// fetch() and must keep getting JSON. Getting that wrong silently breaks live
// stock on every product page, so it is pinned down here.
//
/* eslint-disable @typescript-eslint/no-var-requires */
const STORE = require.resolve('../api/_store.js')
const STOCK = require.resolve('../api/stock.js')

const INVENTORY = [
  { slug: 'dreamfall', stock: 50 }, { slug: 'dream-mountain', stock: 37 },
  { slug: 'sky-miles', stock: 12 }, { slug: 'a-simple-meditation', stock: 1 },
  { slug: 'veritas', stock: 0 }, { slug: 'sweet-dreams', stock: 44 },
]

type Result = { status: number; body: unknown; headers: Record<string, string> }

async function request(
  { accept = '*/*', url = '/api/stock', origin = '', fail = null as string | null } = {},
): Promise<Result> {
  require.cache[STORE] = {
    id: STORE, filename: STORE, loaded: true,
    exports: {
      store: () => ({
        listStock: async () => (fail
          ? { data: null, error: { message: 'boom', reason: fail } }
          : { data: INVENTORY, error: null }),
      }),
    },
  } as never
  delete require.cache[STOCK]
  const handler = require('../api/stock.js')
  // The stub must not outlive this call: other suites require the real
  // api/_store.js from the same module registry.
  const cleanUp = () => { delete require.cache[STORE]; delete require.cache[STOCK] }

  const headers: Record<string, string> = {}
  let status = 200
  let body: unknown
  const res = {
    setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v },
    status: (code: number) => { status = code; return res },
    json: (payload: unknown) => { body = payload; return res },
    send: (payload: unknown) => { body = payload; return res },
    end: () => res,
  }
  try {
    await handler({ method: 'GET', url, headers: { accept, ...(origin ? { origin } : {}) } }, res)
  } finally {
    cleanUp()
  }
  return { status, body, headers }
}

test.describe('/api/stock — who gets JSON, who gets a page', () => {
  test('fetch() gets JSON, exactly as js/store.js expects', async () => {
    const { status, body, headers } = await request({ accept: '*/*' })
    expect(status).toBe(200)
    expect(headers['content-type']).toBeUndefined()   // res.json sets it
    const inv = body as Record<string, { stock: number; soldOut: boolean }>
    expect(inv.dreamfall).toEqual({ stock: 50, soldOut: false })
    expect(inv.veritas).toEqual({ stock: 0, soldOut: true })
  })

  test('a browser navigating gets the page', async () => {
    const { status, body, headers } = await request({
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    })
    expect(status).toBe(200)
    expect(headers['content-type']).toContain('text/html')
    const html = String(body)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Editions Remaining')
    expect(html).toContain('Sweet Dreams')
    expect(html).toContain('Sold out')            // veritas
    expect(html).toContain('/css/base.css')       // the site's real styles
  })

  test('?format=json forces JSON even from a browser', async () => {
    const { body, headers } = await request({ accept: 'text/html', url: '/api/stock?format=json' })
    expect(headers['content-type']).toBeUndefined()
    expect((body as Record<string, unknown>).dreamfall).toBeTruthy()
  })

  test('?format=html forces the page even from fetch()', async () => {
    const { headers, body } = await request({ accept: '*/*', url: '/api/stock?format=html' })
    expect(headers['content-type']).toContain('text/html')
    expect(String(body)).toContain('Editions Remaining')
  })

  test('Vary covers Accept as well as Origin, so a CDN cannot cross the wires', async () => {
    const { headers } = await request({})
    expect(headers.vary).toContain('Accept')
    expect(headers.vary).toContain('Origin')
  })

  test('jfeelgood.com still gets its cross-origin header and JSON', async () => {
    const { headers, body } = await request({ accept: '*/*', origin: 'https://jfeelgood.com' })
    expect(headers['access-control-allow-origin']).toBe('https://jfeelgood.com')
    expect((body as Record<string, unknown>)['sky-miles']).toEqual({ stock: 12, soldOut: false })
  })

  test('an unknown origin gets no CORS header', async () => {
    const { headers } = await request({ accept: '*/*', origin: 'https://not-mine.example' })
    expect(headers['access-control-allow-origin']).toBeUndefined()
  })
})

test.describe('/api/stock — when the spreadsheet is unreachable', () => {
  const reason = 'the spreadsheet is not shared with the service account — share it as an Editor'

  test('JSON clients get the reason', async () => {
    const { status, body } = await request({ accept: '*/*', fail: reason })
    expect(status).toBe(500)
    expect(body).toEqual({ error: 'Failed to fetch inventory', reason })
  })

  test('a browser gets a page explaining itself, not six false sold-outs', async () => {
    const { status, body, headers } = await request({ accept: 'text/html', fail: reason })
    expect(status).toBe(500)
    expect(headers['content-type']).toContain('text/html')
    const html = String(body)
    expect(html).toContain('Live counts are unavailable')
    expect(html).toContain(reason.replace(/—/g, '—'))
    // The lie this guards against: showing every edition as sold out.
    expect(html).not.toContain('Sold out')
  })
})
