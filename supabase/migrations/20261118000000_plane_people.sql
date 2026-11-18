-- Plane people: an owner can share running a plane with co-owners, managers and view-only
-- members. Payouts always stay with the owner (planes.owner_id).
--
--   co_owner  everything except payouts: bookings, checkouts, rates & rules, squawks,
--             earnings, and adding or removing people
--   manager   day-to-day: bookings, checkouts, rates & rules, squawks (no earnings, no people)
--   viewer    sees the plane, its calendar and its status
--
-- Existing Positive Rate users are added straight away (and notified); anyone else gets an
-- invite tied to their email that they accept after signing up. Invites expire after 7 days.

create table if not exists public.plane_members (
  id           uuid primary key default gen_random_uuid(),
  plane_id     uuid not null references public.planes on delete cascade,
  email        text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  name         text not null default '' check (length(name) <= 80),
  user_id      uuid references public.profiles on delete cascade,
  role         text not null check (role in ('co_owner', 'manager', 'viewer')),
  status       text not null default 'invited' check (status in ('invited', 'active', 'declined', 'removed')),
  invited_by   uuid references public.profiles,
  note         text not null default '' check (length(note) <= 200),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  responded_at timestamptz,
  unique (plane_id, email)
);
create index if not exists plane_members_user on public.plane_members (user_id) where status = 'active';
alter table public.plane_members enable row level security;
revoke all on public.plane_members from anon, authenticated;
grant select on public.plane_members to authenticated;
grant all on public.plane_members to service_role;

-- The signed-in user's role on a plane: owner, co_owner, manager, viewer, or null.
create or replace function public.plane_role(p_plane uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from planes p where p.id = p_plane and p.owner_id = auth.uid()) then 'owner'
    else (select m.role from plane_members m where m.plane_id = p_plane and m.user_id = auth.uid() and m.status = 'active' limit 1)
  end
$$;
revoke execute on function public.plane_role(uuid) from public;
grant execute on function public.plane_role(uuid) to authenticated, service_role;

create or replace function public.is_plane_member(p_plane uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from plane_members m where m.plane_id = p_plane and m.user_id = auth.uid() and m.status = 'active')
$$;
revoke execute on function public.is_plane_member(uuid) from public;
grant execute on function public.is_plane_member(uuid) to authenticated, service_role;

-- Who manages a plane day to day: its owner, its school's admins, and active co-owners and
-- managers. Everything already gated on manages_plane (checkouts, squawks, inspections,
-- mechanic invites) now includes them.
create or replace function public.manages_plane(p_plane uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from planes p where p.id = p_plane and (p.owner_id = auth.uid() or public.is_school_admin(p.school_id)))
      or exists (select 1 from plane_members m where m.plane_id = p_plane and m.user_id = auth.uid()
                 and m.status = 'active' and m.role in ('co_owner', 'manager'))
$$;

-- Owner or co-owner (or school admin): can add and remove people and see earnings.
create or replace function public.co_owns_plane(p_plane uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from planes p where p.id = p_plane and (p.owner_id = auth.uid() or public.is_school_admin(p.school_id)))
      or exists (select 1 from plane_members m where m.plane_id = p_plane and m.user_id = auth.uid()
                 and m.status = 'active' and m.role = 'co_owner')
$$;
revoke execute on function public.co_owns_plane(uuid) from public;
grant execute on function public.co_owns_plane(uuid) to authenticated, service_role;

create policy "plane members read" on public.plane_members for select to authenticated using (
  public.manages_plane(plane_id) or public.is_plane_member(plane_id) or user_id = auth.uid()
  or email = lower(coalesce(auth.email(), '')) or public.is_staff());

-- Members see the plane even while it's unlisted.
drop policy if exists "planes read" on public.planes;
create policy "planes read" on public.planes for select using (
  published or owner_id = auth.uid() or public.is_school_admin(school_id) or public.is_staff()
  or public.is_plane_mechanic(id) or public.is_plane_member(id));

