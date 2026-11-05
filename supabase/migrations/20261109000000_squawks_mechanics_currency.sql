-- Squawks that ground the plane, mechanic access for owners, and pilot currency.
--
--  squawks:          reported (with photos) by anyone who flies the plane, its owner or its
--                    mechanic. An open grounding squawk blocks new bookings and confirmations
--                    (book, booking-action; src/aircraftStatus.js). Owners and mechanics fix
--                    or defer them. Changes go through report_squawk / update_squawk.
--  plane_mechanics:  an owner invites an A&P by email. Once they accept they see the plane's
--                    squawks and maintenance (never bookings, renters or money), fix squawks
--                    and log inspections.
--  plane_maintenance: 100-hour and annual inspections logged by the owner or mechanic.
--  pilot_profiles:   last flight and recent landings, for owners' recency rules and
--                    passenger currency (src/renterChecks.js).

-- ---------------------------------------------------------------- pilot currency
alter table public.pilot_profiles
  add column if not exists last_flight_date   date,
  add column if not exists day_landings_date  date,   -- oldest of the last 3 takeoffs & landings
  add column if not exists night_landings_date date;  -- oldest of the last 3 full-stop night landings

-- ---------------------------------------------------------------- inspections
alter table public.planes add column if not exists annual_date date; -- last annual (91.409(a))
grant update (annual_date) on public.planes to authenticated;

-- ---------------------------------------------------------------- mechanics
create table if not exists public.plane_mechanics (
  id           uuid primary key default gen_random_uuid(),
  plane_id     uuid not null references public.planes on delete cascade,
  email        text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  name         text not null default '' check (length(name) <= 80),
  user_id      uuid references public.profiles on delete cascade,
  status       text not null default 'invited' check (status in ('invited', 'active', 'declined', 'removed')),
  invited_by   uuid references public.profiles,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (plane_id, email)
);
create index if not exists plane_mechanics_user on public.plane_mechanics (user_id) where status = 'active';
alter table public.plane_mechanics enable row level security;
revoke all on public.plane_mechanics from anon, authenticated;
grant select on public.plane_mechanics to authenticated;
grant all on public.plane_mechanics to service_role;

create or replace function public.is_plane_mechanic(p_plane uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from plane_mechanics m where m.plane_id = p_plane and m.user_id = auth.uid() and m.status = 'active')
$$;
revoke execute on function public.is_plane_mechanic(uuid) from public;
grant execute on function public.is_plane_mechanic(uuid) to authenticated, service_role;

create policy "mechanics read" on public.plane_mechanics for select to authenticated using (
  public.manages_plane(plane_id) or user_id = auth.uid() or email = lower(coalesce(auth.email(), '')) or public.is_staff());

-- A mechanic can see the plane even while it's unlisted.
drop policy if exists "planes read" on public.planes;
create policy "planes read" on public.planes for select using (
  published or owner_id = auth.uid() or public.is_school_admin(school_id) or public.is_staff() or public.is_plane_mechanic(id));

create table if not exists public.plane_maintenance (
  id         uuid primary key default gen_random_uuid(),
  plane_id   uuid not null references public.planes on delete cascade,
  kind       text not null check (kind in ('100hr', 'annual')),
  done_on    date not null,
  hobbs      numeric(8,1),
  note       text not null default '' check (length(note) <= 500),
  logged_by  uuid references public.profiles,
  created_at timestamptz not null default now()
);
create index if not exists plane_maintenance_plane on public.plane_maintenance (plane_id, done_on desc);
alter table public.plane_maintenance enable row level security;
revoke all on public.plane_maintenance from anon, authenticated;
grant select on public.plane_maintenance to authenticated;
grant all on public.plane_maintenance to service_role;
create policy "maintenance read" on public.plane_maintenance for select to authenticated using (
  public.manages_plane(plane_id) or public.is_plane_mechanic(plane_id) or public.is_staff());

-- ---------------------------------------------------------------- squawks
alter table public.squawks
  add column if not exists photos        text[] not null default '{}',
  add column if not exists booking_id    uuid references public.bookings on delete set null,
  add column if not exists resolved_note text,
  add column if not exists resolved_by   uuid references public.profiles,
  add column if not exists resolved_at   timestamptz,
  add column if not exists updated_at    timestamptz not null default now();
