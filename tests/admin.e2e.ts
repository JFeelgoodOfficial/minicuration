import { test, expect, type Page } from '@playwright/test'

// Two designs so accordion behaviour (opening one closes the other) is testable.
async function mockAdminApi(page: Page) {
  await page.route('**/api/ship*', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ orders: [], editionSize: 50 }) }))
  await page.route('**/api/editions*', route =>
    route.fulfill({ status: 200, body: JSON.stringify({
      editionSize: 50,
      names: { dreamfall: 'Dreamfall', veritas: 'Veritas' },
      grid: {
        dreamfall: [{ n: 1, status: 'available', reservedOrder: null }],
        veritas:   [{ n: 1, status: 'sold', reservedOrder: null }],
      },
    }) }))
}

async function unlockPanel(page: Page) {
  await mockAdminApi(page)
  await page.locator('#token').fill('the-real-token')
  await page.locator('#unlock').click()
  await expect(page.locator('#panel')).toBeVisible()
}

// The admin page is publicly reachable (noindex, but no server-side gate on
// the HTML itself), so the panel must stay behind the token wall. The API is
// the real boundary — every endpoint checks the token — but an unlocked-looking
// page invites someone to poke at it, and a stale render must never survive.
test.describe('Admin — token wall', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html')
  })

  test('the panel is hidden until a token is accepted', async ({ page }) => {
    await expect(page.locator('#token')).toBeVisible()
    await expect(page.locator('#unlock')).toBeVisible()
    await expect(page.locator('#panel')).toBeHidden()
  })

  test('no order queue or inventory grid is rendered while locked', async ({ page }) => {
    await expect(page.locator('#orders .order')).toHaveCount(0)
    await expect(page.locator('#grid .design')).toHaveCount(0)
    await expect(page.locator('#grid .boxes button')).toHaveCount(0)
    await expect(page.locator('h2')).toBeHidden()
  })

  test('an empty token does not unlock the panel', async ({ page }) => {
    await page.locator('#unlock').click()
    await expect(page.locator('#panel')).toBeHidden()
    await expect(page.locator('#status')).toContainText('admin token')
  })

  test('a rejected token leaves the panel hidden', async ({ page }) => {
    // The static test server has no /api routes, so this stands in for any
    // non-200: whatever comes back, nothing may be revealed.
    await page.route('**/api/ship*', route =>
      route.fulfill({ status: 401, body: JSON.stringify({ error: 'unauthorized' }) }))
    await page.locator('#token').fill('not-the-real-token')
    await page.locator('#unlock').click()
    await expect(page.locator('#status')).toContainText('Token rejected')
    await expect(page.locator('#panel')).toBeHidden()
  })

  test('a remembered token still has to pass the API before anything shows', async ({ page }) => {
    await page.route('**/api/ship*', route =>
      route.fulfill({ status: 401, body: JSON.stringify({ error: 'unauthorized' }) }))
    await page.evaluate(() => localStorage.setItem('mc_admin_token', 'rotated-away'))
    await page.reload()
    await expect(page.locator('#panel')).toBeHidden()
    await expect(page.locator('#token')).toBeVisible()
    // The dead token is not kept around.
    expect(await page.evaluate(() => localStorage.getItem('mc_admin_token'))).toBeNull()
  })

  test('a valid token reveals the panel, and Lock puts it back', async ({ page }) => {
    await mockAdminApi(page)

    await page.locator('#token').fill('the-real-token')
    await page.locator('#unlock').click()

    await expect(page.locator('#panel')).toBeVisible()
    await expect(page.locator('#grid .design')).toHaveCount(2)
    await expect(page.locator('#token')).toBeHidden()

    await page.locator('#lock').click()
    await expect(page.locator('#panel')).toBeHidden()
    await expect(page.locator('#token')).toBeVisible()
    await expect(page.locator('#grid .design')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('mc_admin_token'))).toBeNull()
  })
})

// Six designs at 50 boxes each is 300 buttons, so each grid hides behind its
// name and only one opens at a time.
test.describe('Admin — collapsible inventory grids', () => {
  const dreamfall = '#boxes-dreamfall'
  const veritas   = '#boxes-veritas'
  const toggleFor = (slug: string) => `.design-toggle[data-slug="${slug}"]`

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html')
    await unlockPanel(page)
  })

  test('every grid starts collapsed', async ({ page }) => {
    await expect(page.locator('#grid .design')).toHaveCount(2)
    await expect(page.locator(dreamfall)).toBeHidden()
    await expect(page.locator(veritas)).toBeHidden()
    await expect(page.locator(toggleFor('dreamfall'))).toHaveAttribute('aria-expanded', 'false')
  })

  test('the design name is a button that opens its grid', async ({ page }) => {
    await expect(page.locator(`${toggleFor('dreamfall')} .design-name`)).toHaveText('Dreamfall')
    await page.locator(toggleFor('dreamfall')).click()
    await expect(page.locator(dreamfall)).toBeVisible()
    await expect(page.locator(`${dreamfall} button`)).toBeVisible()
    await expect(page.locator(toggleFor('dreamfall'))).toHaveAttribute('aria-expanded', 'true')
  })

  test('pressing the same name again closes the grid', async ({ page }) => {
    await page.locator(toggleFor('dreamfall')).click()
    await expect(page.locator(dreamfall)).toBeVisible()
    await page.locator(toggleFor('dreamfall')).click()
    await expect(page.locator(dreamfall)).toBeHidden()
    await expect(page.locator(toggleFor('dreamfall'))).toHaveAttribute('aria-expanded', 'false')
  })

  test('opening one design closes the other', async ({ page }) => {
    await page.locator(toggleFor('dreamfall')).click()
    await expect(page.locator(dreamfall)).toBeVisible()

    await page.locator(toggleFor('veritas')).click()
    await expect(page.locator(veritas)).toBeVisible()
    await expect(page.locator(dreamfall)).toBeHidden()
    await expect(page.locator(toggleFor('dreamfall'))).toHaveAttribute('aria-expanded', 'false')
  })

  test('the grid reopens after a refresh re-renders it', async ({ page }) => {
    await page.locator(toggleFor('veritas')).click()
    await expect(page.locator(veritas)).toBeVisible()

    // Shipping an order triggers the same reload path.
    await page.locator('#load').click()
    await expect(page.locator(veritas)).toBeVisible()
    await expect(page.locator(dreamfall)).toBeHidden()
  })

  test('locking forgets which design was open', async ({ page }) => {
    await page.locator(toggleFor('veritas')).click()
    await expect(page.locator(veritas)).toBeVisible()

    await page.locator('#lock').click()
    await page.locator('#token').fill('the-real-token')
    await page.locator('#unlock').click()
    await expect(page.locator('#panel')).toBeVisible()
    await expect(page.locator(veritas)).toBeHidden()
  })
})
