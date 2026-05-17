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
├── scripts/                # Build/audit scripts
├── .env.example            # Required environment variables
└── vercel.json
```

---


npm run lint        # HTML, CSS, JS
npm run audit:seo   # Updates sitemap lastmod + checks SEO files
```

Vercel functions require env vars — use `vercel dev` with a `.env.local` for local testing.
