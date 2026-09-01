-- Minicuration on Neon — run once against a fresh Neon database:
--
--   psql "$DATABASE_URL" -f scripts/neon-schema.sql
--
-- This is the Supabase schema (scripts/per-edition-inventory.sql) with the
-- Supabase-specific parts removed. Neon has no PostgREST and no anon role: the
-- database is reachable only from api/ over a connection string, never from a
-- browser. That makes the RLS policies, the role grants and the security-definer
-- wrapper unnecessary — the lockdown they provided is now the network boundary.
--
-- Safe to re-run: every statement is idempotent and the seed will not disturb
-- rows that already exist.

-- ── 1. The editions table ────────────────────────────────────────────────────
-- One row per physical print: 6 designs × editions 1–50. `status` is what the
-- owner tracks in the admin grid (click cycle: available → sold → gifted →
-- relisted → available). A paid-but-not-yet-packed order does NOT change
-- status — the real edition number is only known at pack time — it holds a
-- reservation in reserved_by instead.
create table if not exists editions (
  slug           text not null,
  edition_number int  not null check (edition_number between 1 and 50),
  status         text not null default 'available'
                 check (status in ('available', 'sold', 'gifted', 'relisted')),
  reserved_by    text,          -- Stripe session ID, or null
  reserved_at    timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (slug, edition_number)
);

-- One checkout can hold at most one box per design. This is what makes
-- claim_edition idempotent across Stripe's webhook retries even when two
-- deliveries of the same event arrive simultaneously: without it they would
-- each reserve a different box and one order would consume two prints.
-- claim_edition catches the violation and returns the box that won.
create unique index if not exists editions_one_box_per_session_idx
  on editions (slug, reserved_by) where reserved_by is not null;

-- ── 2. The sales ledger ──────────────────────────────────────────────────────
-- shipped_at NULL = not yet packed; that is what the admin queue filters on.
--
-- `id` is text rather than uuid on purpose: the Supabase table it is migrated
-- from may have used either a uuid or a bigint key, and the admin page treats
-- the value as an opaque string it round-trips. text accepts both, so existing
-- order history keeps its identifiers.
create table if not exists sales (
  id             text primary key default gen_random_uuid()::text,
  slug           text not null,
  edition_number int,
  order_number   text,
  buyer_email    text,
  buyer_name     text,
  stripe_session text,
  created_at     timestamptz not null default now(),
  shipped_at     timestamptz
);

create index if not exists sales_unshipped_idx on sales (created_at desc)
  where shipped_at is null;

-- ── 3. Seed the grid ─────────────────────────────────────────────────────────
-- 6 designs × 50 boxes. Existing rows are left exactly as they are, so this is
-- also how a newly added design gets its 50 boxes.
insert into editions (slug, edition_number)
select slug, n
  from unnest(array[
         'dreamfall', 'dream-mountain', 'sky-miles',
         'a-simple-meditation', 'veritas', 'sweet-dreams'
       ]) as slug,
       generate_series(1, 50) as n
    on conflict (slug, edition_number) do nothing;

-- ── 4. claim_edition ─────────────────────────────────────────────────────────
-- Called by api/webhook.js once per slug in a paid checkout. Atomically
-- reserves the lowest available edition for the Stripe session and returns it
-- as the provisional edition number, plus how many remain sellable.
--   claimed   = null → sold out
--   remaining = 0    → this purchase emptied the design (deactivate links)
-- Idempotent across Stripe webhook retries: a session that already holds a
-- reservation for the slug gets the same edition back, nothing double-claimed.
create or replace function claim_edition(product_slug text, session_id text)
returns table (claimed int, remaining int)
language plpgsql
as $$
declare
  picked int;
begin
  select edition_number into picked
    from editions
   where slug = product_slug and reserved_by = session_id
   limit 1;

  if picked is null then
    select edition_number into picked
      from editions
     where slug = product_slug
       and status in ('available', 'relisted')
       and reserved_by is null
     order by edition_number
     limit 1
     for update skip locked;  -- concurrent checkouts each lock a different
                              -- row; the loser of a last-print race finds
                              -- none and reports sold out

    if picked is not null then
      begin
        update editions
           set reserved_by = session_id,
               reserved_at = now(),
               updated_at  = now()
         where slug = product_slug and edition_number = picked;
      exception when unique_violation then
        -- Stripe can deliver the same event twice at once. Both deliveries get
        -- past the lookup above seeing no reservation, then pick DIFFERENT free
        -- boxes (skip locked hands them different rows) and race to write. The
        -- one-box-per-session index rejects the loser here rather than letting
        -- one order quietly consume two prints; the loser then adopts the box
        -- the winner reserved, so both deliveries return the same number.
        select edition_number into picked
          from editions
         where slug = product_slug and reserved_by = session_id
         limit 1;
      end;
    end if;
  end if;

  return query
    select picked,
           (select count(*)::int from editions
             where slug = product_slug
               and status in ('available', 'relisted')
               and reserved_by is null);
end $$;

-- ── 5. Public stock ──────────────────────────────────────────────────────────
-- A design's stock is its count of available + relisted editions not reserved
-- by a pending order. Kept as a view so the rule lives in one place, the way it
-- did under Supabase.
create or replace view public_stock as
  select slug,
         count(*) filter (where status in ('available', 'relisted')
                            and reserved_by is null)::int as stock
    from editions
   group by slug;

-- Check: 6 rows, counts matching the admin grid (sold-out designs show 0,
-- never a missing row, because every design always has its 50 edition rows).
select * from public_stock order by slug;
