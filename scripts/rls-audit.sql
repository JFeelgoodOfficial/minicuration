-- Row Level Security audit — run in the Supabase SQL editor.
--
-- Why this matters: every table in the `public` schema is reachable through
-- Supabase's REST API. If RLS is DISABLED on a table, the anon key can read
-- the whole thing. `sales` holds buyer names, email addresses and Stripe
-- session IDs, so it must never be readable by anon.
--
-- api/webhook.js and api/ship.js use the service_role key, which bypasses RLS
-- entirely — locking these tables down does not affect them.

-- ── 1. Which tables are unprotected? ─────────────────────────────────────────
-- Anything with rls_enabled = false is readable by anyone holding the anon key.
select relname                as table_name,
       relrowsecurity         as rls_enabled,
       relforcerowsecurity    as rls_forced
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relkind = 'r'
 order by relrowsecurity asc, relname;

-- ── 2. What policies exist, and who do they apply to? ────────────────────────
select tablename, policyname, roles, cmd, qual
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;


-- ── 3. Lock down the customer ledger ─────────────────────────────────────────
-- Enabling RLS with NO policy is the point: it denies anon and authenticated
-- outright, while service_role (the webhook and ship endpoint) still bypasses
-- it. Safe to run even if it is already enabled.
alter table sales enable row level security;

-- If step 2 showed a permissive policy on sales granting anon access, drop it.
-- Uncomment and set the real policy name from step 2's output:
-- drop policy "<policy name from step 2>" on sales;

-- ── 4. Confirm the lockdown ──────────────────────────────────────────────────
-- sales should now be rls_enabled = true with zero policies.
-- inventory should be rls_enabled = true with exactly one SELECT policy for
-- anon (it is public storefront data — that one is intentional).
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relkind = 'r'
   and relname in ('sales', 'inventory');

select tablename, policyname, roles, cmd from pg_policies
 where schemaname = 'public' and tablename in ('sales', 'inventory');
