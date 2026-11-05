-- Switching from Flight Schedule Pro: a school uploads its FSP exports (people, aircraft,
-- upcoming reservations). Read by src/fspImport.js; written by the school-import function.
--
-- People aren't given accounts. Each becomes an invite matched by email: when that person
-- signs in to Positive Rate (now, or already has an account), the invite is applied —
-- instructors get a pending affiliation with the school to accept, students are linked.
-- Reservations wait here until the student and instructor have joined and the plane is
-- verified; then the server books each one as a lesson the student accepts by saving a card.

create table if not exists public.school_imports (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools on delete cascade,
  kind       text not null check (kind in ('people', 'aircraft', 'reservations')),
  file_name  text,
  counts     jsonb not null default '{}',
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.school_invites (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools on delete cascade,
  import_id      uuid references public.school_imports on delete set null,
  email          text not null check (email = lower(email)),
  full_name      text not null default '',
  phone          text,
  role           text not null check (role in ('cfi', 'student')),
  status         text not null default 'invited' check (status in ('invited', 'joined', 'removed')),
  user_id        uuid references public.profiles on delete set null,
  joined_at      timestamptz,
  affiliation_id uuid references public.affiliations on delete set null,
  created_at     timestamptz not null default now(),
  unique (school_id, email)
);
create index if not exists school_invites_email on public.school_invites (email) where status = 'invited';

create table if not exists public.school_import_reservations (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools on delete cascade,
  import_id        uuid references public.school_imports on delete set null,
  fingerprint      text not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  flight_hours     numeric(4,1) not null,
  goal             text not null default 'Flight lesson',
  student_name     text,
  student_email    text,
  instructor_name  text,
  instructor_email text,
  tail             text,
  status           text not null default 'waiting' check (status in ('waiting', 'booked', 'skipped', 'expired')),
  note             text not null default '',
  booking_id       uuid references public.bookings on delete set null,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (school_id, fingerprint)
);
create index if not exists school_import_res_waiting on public.school_import_reservations (school_id) where status = 'waiting';

alter table public.school_imports enable row level security;
alter table public.school_invites enable row level security;
alter table public.school_import_reservations enable row level security;
grant select on public.school_imports, public.school_invites, public.school_import_reservations to authenticated;
grant all on public.school_imports, public.school_invites, public.school_import_reservations to service_role;
drop policy if exists "school imports read" on public.school_imports;
create policy "school imports read" on public.school_imports for select to authenticated using (public.is_school_admin(school_id) or public.is_staff());
drop policy if exists "school invites read" on public.school_invites;
create policy "school invites read" on public.school_invites for select to authenticated using (public.is_school_admin(school_id) or user_id = auth.uid() or public.is_staff());
drop policy if exists "school import reservations read" on public.school_import_reservations;
create policy "school import reservations read" on public.school_import_reservations for select to authenticated using (public.is_school_admin(school_id) or public.is_staff());

-- Apply one invite to the account it belongs to. Safe to run again: a joined instructor
-- who only creates their instructor profile later gets the school's affiliation then.
create or replace function public.apply_school_invite(p_invite uuid, p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  inv school_invites;
  s schools;
  aff uuid;
begin
  select * into inv from school_invites where id = p_invite for update;
  if inv is null or inv.status = 'removed' then return 'none'; end if;
  if inv.user_id is not null and inv.user_id <> p_user then return 'other'; end if;
  if inv.status = 'invited' then
    update school_invites set status = 'joined', user_id = p_user, joined_at = now() where id = inv.id;
    update profiles set
      roles = (select array_agg(distinct r) from unnest(roles || array[inv.role]) r),
      full_name = case when coalesce(full_name, '') = '' then inv.full_name else full_name end,
      phone = coalesce(phone, inv.phone)
    where id = p_user;
  end if;
  -- Instructors: the school's standard terms, as an invite the instructor accepts.
  if inv.role = 'cfi' and inv.affiliation_id is null and exists (select 1 from cfis where id = p_user) then
    select id into aff from affiliations where cfi_id = p_user and school_id = inv.school_id and status in ('pending', 'active') limit 1;
    if aff is null then
      select * into s from schools where id = inv.school_id;
      insert into affiliations (cfi_id, school_id, status, model, school_pct, set_rate, initiated_by, message)
      values (p_user, s.id, 'pending', s.terms_model, s.terms_school_pct, case when s.terms_model = 'employee' then s.terms_min_rate end, 'school',
              s.name || ' moved its scheduling from Flight Schedule Pro to Positive Rate.')
      returning id into aff;
    end if;
    update school_invites set affiliation_id = aff where id = inv.id;
  end if;
  return 'joined';
end $$;
revoke execute on function public.apply_school_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_school_invite(uuid, uuid) to service_role;

-- The app calls this after sign-in: apply any school invites for the user's email.
create or replace function public.claim_school_invites() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_email text;
  i record;
  joined jsonb := '[]';
begin
  if me is null then return joined; end if;
  select lower(email) into my_email from auth.users where id = me and email_confirmed_at is not null;
  if my_email is null then return joined; end if;
  for i in select si.id, si.status, sc.name from school_invites si join schools sc on sc.id = si.school_id
           where si.email = my_email and (si.status = 'invited' or (si.user_id = me and si.role = 'cfi' and si.affiliation_id is null)) loop
    if public.apply_school_invite(i.id, me) = 'joined' and i.status = 'invited' then
      joined := joined || jsonb_build_object('school', i.name);
    end if;
  end loop;
  return joined;
end $$;
revoke execute on function public.claim_school_invites() from public, anon;
grant execute on function public.claim_school_invites() to authenticated, service_role;

-- At import: people who already have a confirmed Positive Rate account join right away.
create or replace function public.link_school_invites(p_school uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  i record;
  n int := 0;
begin
  for i in select si.id, u.id as uid from school_invites si join auth.users u on lower(u.email) = si.email and u.email_confirmed_at is not null
           where si.school_id = p_school and si.status = 'invited' loop
    if public.apply_school_invite(i.id, i.uid) = 'joined' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.link_school_invites(uuid) from public, anon, authenticated;
grant execute on function public.link_school_invites(uuid) to service_role;