create index if not exists squawks_plane_status on public.squawks (plane_id, status);
drop trigger if exists t_squawks on public.squawks;
create trigger t_squawks before update on public.squawks for each row execute function public.touch_updated_at();

-- Squawks change only through the functions below.
drop policy if exists "squawks insert" on public.squawks;
drop policy if exists "squawks owner" on public.squawks;
revoke insert, update, delete on public.squawks from anon, authenticated;
grant select on public.squawks to authenticated;
grant all on public.squawks to service_role;

-- Photos: squawk-photos/<uploader>/<file>, readable by anyone (like listing photos).
insert into storage.buckets (id, name, public) values ('squawk-photos', 'squawk-photos', true) on conflict (id) do nothing;
drop policy if exists "squawk photos read" on storage.objects;
create policy "squawk photos read" on storage.objects for select using (bucket_id = 'squawk-photos');
drop policy if exists "squawk photos upload" on storage.objects;
create policy "squawk photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'squawk-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Who can report: the owner/school, the plane's mechanic, an instructor who flies it, and
-- anyone with a confirmed or completed booking in it (including the other pilot on a shared rental).
create or replace function public.can_report_squawk(p_plane uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.manages_plane(p_plane) or public.is_plane_mechanic(p_plane)
    or exists (select 1 from cfi_planes cp where cp.plane_id = p_plane and cp.cfi_id = auth.uid())
    or exists (select 1 from bookings b where b.plane_id = p_plane and b.status in ('confirmed', 'completed')
               and (b.student_id = auth.uid() or b.cfi_id = auth.uid()
                    or exists (select 1 from booking_splits s where s.booking_id = b.id and s.partner_id = auth.uid() and s.status = 'accepted')))
$$;
revoke execute on function public.can_report_squawk(uuid) from public, anon;
grant execute on function public.can_report_squawk(uuid) to authenticated, service_role;

-- Tell the people with upcoming flights in a plane that just got grounded.
create or replace function public.notify_grounded(p_plane uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare b record; t text;
begin
  select tail into t from planes where id = p_plane;
  for b in select id, student_id, cfi_id, starts_at from bookings
           where plane_id = p_plane and status in ('requested', 'confirmed') and starts_at > now() loop
    perform public.notify(b.student_id, 'plane_grounded', t || ' is grounded',
      'A squawk was reported: ' || left(p_text, 120) || '. Your flight may need to move.', jsonb_build_object('screen', 'Lessons'));
    if b.cfi_id is not null and b.cfi_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
      perform public.notify(b.cfi_id, 'plane_grounded', t || ' is grounded',
        'A squawk was reported: ' || left(p_text, 120) || '.', jsonb_build_object('screen', 'Schedule'));
    end if;
  end loop;
end $$;
revoke execute on function public.notify_grounded(uuid, text) from public, anon, authenticated;

create or replace function public.report_squawk(p_plane uuid, p_text text, p_grounding boolean default false,
  p_photos text[] default '{}', p_booking uuid default null)
returns public.squawks language plpgsql security definer set search_path = public as $$
declare r squawks; p planes; txt text := btrim(coalesce(p_text, '')); m record; who text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into p from planes where id = p_plane;
  if p.id is null then raise exception 'Plane not found'; end if;
  if not public.can_report_squawk(p_plane) then raise exception 'Only pilots who fly this plane, its owner or its mechanic can report squawks'; end if;
  if length(txt) < 3 or length(txt) > 500 then raise exception 'Describe the problem in 3 to 500 characters'; end if;
  if coalesce(array_length(p_photos, 1), 0) > 4 then raise exception 'Up to 4 photos'; end if;
  if exists (select 1 from unnest(coalesce(p_photos, '{}')) ph where ph not like auth.uid()::text || '/%') then raise exception 'Upload the photos first'; end if;
  if p_booking is not null and not exists (select 1 from bookings where id = p_booking and plane_id = p_plane) then p_booking := null; end if;
  insert into squawks (plane_id, reported_by, text, grounding, photos, booking_id)
  values (p_plane, auth.uid(), txt, coalesce(p_grounding, false), coalesce(p_photos, '{}'), p_booking) returning * into r;
  who := public.first_name(auth.uid());
  if p.owner_id <> auth.uid() then
    perform public.notify(p.owner_id, 'squawk', (case when r.grounding then 'Grounding squawk on ' else 'New squawk on ' end) || p.tail,
      who || ': ' || left(txt, 140), jsonb_build_object('screen', 'OwnerDashboard'));
  end if;
  for m in select user_id from plane_mechanics where plane_id = p_plane and status = 'active' and user_id is not null and user_id <> auth.uid() loop
    perform public.notify(m.user_id, 'squawk', (case when r.grounding then 'Grounding squawk on ' else 'New squawk on ' end) || p.tail,
      who || ': ' || left(txt, 140), jsonb_build_object('screen', 'Maintenance', 'params', jsonb_build_object('planeId', p_plane)));
  end loop;
  if r.grounding then perform public.notify_grounded(p_plane, txt); end if;
  return r;
end $$;
revoke execute on function public.report_squawk(uuid, text, boolean, text[], uuid) from public, anon;
grant execute on function public.report_squawk(uuid, text, boolean, text[], uuid) to authenticated;

-- Owners and mechanics: fix it, defer it (fly with it, noted), reopen it, or change grounding.
create or replace function public.update_squawk(p_id uuid, p_status text, p_note text default null, p_grounding boolean default null)
returns public.squawks language plpgsql security definer set search_path = public as $$
declare r squawks; t text; note text := nullif(btrim(coalesce(p_note, '')), ''); was_grounding boolean;
begin
  select * into r from squawks where id = p_id;
  if r.id is null then raise exception 'Squawk not found'; end if;
  if not (public.manages_plane(r.plane_id) or public.is_plane_mechanic(r.plane_id)) then raise exception 'Only the owner or the plane’s mechanic can update squawks'; end if;
  if p_status not in ('open', 'deferred', 'fixed') then raise exception 'Unknown status'; end if;
  if p_status in ('fixed', 'deferred') and coalesce(length(note), 0) < 3 then
    raise exception '%', case p_status when 'fixed' then 'Say what was done to fix it' else 'Say why it’s OK to fly with it' end;
  end if;
  if length(note) > 500 then raise exception 'Keep the note under 500 characters'; end if;
  was_grounding := r.status = 'open' and r.grounding;
  update squawks set
    status = p_status,
    -- a deferred item isn't grounding by definition
    grounding = case when p_status = 'deferred' then false else coalesce(p_grounding, grounding) end,
    resolved_note = case when p_status = 'open' then resolved_note else note end,
    resolved_by = case when p_status = 'open' then null else auth.uid() end,
    resolved_at = case when p_status = 'open' then null else now() end
  where id = p_id returning * into r;
  select tail into t from planes where id = r.plane_id;
  if p_status = 'fixed' and r.reported_by is not null and r.reported_by <> auth.uid() then
    perform public.notify(r.reported_by, 'squawk_fixed', 'Squawk fixed on ' || t, left(r.text, 80) || ' · ' || left(note, 100), jsonb_build_object('screen', 'Explore'));
  end if;
  if r.status = 'open' and r.grounding and not was_grounding then perform public.notify_grounded(r.plane_id, r.text); end if;
  return r;
end $$;
revoke execute on function public.update_squawk(uuid, text, text, boolean) from public, anon;
grant execute on function public.update_squawk(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------- mechanic invites
create or replace function public.invite_mechanic(p_plane uuid, p_email text, p_name text default '')
returns public.plane_mechanics language plpgsql security definer set search_path = public as $$
declare r plane_mechanics; e text := lower(btrim(coalesce(p_email, ''))); uid uuid; t text;
begin
  if not public.manages_plane(p_plane) then raise exception 'Not your plane'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Enter your mechanic’s email'; end if;
  if e = lower(coalesce(auth.email(), '')) then raise exception 'That’s your own email'; end if;
  if (select count(*) from plane_mechanics where plane_id = p_plane and status in ('invited', 'active')) >= 5 then raise exception 'Up to 5 mechanics per plane'; end if;
  select id into uid from auth.users where lower(email) = e limit 1;
  insert into plane_mechanics (plane_id, email, name, user_id, status, invited_by)
  values (p_plane, e, left(btrim(coalesce(p_name, '')), 80), null, 'invited', auth.uid())
  on conflict (plane_id, email) do update set
    status = case when plane_mechanics.status = 'active' then 'active' else 'invited' end,
    name = coalesce(nullif(excluded.name, ''), plane_mechanics.name), invited_by = auth.uid(), created_at = case when plane_mechanics.status = 'active' then plane_mechanics.created_at else now() end
  returning * into r;
  select tail into t from planes where id = p_plane;
  if uid is not null and r.status = 'invited' then
    perform public.notify(uid, 'mechanic_invite', 'Mechanic access to ' || t,
      public.first_name(auth.uid()) || ' invited you to see ' || t || '’s squawks and log maintenance.', jsonb_build_object('screen', 'MechanicHome'));
  end if;
  return r;
end $$;
revoke execute on function public.invite_mechanic(uuid, text, text) from public, anon;
grant execute on function public.invite_mechanic(uuid, text, text) to authenticated;

create or replace function public.respond_mechanic_invite(p_id uuid, p_accept boolean)
returns public.plane_mechanics language plpgsql security definer set search_path = public as $$
declare r plane_mechanics; p planes;
begin
  select * into r from plane_mechanics where id = p_id;
  if r.id is null or r.email <> lower(coalesce(auth.email(), '')) then raise exception 'That invite isn’t for this account'; end if;
  if r.status not in ('invited', 'active') then raise exception 'This invite was withdrawn'; end if;
  update plane_mechanics set status = case when p_accept then 'active' else 'declined' end, user_id = auth.uid(), responded_at = now()
  where id = p_id returning * into r;
  select * into p from planes where id = r.plane_id;
  perform public.notify(p.owner_id, 'mechanic_' || r.status, public.first_name(auth.uid()) || case when p_accept then ' accepted' else ' declined' end || ' mechanic access',
    case when p_accept then 'They can now see ' || p.tail || '’s squawks and log maintenance.' else 'For ' || p.tail || '.' end, jsonb_build_object('screen', 'OwnerDashboard'));
  return r;
end $$;
revoke execute on function public.respond_mechanic_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_mechanic_invite(uuid, boolean) to authenticated;

-- The owner removes a mechanic, or a mechanic leaves.
create or replace function public.remove_mechanic(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r plane_mechanics;
begin
  select * into r from plane_mechanics where id = p_id;
  if r.id is null or not (public.manages_plane(r.plane_id) or r.user_id = auth.uid()) then raise exception 'Not allowed'; end if;
  update plane_mechanics set status = 'removed', responded_at = now() where id = p_id;
end $$;
revoke execute on function public.remove_mechanic(uuid) from public, anon;
grant execute on function public.remove_mechanic(uuid) to authenticated;

-- Log a 100-hour (resets the countdown from that Hobbs) or an annual.
create or replace function public.log_inspection(p_plane uuid, p_kind text, p_done_on date, p_hobbs numeric default null, p_note text default '')
returns public.plane_maintenance language plpgsql security definer set search_path = public as $$
declare r plane_maintenance;
begin
  if not (public.manages_plane(p_plane) or public.is_plane_mechanic(p_plane)) then raise exception 'Only the owner or the plane’s mechanic can log inspections'; end if;
  if p_kind not in ('100hr', 'annual') then raise exception 'Unknown inspection'; end if;
  if p_done_on is null or p_done_on > current_date + 1 or p_done_on < current_date - 400 then raise exception 'Enter the date it was signed off'; end if;
  if p_kind = '100hr' and (p_hobbs is null or p_hobbs < 0 or p_hobbs > 99999) then raise exception 'Enter the Hobbs (or tach) at the 100-hour'; end if;
  insert into plane_maintenance (plane_id, kind, done_on, hobbs, note, logged_by)
  values (p_plane, p_kind, p_done_on, case when p_kind = '100hr' then round(p_hobbs, 1) end, left(btrim(coalesce(p_note, '')), 500), auth.uid()) returning * into r;
  if p_kind = '100hr' then
    update planes set next_100_at = round(p_hobbs, 1) + 100, hobbs_total = greatest(coalesce(hobbs_total, 0), round(p_hobbs, 1)) where id = p_plane;
  else
    update planes set annual_date = greatest(coalesce(annual_date, p_done_on), p_done_on) where id = p_plane;
  end if;
  return r;
end $$;
revoke execute on function public.log_inspection(uuid, text, date, numeric, text) from public, anon;
grant execute on function public.log_inspection(uuid, text, date, numeric, text) to authenticated;
