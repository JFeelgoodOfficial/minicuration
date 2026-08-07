# Minicuration

Limited edition ACEO-sized art prints by JFeelgood. 50 numbered editions per design, sealed in a magnetic acrylic collector's case.

**Live site:** [minicuration.com](https://minicuration.com)

---

## Stack

| Layer | Service |
|---|---|
| Hosting | Vercel (static + serverless functions) |
| Database | Supabase (Postgres) |
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
back to exactly one session in Stripe. It is not stored: `sales.stripe_session`
is the source of truth, and the number is recomputed from it.

The webhook then sends two emails through Resend, both from
`support@minicuration.com`:

- **To the buyer** — order number, edition numbers, and shipping timeframe.
- **To `ORDER_NOTIFY_EMAIL`** (default `support@minicuration.com`) — a new-order
  alert with what to pack, what was paid, and the shipping address.

The owner is also emailed on the three cases that need a human: a checkout that
matched no product, an oversell refund, and a six-pack that included a sold-out
edition. Email failures are logged but never fail the webhook — returning an
error to Stripe would trigger a retry and decrement stock twice.

Both emails require `RESEND_API_KEY` and a Resend-verified `minicuration.com`
domain; without the key the webhook still records the sale and just skips email.