-- Co-owners and managers can edit rates, rules and details (column grants are unchanged;
-- payouts aren't on this table).
drop policy if exists "planes update" on public.planes;
create policy "planes update" on public.planes for update to authenticated using (public.manages_plane(id));

drop policy if exists "photos write" on public.plane_photos;
create policy "photos write" on public.plane_photos for all to authenticated
  using (public.manages_plane(plane_id)) with check (public.manages_plane(plane_id));

-- Every member (viewers too) can see the plane's bookings for its calendar. The app only
-- shows money to owners and co-owners.
create policy "bookings plane members read" on public.bookings for select to authenticated using (
  plane_id is not null and public.is_plane_member(plane_id));

-- ---------------------------------------------------------------- add / invite
create or replace function public.add_plane_member(p_plane uuid, p_email text, p_role text, p_name text default '', p_note text default '')
returns public.plane_members language plpgsql security definer set search_path = public as $$
declare r plane_members; e text := lower(btrim(coalesce(p_email, ''))); uid uuid; p planes; who text;
begin
  select * into p from planes where id = p_plane;
  if p.id is null then raise exception 'Plane not found'; end if;
  if not public.co_owns_plane(p_plane) then raise exception 'Only the owner or a co-owner can add people'; end if;
  if p_role not in ('co_owner', 'manager', 'viewer') then raise exception 'Pick a role'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Enter their email'; end if;
  if e = lower(coalesce(auth.email(), '')) then raise exception 'That’s your own email'; end if;
  if exists (select 1 from auth.users u where u.id = p.owner_id and lower(u.email) = e) then
    raise exception 'That’s the plane’s owner';
  end if;
  if (select count(*) from plane_members where plane_id = p_plane and status in ('invited', 'active')) >= 10 then
    raise exception 'Up to 10 people per plane';
  end if;
  select id into uid from auth.users where lower(email) = e limit 1;
  insert into plane_members (plane_id, email, name, user_id, role, status, invited_by, note, created_at, expires_at)
  values (p_plane, e, left(btrim(coalesce(p_name, '')), 80), uid, p_role,
          case when uid is not null then 'active' else 'invited' end, auth.uid(), left(btrim(coalesce(p_note, '')), 200),
          now(), now() + interval '7 days')
  on conflict (plane_id, email) do update set
    role = excluded.role, name = coalesce(nullif(excluded.name, ''), plane_members.name), note = excluded.note,
    user_id = coalesce(excluded.user_id, plane_members.user_id),
    status = case when plane_members.status = 'active' or excluded.user_id is not null then 'active' else 'invited' end,
    invited_by = auth.uid(), expires_at = now() + interval '7 days',
    responded_at = case when excluded.user_id is not null then now() else null end
  returning * into r;
  who := public.first_name(auth.uid());
  if uid is not null then
    perform public.notify(uid, 'plane_member_added', who || ' added you to ' || p.tail,
      'You’re now ' || case p_role when 'co_owner' then 'a co-owner' when 'manager' then 'a manager' else 'able to view' end
      || ' of ' || p.tail || '.', jsonb_build_object('screen', 'PlaneAccess'));
  end if;
  return r;
end $$;
revoke execute on function public.add_plane_member(uuid, text, text, text, text) from public, anon;
grant execute on function public.add_plane_member(uuid, text, text, text, text) to authenticated;

-- The invitee accepts or declines (signed up with the invited email).
create or replace function public.respond_plane_invite(p_id uuid, p_accept boolean)
returns public.plane_members language plpgsql security definer set search_path = public as $$
declare r plane_members; p planes;
begin
  select * into r from plane_members where id = p_id;
  if r.id is null or r.email <> lower(coalesce(auth.email(), '')) then raise exception 'That invite isn’t for this account'; end if;
  if r.status <> 'invited' then raise exception 'This invite was withdrawn'; end if;
  if r.expires_at < now() then raise exception 'This invite expired. Ask the owner to send a new one.'; end if;
  update plane_members set status = case when p_accept then 'active' else 'declined' end, user_id = auth.uid(), responded_at = now()
  where id = p_id returning * into r;
  select * into p from planes where id = r.plane_id;
  perform public.notify(r.invited_by, 'plane_member_' || r.status,
    public.first_name(auth.uid()) || case when p_accept then ' joined ' else ' declined access to ' end || p.tail,
    case when p_accept then 'They can now help run ' || p.tail || '.' else 'For ' || p.tail || '.' end,
    jsonb_build_object('screen', 'PlanePeople', 'planeId', p.id));
  return r;
end $$;
revoke execute on function public.respond_plane_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_plane_invite(uuid, boolean) to authenticated;

-- Change someone's role (owner or co-owner).
create or replace function public.set_plane_member_role(p_id uuid, p_role text)
returns public.plane_members language plpgsql security definer set search_path = public as $$
declare r plane_members;
begin
  select * into r from plane_members where id = p_id;
  if r.id is null or not public.co_owns_plane(r.plane_id) then raise exception 'Not allowed'; end if;
  if p_role not in ('co_owner', 'manager', 'viewer') then raise exception 'Pick a role'; end if;
  if r.user_id = auth.uid() then raise exception 'You can’t change your own role'; end if;
  update plane_members set role = p_role where id = p_id returning * into r;
  return r;
end $$;
revoke execute on function public.set_plane_member_role(uuid, text) from public, anon;
grant execute on function public.set_plane_member_role(uuid, text) to authenticated;

-- Remove someone (owner or co-owner), cancel an invite, or leave a plane yourself.
create or replace function public.remove_plane_member(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r plane_members;
begin
  select * into r from plane_members where id = p_id;
  if r.id is null or not (public.co_owns_plane(r.plane_id) or r.user_id = auth.uid()) then raise exception 'Not allowed'; end if;
  update plane_members set status = 'removed', responded_at = now() where id = p_id;
end $$;
revoke execute on function public.remove_plane_member(uuid) from public, anon;
grant execute on function public.remove_plane_member(uuid) to authenticated;

-- Look up an existing Positive Rate user by email before adding them (owner or co-owner of
-- this plane only). Returns just a display name, never the profile.
create or replace function public.find_pilot_for_plane(p_plane uuid, p_email text)
returns table (full_name text, avatar_url text) language plpgsql stable security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.co_owns_plane(p_plane) then raise exception 'Not your plane'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return; end if;
  return query select pr.full_name, pr.avatar_url from auth.users u join profiles pr on pr.id = u.id where lower(u.email) = e limit 1;
end $$;
revoke execute on function public.find_pilot_for_plane(uuid, text) from public, anon;
grant execute on function public.find_pilot_for_plane(uuid, text) to authenticated;

-- A solo-rental request reaches co-owners and managers too, not only the owner.
create or replace function public.notify_plane_managers_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record; t text;
begin
  if new.cfi_id is null and new.plane_id is not null and new.status = 'requested' and new.card_ready
     and (tg_op = 'INSERT' or not coalesce(old.card_ready, false)) then
    select tail into t from planes where id = new.plane_id;
    for m in select user_id from plane_members where plane_id = new.plane_id and status = 'active'
             and role in ('co_owner', 'manager') and user_id is not null loop
      perform public.notify(m.user_id, 'request', 'New rental request · ' || t,
        public.first_name(new.student_id) || ' wants ' || to_char(new.starts_at at time zone 'America/New_York', 'Dy Mon FMDD "at" FMHH12:MI AM'),
        jsonb_build_object('screen', 'Teaching'));
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists bookings_notify_plane_managers on public.bookings;
create trigger bookings_notify_plane_managers after insert or update of status, card_ready on public.bookings
  for each row execute function public.notify_plane_managers_request();
