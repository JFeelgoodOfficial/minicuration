import { test, expect } from '@playwright/test'

// The shop's three interactions with the spreadsheet: counting what is still
// for sale, reserving a print at checkout, and recording the order. Getting
// any of them wrong sells the same print twice or loses a sale entirely, so
// they run here against an in-memory stand-in for the sheet.
//
/* eslint-disable @typescript-eslint/no-var-requires */
const SHEETS = require.resolve('../api/_sheets.js')
const { PRODUCT_NAMES, EDITION_SIZE } = require('../api/_constants.js')

const EDITION_COLUMNS = ['slug', 'edition_number', 'status', 'reserved_by', 'reserved_at', 'updated_at']
const SALES_COLUMNS = ['id', 'slug', 'edition_number', 'order_number', 'buyer_email', 'buyer_name', 'stripe_session', 'created_at', 'shipped_at']

type Tab = { header: string[]; rows: string[][] }

// An in-memory stand-in for api/_sheets.js with the same row addressing:
// row 1 is the header, so data row i lives at sheet row i + 2.
function fakeSheets(tabs: Record<string, Tab>) {
  const cells = (header: string[], obj: Record<string, unknown>) =>
    header.map(n => (obj[n] == null ? '' : String(obj[n])))
  const object = (header: string[], row: string[] = [], rowNumber: number) => {
    const obj: Record<string, unknown> = { _row: rowNumber }
    header.forEach((name, col) => { obj[name] = row[col] ?? '' })
    return obj
  }
  return {
    async readTab(tab: string) {
      return { header: tabs[tab].header, rows: tabs[tab].rows.map(r => [...r]) }
    },
    toObjects(header: string[], rows: string[][]) {
      return rows.map((row, i) => object(header, row, i + 2))
    },
    async readRow(tab: string, header: string[], rowNumber: number) {
      return object(header, tabs[tab].rows[rowNumber - 2], rowNumber)
    },
    async writeRow(tab: string, header: string[], rowNumber: number, obj: Record<string, unknown>) {
      tabs[tab].rows[rowNumber - 2] = cells(header, obj)
    },
    async writeRows(tab: string, header: string[], updates: { rowNumber: number; obj: Record<string, unknown> }[]) {
      for (const u of updates) tabs[tab].rows[u.rowNumber - 2] = cells(header, u.obj)
    },
    async appendRows(tab: string, header: string[], objects: Record<string, unknown>[]) {
      for (const obj of objects) tabs[tab].rows.push(cells(header, obj))
    },
    columnLetter: (n: number) => String.fromCharCode(64 + n),
  }
}

// Six designs × EDITION_SIZE boxes, all available — what first-run setup seeds.
function seedEditions(): string[][] {
  const rows: string[][] = []
  for (const slug of Object.keys(PRODUCT_NAMES)) {
    for (let n = 1; n <= EDITION_SIZE; n++) rows.push([slug, String(n), 'available', '', '', ''])
  }
  return rows
}

function newStore(editionRows = seedEditions(), salesRows: string[][] = []) {
  const tabs: Record<string, Tab> = {
    editions: { header: EDITION_COLUMNS, rows: editionRows },
    sales:    { header: SALES_COLUMNS, rows: salesRows },
  }
  // api/_store.js requires the Sheets client at load time, so the fake goes in
  // first and the store module is re-required fresh for each test.
  require.cache[SHEETS] = { id: SHEETS, filename: SHEETS, loaded: true, exports: fakeSheets(tabs) } as never
  delete require.cache[require.resolve('../api/_store.js')]
  const { store } = require('../api/_store.js')
  return { store: store(), tabs }
}

test.describe('sheets store — stock counting', () => {
  test('a fresh sheet reports every design fully in stock', async () => {
    const { store } = newStore()
    const { data, error } = await store.listStock()
    expect(error).toBeNull()
    expect(data).toHaveLength(Object.keys(PRODUCT_NAMES).length)
    for (const row of data) expect(row.stock).toBe(EDITION_SIZE)
  })

  test('sold, gifted and reserved boxes all leave the sellable count', async () => {
    const rows = seedEditions()
    rows[0][2] = 'sold'                      // dreamfall #1
    rows[1][2] = 'gifted'                    // dreamfall #2
    rows[2][3] = 'cs_live_pending'           // dreamfall #3, reserved but unpacked
    rows[3][2] = 'relisted'                  // dreamfall #4 is sellable again
    const { store } = newStore(rows)
    const { data } = await store.listStock()
    expect(data.find(r => r.slug === 'dreamfall').stock).toBe(EDITION_SIZE - 3)
    expect(data.find(r => r.slug === 'veritas').stock).toBe(EDITION_SIZE)
  })
})

