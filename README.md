# Minicuration

Limited edition ACEO-sized art prints by JFeelgood. 50 numbered editions per design, sealed in a magnetic acrylic collector's case.

**Live site:** [minicuration.com](https://minicuration.com)

---

## Stack

| Layer | Service |
|---|---|
| Hosting | Vercel (static + serverless functions) |
| Inventory & orders | A Google Spreadsheet |
| Payments | Stripe Checkout |
| Email | Resend |

---

## Project structure

```
/
├── index.html              # Homepage
├── shop.html               # Shop grid
├── about.html
├── journal.html
├── journal/                # Individual journal articles
├── shop/                   # Individual product pages
├── artists/                # Artist pages
├── css/
│   └── base.css            # Shared nav, footer, reset, fonts
├── fonts/                  # Self-hosted woff2 (Cormorant Garamond, DM Sans)
├── image/                  # All site images (webp)
├── api/
│   ├── _constants.js       # Product slugs, edition size, grid statuses
│   ├── _store.js           # The three things the site does to the sheet
│   ├── _sheets.js          # Dependency-free Google Sheets v4 client
│   ├── _lib.js             # Resend client, order helpers
│   ├── webhook.js          # Stripe checkout.session.completed handler
│   └── stock.js            # Read-only inventory endpoint
├── js/
│   ├── analytics.js        # Pageview + buy_click / newsletter event tracking
│   ├── store.js            # Product-page inventory, edition #, sold-out capture
│   └── nav.js              # Mobile nav toggle
├── thanks.html             # Post-purchase landing (newsletter + cross-sell)
├── scripts/                # Build/audit scripts
├── .env.example            # Required environment variables
└── vercel.json
```

---

```
npm run lint        # HTML, CSS, JS
npm run audit:seo   # Updates sitemap lastmod + checks SEO files
```

Vercel functions require env vars — use `vercel dev` with a `.env.local` for local testing.

---

## Inventory and orders

There is no database. Everything lives in one Google Spreadsheet that you can
open and edit like any other spreadsheet — that *is* the admin interface.

**`editions` tab** — one row per physical print, 6 designs × 50.

| column | what it is |
|---|---|
| `slug` | which design (`sweet-dreams`, `veritas`, …) |
| `edition_number` | 1–50 |
| `status` | `available`, `sold`, `gifted` or `relisted` |
| `reserved_by` | set automatically when someone checks out; blank otherwise |
| `reserved_at`, `updated_at` | timestamps, set automatically |

A print is for sale when `status` is `available` or `relisted` **and**
`reserved_by` is empty. That is the whole stock rule — `/api/stock` just counts
those rows, and the product pages read it.

**`sales` tab** — one row per print sold. The website appends to it; you fill in
`edition_number` and `shipped_at` by hand when you pack.

### The two things you do by hand

When a print sells you get an email with the order, the address, and a link
straight to the sheet. After you pack it:

1. **In the sheet** — write the number actually on the print into
   `edition_number` on the `sales` tab, put the date in `shipped_at`, then on
   the `editions` tab set that print to `sold` and clear its `reserved_by` cell.
2. **Tell the buyer** — the same order email has a link that opens a written
   message with a blank where the edition number goes. Fill in the number, send.

Refunded or abandoned order still holding a print? Clear its `reserved_by` cell
and the print goes back on sale.

### One-time setup

All of it in a browser — nothing to install, nothing to run.

1. **Google Cloud** ([console.cloud.google.com](https://console.cloud.google.com)) —
   create a project, enable the **Google Sheets API**, then Credentials →
   create a **Service Account** → Keys → **Add key → JSON**. Keep the file that
   downloads; you need two values out of it.
2. **The spreadsheet** — [sheets.new](https://sheets.new) makes a blank one.
   **Share** it with the service account's email (`client_email` in the JSON)
   as an **Editor**. Its ID is the `/d/<id>/edit` part of the URL. Leave it
   empty; the tabs build themselves.
3. **Vercel** → Settings → Environment Variables → add three, each as
   **Secret**: `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   (`client_email`), `GOOGLE_PRIVATE_KEY` (`private_key`, pasted whole —
   quotes, `\n` escapes or real newlines all work). Then redeploy.
4. **Open the shop.** The first request finds an empty spreadsheet, creates the
   `editions` and `sales` tabs and seeds all 300 prints. Nothing to trigger.

To start the inventory over, delete both tabs in the spreadsheet and load the
site again. Setup only ever creates tabs that are missing, so it can never
overwrite real sales.

### The tradeoff, honestly

A spreadsheet has no way to say "claim this row, and only this row, atomically".
`claimEdition` writes a reservation and reads it back to confirm it stuck,
moving to the next print if another checkout got there first. That handles the
ordinary case, but leaves a sub-second window where two checkouts of the *same
design* could land on the same print.

At a few sales a week across six designs that is unlikely, and if it ever
happens you will see it in the sheet — two orders showing the same number —
rather than it passing silently. A database would rule it out entirely. This is
the price of not running one, and for this shop it is a reasonable price.

---

## Operational setup

Three manual steps activate the order, analytics, and post-purchase reclaim flows:

1. **Register the Stripe webhook.** Stripe Dashboard → **Developers → Webhooks
   → Add endpoint** → `https://minicuration.com/api/webhook`, listening for
   `checkout.session.completed`. Copy the signing secret into the Vercel env var
   `STRIPE_WEBHOOK_SECRET`. **Without this endpoint no order is recorded:** stock
   never decrements, the sales ledger stays empty, and neither the buyer nor the
   owner is emailed. Use the endpoint's delivery log to confirm orders arrive.
2. **Enable analytics.** Turn on **Web Analytics** in the Vercel project
   dashboard. `js/analytics.js` (loaded on every page) sends pageviews and
   custom events — `buy_click`, `begin_checkout`, `newsletter_signup`,
   `flip_back`, `sold_out_click` — and mirrors them to `window.dataLayer` for
   an optional GA4/GTM container.
3. **Redirect Stripe Payment Links to `/thanks`.** In the Stripe Dashboard,
   edit each Payment Link → **After payment** → **Redirect customers to your
   website** → `https://minicuration.com/thanks.html`. This returns buyers
   on-site (newsletter capture + cross-sell) instead of Stripe's generic
   receipt. Repeat for any new link.

The Stripe webhook (`api/webhook.js`) enforces scarcity automatically: it
deactivates a Payment Link when its edition hits zero, and auto-refunds +
deactivates on any oversell.

### Orders

Every completed checkout gets an order number derived from its Stripe session
(`cs_live_…c3d4e5f6` → `MC-C3D4E5F6`) — no counter to keep, and the number maps
back to exactly one session in Stripe.

The webhook then sends two emails through Resend, both from
`support@minicuration.com`:

- **To the buyer** — order number, what they bought, and shipping timeframe.
  Deliberately **no edition number** (see below).
- **To `ORDER_NOTIFY_EMAIL`** (default `support@minicuration.com`) — a new-order
  alert with what to pack, what was paid, and the shipping address.

### Edition numbers are assigned at pack time, not at checkout

An edition number is a permanent claim to a collector ("no one else holds this
one"), and it belongs to a *physical* print. It cannot be derived reliably from
the stock counter: a webhook that fails, a print sold by hand, or packing out of
order all put the counter out of step with the box of prints. That drift already
sent one buyer the wrong number.

So no number is ever quoted to a buyer automatically. The flow is:

1. **Checkout** — the webhook reserves a print, appends a `sales` row with
   `shipped_at` empty, and confirms the order to the buyer *without* a number,
   promising it by email once the print is packed. The `edition_number` it
   writes is provisional: the print it reserved, not necessarily the one you
   pull off the pile.
2. **Packing** — you write the number actually on the print into the sheet, and
   send the buyer the draft email linked from your order notification.

Telling the buyer is deliberately a human step. A number stated automatically
and later found wrong is worse than one stated a day later and correct — that
drift is what sent a buyer the wrong number once already.

The owner is also emailed on the three cases that need a human: a checkout that
matched no product, an oversell refund, and a six-pack that included a sold-out
edition. Email failures are logged but never fail the webhook — returning an
error to Stripe would trigger a retry and decrement stock twice.

Both emails require `RESEND_API_KEY` and a Resend-verified `minicuration.com`
domain; without the key the webhook still records the sale and just skips email.
