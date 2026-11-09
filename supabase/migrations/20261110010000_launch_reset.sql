-- Launch reset (approved by Jacob, 2026-11-09): remove everything created while
-- payments ran in Stripe test mode, so the live app starts clean.
--
--  1. All test-era bookings and money records (bookings, ledger, gifts, shared-flight
--     splits, reviews, debriefs, processed Stripe events). TRUNCATE ... CASCADE also
--     empties tables that point at these (e.g. training records tied to bookings).
--  2. Every account except jacobbh1492@gmail.com (Test Instructor + N0TEST, the two demo
--     students, and an email-less test sign-in). Links from other tables to those
--     accounts that don't cascade are cleared first (set to null, or the row deleted
--     when the column is required).
--  3. Test-mode Stripe IDs (customers, payout accounts) so everyone gets live ones.
--
-- Runs once (recorded in public.deploy_migrations).

truncate table
  public.bookings,
  public.ledger,
  public.gifts,
  public.booking_splits,
  public.reviews,
  public.debriefs,
  public.stripe_events
cascade;

do $$
declare
  ids uuid[];
  r record;
begin
  select array_agg(id) into ids from auth.users where email is distinct from 'jacobbh1492@gmail.com';
  if ids is null then return; end if;

  -- Non-cascading foreign keys in public.* that point at these accounts' profiles,
  -- instructor profiles or planes.
  for r in
    select format('%I.%I', n.nspname, t.relname) as tbl, a.attname as col, a.attnotnull as notnull,
           c.confrelid = 'public.planes'::regclass as via_plane
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and n.nspname = 'public'
      and array_length(c.conkey, 1) = 1
      and c.confdeltype in ('a', 'r')  -- no action / restrict
      and c.confrelid in ('public.profiles'::regclass, 'public.cfis'::regclass, 'public.planes'::regclass)
  loop
    if r.via_plane then
      if r.notnull then
        execute format('delete from %s where %I in (select id from public.planes where owner_id = any($1))', r.tbl, r.col) using ids;
      else
        execute format('update %s set %I = null where %I in (select id from public.planes where owner_id = any($1))', r.tbl, r.col, r.col) using ids;
      end if;
    else
      if r.notnull then
        execute format('delete from %s where %I = any($1)', r.tbl, r.col) using ids;
      else
        execute format('update %s set %I = null where %I = any($1)', r.tbl, r.col, r.col) using ids;
      end if;
    end if;
  end loop;

  -- Profiles, instructor profiles, planes and the rest cascade from the sign-in.
  delete from auth.users where id = any(ids);
end $$;

update public.profiles set stripe_customer_id = null, stripe_account_id = null, payouts_ready = false;
update public.schools  set stripe_account_id = null, payouts_ready = false;