test.describe('sheets store — claiming an edition', () => {
  test('claims the lowest sellable box and decrements what remains', async () => {
    const { store } = newStore()
    const { data } = await store.claimEdition('veritas', 'cs_live_aaa')
    expect(data.claimed).toBe(1)
    expect(data.remaining).toBe(EDITION_SIZE - 1)
  })

  test('a Stripe retry re-claims the same box, never a second print', async () => {
    const { store } = newStore()
    const first = await store.claimEdition('sky-miles', 'cs_live_retry')
    const second = await store.claimEdition('sky-miles', 'cs_live_retry')
    expect(second.data.claimed).toBe(first.data.claimed)
    expect(second.data.remaining).toBe(first.data.remaining)
  })

  test('two checkouts of the same design get different boxes', async () => {
    const { store } = newStore()
    const a = await store.claimEdition('veritas', 'cs_live_a')
    const b = await store.claimEdition('veritas', 'cs_live_b')
    expect(b.data.claimed).not.toBe(a.data.claimed)
  })

  test('a sold-out design claims nothing rather than overselling', async () => {
    const rows = seedEditions().map(row =>
      row[0] === 'sweet-dreams' ? [row[0], row[1], 'sold', '', '', ''] : row)
    const { store } = newStore(rows)
    const { data } = await store.claimEdition('sweet-dreams', 'cs_live_late')
    expect(data.claimed).toBeNull()
    expect(data.remaining).toBe(0)
  })

  test('the last print reports remaining 0 so the payment link is closed', async () => {
    const rows = seedEditions().map(row =>
      row[0] === 'veritas' && row[1] !== '50' ? [row[0], row[1], 'sold', '', '', ''] : row)
    const { store } = newStore(rows)
    const { data } = await store.claimEdition('veritas', 'cs_live_last')
    expect(data.claimed).toBe(50)
    expect(data.remaining).toBe(0)
  })
})

test.describe('sheets store — recording an order', () => {
  test('a sale is written to the sheet with an id and the order details', async () => {
    const { store, tabs } = newStore()
    await store.insertSales([{
      slug: 'dreamfall', edition_number: 3, order_number: 'MC-AAAA0001',
      buyer_email: 'ada@example.com', buyer_name: 'Ada', stripe_session: 'cs_live_ada',
    }])
    expect(tabs.sales.rows).toHaveLength(1)
    const row = Object.fromEntries(SALES_COLUMNS.map((c, i) => [c, tabs.sales.rows[0][i]]))
    expect(row.id).toBeTruthy()
    expect(row.order_number).toBe('MC-AAAA0001')
    expect(row.edition_number).toBe('3')
    expect(row.buyer_email).toBe('ada@example.com')
  })

  test('a six-pack appends one row per print, all sharing the order number', async () => {
    const { store, tabs } = newStore()
    const bundle = Object.keys(PRODUCT_NAMES).map((slug, i) => ({
      slug, edition_number: i + 1, order_number: 'MC-BUNDLE01',
      buyer_email: 'ada@example.com', buyer_name: 'Ada', stripe_session: 'cs_live_bundle',
    }))
    const { error } = await store.insertSales(bundle)
    expect(error).toBeNull()
    expect(tabs.sales.rows).toHaveLength(6)
    // shipped_at starts empty — that is how you see what is still to pack.
    const shippedAtCol = SALES_COLUMNS.indexOf('shipped_at')
    expect(tabs.sales.rows.every(r => !r[shippedAtCol])).toBe(true)
  })
})

