# Minicuration

Limited edition ACEO-sized art prints by JFeelgood. 50 numbered editions per design, sealed in a magnetic acrylic collector's case.

**Live site:** [minicuration.com](https://minicuration.com)

---

## Stack

| Layer | Service |
|---|---|
| Hosting | Vercel (static + serverless functions) |
| Data | Google Sheets (Supabase/Postgres paused — see [Storage backend](#storage-backend)) |
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
│   ├── _store.js           # Storage adapter — Google Sheets or Supabase
│   ├── _sheets.js          # Dependency-free Google Sheets v4 client
│   ├── _lib.js             # Resend client, order + edition helpers
│   ├── webhook.js          # Stripe checkout.session.completed handler
│   ├── ship.js             # Admin: assign edition number, email buyer
│   ├── editions.js         # Admin: the 6 × 50 inventory grid
│   └── stock.js            # Read-only inventory endpoint
├── js/
│   ├── analytics.js        # Pageview + buy_click / newsletter event tracking
│   ├── store.js            # Product-page inventory, edition #, sold-out capture
│   └── nav.js              # Mobile nav toggle
├── thanks.html             # Post-purchase landing (newsletter + cross-sell)
├── admin.html              # Pack & ship queue (token-gated, noindex)
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

## Storage backend

Inventory and the sales ledger sit behind `api/_store.js`, which has two drivers
selected by the `STORE_BACKEND` environment variable:

| Value | Backend | Notes |
|---|---|---|
| `sheets` (default) | A Google Spreadsheet, two tabs | In use now — the Supabase project is paused so its free-tier slot can go elsewhere |
| `supabase` | The original Postgres schema | Unchanged and still in `scripts/*.sql`; switching back is a config change |

Nothing above the adapter knows which is active: both drivers return the same
`{ data, error }` shape, and the SQL in `scripts/per-edition-inventory.sql`
still describes the schema the Supabase driver talks to.

### The spreadsheet

Two tabs, one row per record, headers in row 1 (column order does not matter —
the driver reads by header name, and extra columns you add by hand are
preserved on write):

- **`editions`** — `slug`, `edition_number`, `status`, `reserved_by`, `reserved_at`, `updated_at`
  (6 designs × 50 rows; `status` is the admin grid's `available → sold → gifted → relisted` cycle)
- **`sales`** — `id`, `slug`, `edition_number`, `order_number`, `buyer_email`, `buyer_name`, `stripe_session`, `created_at`, `shipped_at`
  (`shipped_at` empty = still in the pack queue)

Public stock is derived, not stored: a design's stock is its count of
`available`/`relisted` editions with no `reserved_by` — the same rule the
`public_stock` view used.

### Moving from Supabase to Sheets

1. Create a Google Cloud service account, enable the **Google Sheets API**, and
   download its JSON key.
2. Create a spreadsheet and share it with the service account's email as an
   **Editor**. Its ID is the `/d/<id>/edit` part of the URL.
3. Export the live data **before pausing Supabase** — a paused project cannot be read:
   ```
   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node scripts/supabase-export.js
   ```
   Writes `.local/supabase-export.json` (gitignored — it contains buyer names and emails).
4. Build and seed the tabs:
   ```
   GOOGLE_SHEETS_ID=… GOOGLE_SERVICE_ACCOUNT_EMAIL=… GOOGLE_PRIVATE_KEY=… \
     node scripts/sheets-setup.js --import
   ```
   Without `--import` it seeds 300 fresh `available` editions instead. It
   refuses to overwrite a tab that already has rows unless given `--force`.
5. Set `STORE_BACKEND=sheets` plus the three `GOOGLE_*` variables in Vercel, redeploy,
   and check `/api/stock` and `admin.html`.
6. Only then pause the Supabase project.

To go back: set `STORE_BACKEND=supabase`, redeploy. Anything sold in the
meantime lives only in the spreadsheet, so replay those rows into Postgres first.

### The one thing Postgres did that Sheets cannot

`claim_edition` took a row lock, so two simultaneous checkouts for the last
print could never both win. The Sheets API has no compare-and-swap, so the
driver writes the reservation and reads it back to confirm it stuck, retrying
on the next free box if it lost. That closes the common race but leaves a
sub-second window where two checkouts of the *same* design could reserve the
same box. At current volume that is unlikely, and the pack-time
duplicate-edition check in `api/ship.js` catches it before any print is
mislabelled — but it is a real difference, not an equivalent.

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

So the counter is never used to tell a buyer anything. The flow is:

1. **Checkout** — the webhook decrements stock, writes a `sales` row with
   `shipped_at` NULL, and confirms the order to the buyer *without* a number.
   The `edition_number` it writes is provisional: only a suggested default.
2. **Packing** — open `/admin.html`, enter the admin token, and type the number
   actually written on the print. That sets `edition_number` + `shipped_at` and
   emails the buyer their real number.

`POST /api/ship` only updates rows where `shipped_at` is still NULL, so a
double submit can't email a buyer twice. Both the endpoint and the page are
guarded by `ADMIN_TOKEN` (compared in constant time); the endpoint returns 503
if that variable isn't set.

The owner is also emailed on the three cases that need a human: a checkout that
matched no product, an oversell refund, and a six-pack that included a sold-out
edition. Email failures are logged but never fail the webhook — returning an
error to Stripe would trigger a retry and decrement stock twice.

Both emails require `RESEND_API_KEY` and a Resend-verified `minicuration.com`
domain; without the key the webhook still records the sale and just skips email.
