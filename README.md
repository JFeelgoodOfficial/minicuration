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

Two manual steps activate the analytics + post-purchase reclaim flows:

1. **Enable analytics.** Turn on **Web Analytics** in the Vercel project
   dashboard. `js/analytics.js` (loaded on every page) sends pageviews and
   custom events — `buy_click`, `begin_checkout`, `newsletter_signup`,
   `flip_back`, `sold_out_click` — and mirrors them to `window.dataLayer` for
   an optional GA4/GTM container.
2. **Redirect Stripe Payment Links to `/thanks`.** Run once (and again after
   adding any new link) so buyers land back on-site after paying:

   ```
   STRIPE_SECRET_KEY=sk_live_... node scripts/set-stripe-redirects.js   # add --dry to preview
   ```

The Stripe webhook (`api/webhook.js`) enforces scarcity automatically: it
deactivates a Payment Link when its edition hits zero, and auto-refunds +
deactivates on any oversell.
