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

## Environment variables

Copy `.env.example` and fill in values. All vars are set in Vercel project settings — never committed to the repo.

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Anon/public key — used by `/api/stock` |
| `SUPABASE_SERVICE_KEY` | Service role key — used by `/api/webhook` only |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_API_KEY` | Resend API key (optional — skips fulfillment email if absent) |

---

## Supabase setup

Run once in the Supabase SQL editor:

```sql
-- Tables
create table inventory (
  slug        text primary key,
  stock       int  not null default 50,
  created_at  timestamptz default now()
);
create table sales (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null references inventory(slug),
  edition_number int  not null,
  buyer_email    text,
  buyer_name     text,
  stripe_session text,
  created_at     timestamptz default now()
);

-- Seed
insert into inventory (slug, stock) values
  ('dreamfall',50),('dream-mountain',50),('sky-miles',50),
  ('a-simple-meditation',50),('veritas',50),('sweet-dreams',50);

-- Atomic decrement function (prevents oversell)
create or replace function decrement_stock(product_slug text)
returns int language plpgsql as $$
declare remaining int;
begin
  select stock into remaining from inventory where slug = product_slug for update;
  if remaining <= 0 then return -1; end if;
  update inventory set stock = stock - 1 where slug = product_slug;
  return remaining - 1;
end;$$;
```

---

## Stripe setup

1. Create a product + price for each print in the Stripe dashboard
2. Copy each `price_...` ID into `PRICE_TO_SLUG` in `api/webhook.js`
3. Register a webhook endpoint at `https://minicuration.com/api/webhook` listening for `checkout.session.completed`
4. Copy the signing secret → `STRIPE_WEBHOOK_SECRET` in Vercel

---

## How inventory works

1. Buyer completes Stripe Checkout
2. Stripe sends `checkout.session.completed` to `/api/webhook`
3. Webhook verifies the Stripe signature, looks up the price ID → product slug
4. Calls `decrement_stock` Postgres RPC — row-level lock prevents two simultaneous purchases claiming the same edition number
5. Inserts a row into `sales` (permanent ledger)
6. Sends a fulfillment email via Resend with the buyer's edition number
7. `/api/stock` serves current inventory to the shop page (60s CDN cache)

---

## Local development

```bash
npm install
npm run lint        # HTML, CSS, JS
npm run audit:seo   # Updates sitemap lastmod + checks SEO files
```

Vercel functions require env vars — use `vercel dev` with a `.env.local` for local testing.
