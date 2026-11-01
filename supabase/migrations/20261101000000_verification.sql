-- Verification: each check an instructor or plane must pass before it can be booked.
--   instructor (cfi):  identity (Stripe Identity)  +  faa_airmen (FAA Airmen Registry has a
--                      flight instructor certificate for the verified name)
--   plane:             faa_aircraft (registration valid, make/model match)  +  insurance
--                      (policy document reviewed)
-- The `cfis.verified`, `planes.airworthy_verified` and `planes.insured` flags are derived
-- from these rows by a trigger, so nothing else needs to set them.

create table if not exists public.verifications (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('cfi', 'plane')),
  subject_id   uuid not null,
  check_type   text not null check (check_type in ('identity', 'faa_airmen', 'faa_aircraft', 'insurance')),
  status       text not null default 'pending' check (status in ('pending', 'passed', 'failed', 'review')),
  detail       jsonb not null default '{}',     -- what was checked and why (shown to staff and the owner)
  document_id  uuid references public.documents on delete set null,
  reviewed_by  uuid references public.profiles,
  checked_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (subject_type, subject_id, check_type)
);
create index if not exists verifications_status on public.verifications (status);

alter table public.verifications enable row level security;
revoke all on public.verifications from anon, authenticated;
grant select on public.verifications to authenticated;
grant all on public.verifications to service_role;

-- Owners see their own checks; staff see everything. Writes are server-only.
create policy "verifications read" on public.verifications for select to authenticated using (
  (subject_type = 'cfi' and subject_id = auth.uid())
  or (subject_type = 'plane' and exists (select 1 from planes p where p.id = subject_id and p.owner_id = auth.uid()))
  or public.is_staff());

create or replace function public.apply_verification() returns trigger
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if new.subject_type = 'cfi' then
    select count(*) = 2 into ok from verifications
      where subject_type = 'cfi' and subject_id = new.subject_id
        and check_type in ('identity', 'faa_airmen') and status = 'passed';
    update cfis set verified = ok where id = new.subject_id and verified is distinct from ok;
  else
    update planes set
      airworthy_verified = exists (select 1 from verifications where subject_type = 'plane' and subject_id = new.subject_id and check_type = 'faa_aircraft' and status = 'passed'),
      insured            = exists (select 1 from verifications where subject_type = 'plane' and subject_id = new.subject_id and check_type = 'insurance' and status = 'passed')
    where id = new.subject_id;
  end if;
  return new;
end $$;

drop trigger if exists verifications_apply on public.verifications;
create trigger verifications_apply after insert or update on public.verifications
  for each row execute function public.apply_verification();

-- The founder reviews documents until automated reading is turned on.
update public.profiles set is_staff = true where id = '24b9cbd5-53ce-4a4a-bd52-32b09b913190';