// A brand-new spreadsheet is empty. The first request has to build both tabs
// and seed all 300 prints, because there is no setup script to run any more —
// the shop is configured entirely from a browser.
test.describe('sheets store — first run on an empty spreadsheet', () => {
  // Stands in for a spreadsheet with no tabs: any range read fails the way the
  // real API fails, until addSheet creates it.
  function emptySpreadsheet() {
    const tabs: Record<string, Tab> = {}
    const calls: string[] = []
    const api = {
      async call(path: string, opts?: { body?: { requests?: { addSheet: { properties: { title: string } } }[] }; }) {
        calls.push(path)
        if (path === '') return { sheets: Object.keys(tabs).map(t => ({ properties: { title: t } })) }
        if (path === ':batchUpdate') {
          const title = opts!.body!.requests![0].addSheet.properties.title
          if (tabs[title]) throw new Error(`Sheets POST failed (400): A sheet with the name "${title}" already exists`)
          tabs[title] = { header: [], rows: [] }
          return {}
        }
        // values PUT — seed the tab it names
        const title = decodeURIComponent(path).split('!')[0].replace('/values/', '')
        const values = (opts as unknown as { body: { values: string[][] } }).body.values
        tabs[title] = { header: values[0], rows: values.slice(1) }
        return {}
      },
      async readTab(tab: string) {
        if (!tabs[tab]) throw new Error(`Sheets GET failed (400): Unable to parse range: ${tab}`)
        return { header: tabs[tab].header, rows: tabs[tab].rows.map(r => [...r]) }
      },
      toObjects(header: string[], rows: string[][]) {
        return rows.map((row, i) => {
          const obj: Record<string, unknown> = { _row: i + 2 }
          header.forEach((name, col) => { obj[name] = row[col] ?? '' })
          return obj
        })
      },
      async readRow(tab: string, header: string[], rowNumber: number) {
        const row = tabs[tab].rows[rowNumber - 2] ?? []
        const obj: Record<string, unknown> = { _row: rowNumber }
        header.forEach((name, col) => { obj[name] = row[col] ?? '' })
        return obj
      },
      async writeRow(tab: string, header: string[], rowNumber: number, obj: Record<string, unknown>) {
        tabs[tab].rows[rowNumber - 2] = header.map(n => (obj[n] == null ? '' : String(obj[n])))
      },
      async appendRows(tab: string, header: string[], objects: Record<string, unknown>[]) {
        for (const obj of objects) tabs[tab].rows.push(header.map(n => (obj[n] == null ? '' : String(obj[n]))))
      },
      columnLetter: (n: number) => String.fromCharCode(64 + n),
    }
    require.cache[SHEETS] = { id: SHEETS, filename: SHEETS, loaded: true, exports: api } as never
    delete require.cache[require.resolve('../api/_store.js')]
    const { store } = require('../api/_store.js')
    return { store: store(), tabs, calls }
  }

  test('builds both tabs and seeds 300 prints, then answers normally', async () => {
    const { store, tabs } = emptySpreadsheet()
    const { data, error } = await store.listStock()

    expect(error).toBeNull()
    expect(Object.keys(tabs).sort()).toEqual(['editions', 'sales'])
    expect(tabs.editions.rows).toHaveLength(Object.keys(PRODUCT_NAMES).length * EDITION_SIZE)
    expect(tabs.sales.header).toContain('shipped_at')
    expect(tabs.sales.rows).toHaveLength(0)
    for (const row of data) expect(row.stock).toBe(EDITION_SIZE)
  })

  test('a checkout on an unbuilt sheet still reserves print 1', async () => {
    const { store, tabs } = emptySpreadsheet()
    const { data, error } = await store.claimEdition('veritas', 'cs_live_first')
    expect(error).toBeNull()
    expect(data.claimed).toBe(1)
    expect(tabs.editions.rows).toHaveLength(Object.keys(PRODUCT_NAMES).length * EDITION_SIZE)
  })

  test('setup runs once — a second call does not rebuild the tabs', async () => {
    const { store, calls } = emptySpreadsheet()
    await store.listStock()
    const afterFirst = calls.filter(c => c === ':batchUpdate').length
    await store.listStock()
    expect(calls.filter(c => c === ':batchUpdate').length).toBe(afterFirst)
  })

  test('never overwrites a tab that already holds sales', async () => {
    const { store, tabs } = emptySpreadsheet()
    await store.listStock()
    await store.insertSales([{
      slug: 'veritas', edition_number: 1, order_number: 'MC-REAL0001',
      buyer_email: 'ada@example.com', buyer_name: 'Ada', stripe_session: 'cs_live_real',
    }])
    // A later cold start must not wipe that row.
    delete require.cache[require.resolve('../api/_store.js')]
    const { store: restarted } = require('../api/_store.js')
    await restarted().listStock()
    expect(tabs.sales.rows).toHaveLength(1)
  })
})
