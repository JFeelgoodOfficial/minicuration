-- Pack-time edition numbers — run in the Supabase SQL editor.
-- Sections 1–3 are safe to run as-is. Section 4 needs your real print counts.

-- ── 1. Schema ────────────────────────────────────────────────────────────────
-- shipped_at NULL = not yet packed; that is what the admin queue filters on.
alter table sales add column if not exists order_number text;
alter table sales add column if not exists shipped_at   timestamptz;

create index if not exists sales_unshipped_idx on sales (created_at desc)
  where shipped_at is null;

-- ── 2. Backfill order numbers on existing rows ───────────────────────────────
-- Same rule the code uses: 'MC-' + last 8 chars of the session, uppercased.
update sales
   set order_number = 'MC-' || upper(right(stripe_session, 8))
 where order_number is null
   and stripe_session is not null;

-- Existing rows already shipped by hand — mark them packed so they do NOT
-- appear in the admin queue and trigger a surprise email to an old buyer.
update sales set shipped_at = created_at where shipped_at is null;

-- ── 3. Correct the order that was told the wrong number ──────────────────────
-- Buyer was physically sent print #2; the email said edition 1.
update sales
   set edition_number = 2
 where order_number = 'MC-IL4EZZCO';

-- Check it:
select order_number, slug, edition_number, buyer_email, shipped_at
  from sales order by created_at desc limit 20;


-- ── 4. Reconcile the stock counter with the real box of prints ───────────────
-- The counter drifted while the webhook was failing, so it under-counts what
-- has actually left. It still drives sold-out logic and the "Edition N of 50"
-- tag on product pages, so it should match reality.
--
-- First look at where it stands:
select slug, stock from inventory order by slug;

-- Then, for each design, set stock = 50 - (prints you have actually sent).
-- Fill in the real numbers and run only the lines you need:
--
-- update inventory set stock = 50 - 2 where slug = 'sweet-dreams';
-- update inventory set stock = 50 - 0 where slug = 'dreamfall';
-- update inventory set stock = 50 - 0 where slug = 'dream-mountain';
-- update inventory set stock = 50 - 0 where slug = 'sky-miles';
-- update inventory set stock = 50 - 0 where slug = 'a-simple-meditation';
-- update inventory set stock = 50 - 0 where slug = 'veritas';


-- ── 5. Let the public site read inventory again ──────────────────────────────
-- /api/stock returns {} because RLS blocks the anon key, so product pages show
-- no live edition count or sold-out state. Inventory is not sensitive — it is
-- displayed on the storefront — so grant read-only access to anon.
alter table inventory enable row level security;

drop policy if exists "inventory readable by anyone" on inventory;
create policy "inventory readable by anyone"
  on inventory for select
  to anon, authenticated
  using (true);

-- Writes still go through the service_role key in api/webhook.js, which
-- bypasses RLS, so no write policy is granted here on purpose.
