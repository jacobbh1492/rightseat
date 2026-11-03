-- Renter checks with real data (they used a built-in sample pilot before).
--   pilot_profiles:  the renter's certificate, medical, flight review and total hours.
--                    Entered by the pilot; checked against every plane (src/renterChecks.js).
--   plane_checkouts: the plane owner marks a pilot checked out in their plane, and for a
--                    student pilot records the solo endorsement they saw and when it ends.
-- The book and split functions enforce both for solo and shared rentals.

create table if not exists public.pilot_profiles (
  user_id            uuid primary key references public.profiles on delete cascade,
  certificate        text not null check (certificate in ('Student', 'Sport', 'Recreational', 'Private', 'Commercial', 'ATP')),
  medical_class      text not null check (medical_class in ('1st class', '2nd class', '3rd class', 'BasicMed', 'Driver’s license (Sport only)')),
  medical_expires    date not null,
  flight_review_date date,
  total_hours        numeric(7,1) not null check (total_hours >= 0 and total_hours < 100000),
  updated_at         timestamptz not null default now()
);
alter table public.pilot_profiles enable row level security;
revoke all on public.pilot_profiles from anon, authenticated;
grant select, insert, update on public.pilot_profiles to authenticated;
grant all on public.pilot_profiles to service_role;
drop trigger if exists t_pilot_profiles on public.pilot_profiles;
create trigger t_pilot_profiles before update on public.pilot_profiles for each row execute function public.touch_updated_at();

create table if not exists public.plane_checkouts (
  id           uuid primary key default gen_random_uuid(),
  plane_id     uuid not null references public.planes on delete cascade,
  pilot_id     uuid not null references public.profiles on delete cascade,
  status       text not null default 'requested' check (status in ('requested', 'approved', 'declined', 'revoked')),
  solo_until   date,                 -- student pilots: the solo endorsement's last day (61.87(n): 90 days)
  note         text not null default '' check (length(note) <= 500),
  decided_by   uuid references public.profiles,
  decided_at   timestamptz,
  requested_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (plane_id, pilot_id)
);
create index if not exists plane_checkouts_pilot on public.plane_checkouts (pilot_id);
alter table public.plane_checkouts enable row level security;
revoke all on public.plane_checkouts from anon, authenticated;
grant select on public.plane_checkouts to authenticated;
grant all on public.plane_checkouts to service_role;
drop trigger if exists t_plane_checkouts on public.plane_checkouts;
create trigger t_plane_checkouts before update on public.plane_checkouts for each row execute function public.touch_updated_at();

-- Who manages a plane's checkouts: its owner, or its school's admins.
create or replace function public.manages_plane(p_plane uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from planes p where p.id = p_plane and (p.owner_id = auth.uid() or public.is_school_admin(p.school_id)))
$$;
revoke execute on function public.manages_plane(uuid) from public;
grant execute on function public.manages_plane(uuid) to authenticated, service_role;

create policy "checkouts read" on public.plane_checkouts for select to authenticated using (
  pilot_id = auth.uid() or public.manages_plane(plane_id) or public.is_staff());

-- Pilots see and edit their own profile. A plane's owner sees the profile of anyone who
-- asked to be checked out in it, or who booked it (so they can check them before the flight).
create policy "pilot profile own" on public.pilot_profiles for select to authenticated using (
  user_id = auth.uid() or public.is_staff()
  or exists (select 1 from plane_checkouts c where c.pilot_id = user_id and public.manages_plane(c.plane_id))
  or exists (select 1 from bookings b where b.student_id = user_id and b.cfi_id is null and public.manages_plane(b.plane_id)));
create policy "pilot profile insert" on public.pilot_profiles for insert to authenticated with check (user_id = auth.uid());
create policy "pilot profile update" on public.pilot_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Checkouts change only through these two functions, so a pilot can't approve themselves
-- and an owner can't touch another owner's planes.
create or replace function public.request_checkout(p_plane uuid, p_note text default '')
returns public.plane_checkouts language plpgsql security definer set search_path = public as $$
declare r plane_checkouts; owner uuid; v_tail text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select owner_id, planes.tail into owner, v_tail from planes where id = p_plane and published;
  if owner is null then raise exception 'That plane isn’t listed'; end if;
  if owner = auth.uid() then raise exception 'You own this plane'; end if;
  insert into plane_checkouts (plane_id, pilot_id, note) values (p_plane, auth.uid(), left(coalesce(p_note, ''), 500))
  on conflict (plane_id, pilot_id) do update
    set status = case when plane_checkouts.status = 'approved' then 'approved' else 'requested' end,
        note = excluded.note, requested_at = case when plane_checkouts.status = 'approved' then plane_checkouts.requested_at else now() end
  returning * into r;
  if r.status = 'requested' then
    perform public.notify(owner, 'checkout_request', public.first_name(auth.uid()) || ' wants to rent your plane',
      'Asked to be checked out in ' || v_tail || '. Review their pilot profile.',
      jsonb_build_object('screen', 'Checkouts'));
  end if;
  return r;
end $$;
revoke execute on function public.request_checkout(uuid, text) from public, anon;
grant execute on function public.request_checkout(uuid, text) to authenticated;

create or replace function public.decide_checkout(p_id uuid, p_status text, p_solo_until date default null, p_note text default null)
returns public.plane_checkouts language plpgsql security definer set search_path = public as $$
declare r plane_checkouts; t text;
begin
  select * into r from plane_checkouts where id = p_id;
  if r.id is null or not public.manages_plane(r.plane_id) then raise exception 'Not your plane'; end if;
  if p_status not in ('approved', 'declined', 'revoked') then raise exception 'Unknown decision'; end if;
  if p_solo_until is not null and (p_solo_until < current_date or p_solo_until > current_date + 90) then
    raise exception 'A solo endorsement lasts up to 90 days';
  end if;
  update plane_checkouts set status = p_status, solo_until = case when p_status = 'approved' then p_solo_until else null end,
    note = coalesce(left(p_note, 500), note), decided_by = auth.uid(), decided_at = now()
  where id = p_id returning * into r;
  select coalesce(tail, 'the plane') into t from planes where id = r.plane_id;
  perform public.notify(r.pilot_id, 'checkout_' || p_status,
    case p_status when 'approved' then 'You’re checked out ✓' when 'declined' then 'Checkout not approved' else 'Checkout removed' end,
    case p_status when 'approved' then 'You can rent ' || t || ' solo now.' else 'Contact the owner about renting ' || t || '.' end,
    jsonb_build_object('screen', 'Explore'));
  return r;
end $$;
revoke execute on function public.decide_checkout(uuid, text, date, text) from public, anon;
grant execute on function public.decide_checkout(uuid, text, date, text) to authenticated;
