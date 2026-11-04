-- Launch promo codes: Runup (CFI Pro, 1 year), Hold Short (School Pro, 1 year),
-- Short Final (no booking fee for students/renters, 3 months).
-- Codes are stored normalised (lowercase, letters/digits only). Turning a row's
-- `active` off stops new redemptions; redemptions already made run to their end date.
create table if not exists public.promo_codes (
  code        text primary key,
  label       text not null,
  kind        text not null check (kind in ('cfi_pro', 'school_pro', 'fee_free')),
  months      int  not null check (months between 1 and 36),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
insert into public.promo_codes (code, label, kind, months) values
  ('runup',      'Runup',       'cfi_pro',    12),
  ('holdshort',  'Hold Short',  'school_pro', 12),
  ('shortfinal', 'Short Final', 'fee_free',    3)
on conflict (code) do nothing;

create table if not exists public.promo_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references public.promo_codes,
  kind        text not null,
  user_id     uuid not null references public.profiles on delete cascade,
  school_id   uuid references public.schools on delete cascade,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  ended       boolean not null default false, -- set by the sweep once the perk was switched off
  created_at  timestamptz not null default now(),
  unique (code, user_id)
);
-- one Hold Short per school, however many admins it has
create unique index if not exists promo_redemptions_school on public.promo_redemptions (code, school_id) where school_id is not null;
create index if not exists promo_redemptions_user on public.promo_redemptions (user_id, kind, ends_at);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
-- codes are looked up by the server only; people can see their own redemptions (and their school's)
create policy "promo redemptions own" on public.promo_redemptions for select to authenticated
  using (user_id = auth.uid() or (school_id is not null and public.is_school_admin(school_id)));
grant select on public.promo_redemptions to authenticated;

-- Switch off perks whose free window ran out, unless another active one still covers them.
create or replace function public.promo_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c int;
begin
  update cfis f set pro = false
   where exists (select 1 from promo_redemptions r where r.kind = 'cfi_pro' and r.user_id = f.id and not r.ended and r.ends_at <= now())
     and not exists (select 1 from promo_redemptions r where r.kind = 'cfi_pro' and r.user_id = f.id and r.ends_at > now());
  get diagnostics c = row_count; n := n + c;
  update schools s set plan = 'starter'
   where s.plan = 'pro'
     and exists (select 1 from promo_redemptions r where r.kind = 'school_pro' and r.school_id = s.id and not r.ended and r.ends_at <= now())
     and not exists (select 1 from promo_redemptions r where r.kind = 'school_pro' and r.school_id = s.id and r.ends_at > now());
  get diagnostics c = row_count; n := n + c;
  update promo_redemptions set ended = true where not ended and ends_at <= now();
  return n;
end $$;
revoke execute on function public.promo_sweep() from public, anon, authenticated;

create or replace function public.booking_sweeps() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('splitsExpired', public.split_sweep(), 'proposalsExpired', public.proposal_sweep(),
    'debriefReminders', public.debrief_reminders(), 'promosEnded', public.promo_sweep())
$$;
revoke execute on function public.booking_sweeps() from public, anon, authenticated;
grant execute on function public.booking_sweeps() to service_role;
