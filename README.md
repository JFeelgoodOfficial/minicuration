# Minicuration

Limited edition ACEO-sized art prints by JFeelgood. 50 numbered editions per design, sealed in a magnetic acrylic collector's case.

**Live site:** [minicuration.com](https://minicuration.com)

---

## Stack

| Layer | Service |
|---|---|
| Hosting | Vercel (static + serverless functions) |
| Database | Neon (serverless Postgres) |
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
│   ├── _store.js           # Every database call, over Neon's HTTP driver
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

## Database

Neon serverless Postgres, reached through `api/_store.js` — the single module
that talks SQL. Handlers never build a query themselves.

The schema is `scripts/neon-schema.sql`: an `editions` table (6 designs × 50
boxes, each cycling `available → sold → gifted → relisted`), a `sales` ledger,
the `claim_edition` function, and the `public_stock` view. Public stock is
derived, not stored — a design's stock is its count of `available`/`relisted`
boxes with no `reserved_by`.

Two differences from the old Supabase schema, both because Neon has no
PostgREST and no `anon` role:

- **No RLS, no role grants.** Under Supabase every table in `public` was
  reachable from a browser holding the anon key, so `sales` needed RLS to keep
  buyer emails private. Neon is reachable only from `api/` over `DATABASE_URL`,
  so the network boundary does the job the policies used to.
- **`sales.id` is `text`.** The Supabase table may have keyed on a uuid or a
  bigint; `admin.html` only ever round-trips the value as an opaque string, and
  `text` accepts either, so existing order history keeps its identifiers.

Neon scales its compute to zero after ~5 minutes idle and wakes on the next
query, so the first request after a quiet spell pays a wake-up cost. That is
also why `/api/stock` carries a 5-minute CDN cache — it keeps the database
asleep between real visitors rather than on every page view.

`scripts/per-edition-inventory.sql`, `edition-numbers.sql` and `rls-audit.sql`
are the Supabase-era originals, kept for reference until the move is finished.

### Moving from Supabase to Neon

1. Create a Neon project and copy its **pooled** connection string.
2. Build the schema:
   ```
   psql "$DATABASE_URL" -f scripts/neon-schema.sql
   ```
3. Copy the live data across — **before pausing Supabase**, since a paused
   project cannot be read:
   ```
   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… DATABASE_URL=… npm run db:migrate
   ```
   Add `--dry-run` to see the counts without writing. It backs up what it read
   to `.local/supabase-export.json` (gitignored — buyer names and emails) before
   sending anything, and is safe to re-run: editions upsert, sales skip rows
   already present.
4. Check the result:
   ```
   DATABASE_URL=… npm run db:verify -- --claim-test
   ```
   Read-only without the flag. With it, the script reserves a real box on a
   scratch session to prove `claim_edition` locks and is retry-safe, then
   releases it — including if a check fails partway.
5. Set `DATABASE_URL` in Vercel, redeploy, and confirm `/api/stock` and
   `admin.html` look right.
6. Only then pause the Supabase project. Keep `.local/supabase-export.json`
   until you are confident.

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
