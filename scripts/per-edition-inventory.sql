-- Per-edition inventory — run in the Supabase SQL editor BEFORE deploying the
-- code that uses it (api/editions.js, claim_edition in api/webhook.js,
-- public_stock in api/stock.js). Old code never touches these objects, so the
-- script is safe to run ahead of the deploy.
--
-- Sections 1–3 and 5–7 are safe to run as-is and safe to re-run.
-- Section 4 needs your judgement. Section 8 is the retirement step — leave it
-- commented until the new system has proven itself for a couple of weeks.

-- ── 1. The editions table ─────────────────────────────────────────────────────
-- One row per physical print: 6 designs × editions 1–50. `status` is what the
-- owner tracks in the admin grid (click cycle: available → sold → gifted →
-- relisted → available). A paid-but-not-yet-packed order does NOT change
-- status — the real edition number is only known at pack time — it holds a
-- reservation instead, in the orthogonal reserved_by column (the Stripe
-- session ID). Available for sale therefore means:
--   status in ('available','relisted') and reserved_by is null
create table if not exists editions (
  slug           text        not null,
  edition_number int         not null check (edition_number between 1 and 50),
  status         text        not null default 'available'
                   check (status in ('available', 'sold', 'gifted', 'relisted')),
  reserved_by    text,        -- Stripe session holding a paid, unpacked claim
  reserved_at    timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (slug, edition_number)
);

create index if not exists editions_avail_idx
  on editions (slug, edition_number)
  where status in ('available', 'relisted') and reserved_by is null;

-- ── 2. Seed the 300 editions ──────────────────────────────────────────────────
insert into editions (slug, edition_number)
select s.slug, n
  from unnest(array[
         'dreamfall', 'dream-mountain', 'sky-miles',
         'a-simple-meditation', 'veritas', 'sweet-dreams'
       ]) as s(slug)
 cross join generate_series(1, 50) as n
on conflict (slug, edition_number) do nothing;

-- ── 3. Backfill sold editions from the sales ledger ───────────────────────────
-- Every shipped sale with a recorded edition number marks that box sold.
update editions e
   set status = 'sold', updated_at = now()
  from (select distinct slug, edition_number
          from sales
         where shipped_at is not null and edition_number is not null) s
 where e.slug = s.slug
   and e.edition_number = s.edition_number
   and e.status = 'available';

-- Surface any historical double-assignment (two sales rows claiming the same
-- print). Nothing is auto-fixed — resolve these by hand if any appear.
select slug, edition_number, count(*)
  from sales
 where shipped_at is not null and edition_number is not null
 group by slug, edition_number
having count(*) > 1;

-- ── 4. Reconcile against the old stock counter ────────────────────────────────
-- The counter and the grid can disagree: the counter drifted while the webhook
-- was failing, and old shipped sales may lack edition numbers. Look at the
-- drift first:
select i.slug,
       i.stock as counter_stock,
       count(*) filter (where e.status in ('available', 'relisted'))
         as grid_available
  from inventory i
  join editions e on e.slug = i.slug
 group by i.slug, i.stock
 order by i.slug;

-- If grid_available > counter_stock for a design, the counter says more prints
-- left the box than section 3 found edition numbers for. EITHER trust the
-- counter and run the fill-in below (it marks the lowest-numbered available
-- editions sold; afterwards correct WHICH boxes are green in the admin grid),
-- OR trust the grid and do nothing. Fill in <slug> and <N> per design:
--
-- update editions
--    set status = 'sold', updated_at = now()
--  where slug = '<slug>'
--    and edition_number in (
--      select edition_number from editions
--       where slug = '<slug>' and status = 'available'
--       order by edition_number limit <N>);

-- ── 5. Reserve editions for paid-but-unshipped orders ─────────────────────────
-- Without this, a print someone has already paid for is still publicly
-- buyable. Re-runnable: sessions that already hold a reservation are skipped.
do $$
declare
  r record;
  picked int;
begin
  for r in
    select slug, stripe_session
      from sales
     where shipped_at is null and stripe_session is not null
  loop
    if exists (select 1 from editions
                where slug = r.slug and reserved_by = r.stripe_session) then
      continue;
    end if;
    select edition_number into picked
      from editions
     where slug = r.slug
       and status in ('available', 'relisted')
       and reserved_by is null
     order by edition_number
     limit 1;
    if picked is not null then
      update editions
         set reserved_by = r.stripe_session,
             reserved_at = now(),
             updated_at  = now()
       where slug = r.slug and edition_number = picked;
    end if;
  end loop;
end $$;

-- ── 6. claim_edition — replaces decrement_stock ───────────────────────────────
-- Called by api/webhook.js once per slug in a paid checkout. Atomically
-- reserves the lowest available edition for the Stripe session and returns it
-- as the provisional edition number, plus how many remain sellable.
--   claimed  = null → sold out (was decrement_stock's -1)
--   remaining = 0   → this purchase emptied the design (deactivate links)
-- Idempotent across Stripe webhook retries: a session that already holds a
-- reservation for the slug gets the same edition back, nothing double-claimed.
create or replace function claim_edition(product_slug text, session_id text)
returns table (claimed int, remaining int)
language plpgsql
security definer
set search_path = public
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
      update editions
         set reserved_by = session_id,
             reserved_at = now(),
             updated_at  = now()
       where slug = product_slug and edition_number = picked;
    end if;
  end if;

  return query
    select picked,
           (select count(*)::int from editions
             where slug = product_slug
               and status in ('available', 'relisted')
               and reserved_by is null);
end $$;

-- Only the service_role key (api/webhook.js) may call it.
revoke execute on function claim_edition(text, text) from public, anon, authenticated;

-- ── 7. RLS and the public stock view ──────────────────────────────────────────
-- editions is deny-all to anon: reserved_by holds Stripe session IDs, which
-- must never be publicly readable. The storefront only needs the per-design
-- count, exposed through a view. The view deliberately runs with owner rights
-- (Postgres default; Supabase's advisor will flag "security definer view") —
-- that is the point: anon reads the aggregate without any access to the rows.
alter table editions enable row level security;

create or replace view public_stock as
  select slug,
         count(*) filter (where status in ('available', 'relisted')
                            and reserved_by is null)::int as stock
    from editions
   group by slug;

grant select on public_stock to anon, authenticated;

-- Check: 6 rows, counts matching the admin grid (sold-out designs show 0,
-- never a missing row, because every design always has its 50 edition rows).
select * from public_stock order by slug;

-- Check RLS: this should return rows here (SQL editor runs as owner), but an
-- anon REST request for /rest/v1/editions must come back empty/denied.
-- select count(*) from editions;

-- ── 8. Retirement — run ~2 weeks after the rollout has proven itself ──────────
-- Until then, inventory + decrement_stock are the rollback path: reverting the
-- deploy brings the old counter system back (re-sync its counts first).
--
-- Final drift check before dropping:
-- select i.slug, i.stock as old_counter, p.stock as grid_stock
--   from inventory i join public_stock p on p.slug = i.slug order by i.slug;
--
-- drop function if exists decrement_stock(text);
-- drop table if exists inventory;
