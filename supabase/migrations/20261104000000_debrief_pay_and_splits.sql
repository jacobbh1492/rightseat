-- Debrief before pay, and shared solo rentals.
--
-- 1. Debrief before pay: on a lesson with an instructor, the instructor's (and their
--    school's) share is charged at close-out but waits in the ledger as await_<party>
--    until the debrief is written. booking-action "debrief" releases it. The instructor
--    is reminded 1, 3 and 7 days after the flight (debrief_reminders, run hourly).
--
-- 2. Shared solo rentals: the renter (the booker) invites another pilot by email and
--    picks their own share (50–90%). The booking holds the plane but isn't sent to the
--    owner until the other pilot accepts and pays a deposit of their share of the
--    estimate. At close-out each pays their share of the actual cost; the difference
--    from the deposit is charged or refunded. Invites that aren't accepted in time
--    release the plane (split_sweep, run hourly).

-- ---------------------------------------------------------------- ledger
-- source_id: the await_/held_ row a later payout (or hold) settles, so each is paid once.
alter table public.ledger add column if not exists source_id uuid references public.ledger on delete set null;
-- Unique: a row can only be settled once, even if two releases race.
create unique index if not exists ledger_source on public.ledger (source_id) where source_id is not null;
create index if not exists ledger_booking_kind on public.ledger (booking_id, kind);

-- ---------------------------------------------------------------- shared rentals
alter table public.bookings add column if not exists split_pending boolean not null default false; -- waiting on the other pilot
alter table public.bookings add column if not exists hold_until timestamptz;                       -- invite holds the plane until then

create table if not exists public.booking_splits (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.bookings on delete cascade,
  booker_id       uuid not null references public.profiles,
  partner_id      uuid not null references public.profiles,
  booker_pct      int not null check (booker_pct between 50 and 90 and booker_pct % 5 = 0),
  status          text not null default 'invited'
                  check (status in ('invited', 'accepted', 'declined', 'expired', 'cancelled', 'left')),
  deposit         numeric(10,2),     -- the other pilot's share of the estimate, paid on accepting
  deposit_pi_id   text,              -- server-only
  deposit_charge_id text,            -- server-only
  partner_pm      text,              -- server-only: card saved with the deposit, for any difference
  attested_at     timestamptz,       -- the other pilot confirmed they're current and meet the rental requirements
  invited_at      timestamptz not null default now(),
  responded_at    timestamptz,
  updated_at      timestamptz not null default now(),
  check (booker_id <> partner_id)
);
create index if not exists booking_splits_partner on public.booking_splits (partner_id);
alter table public.booking_splits enable row level security;
revoke all on public.booking_splits from anon, authenticated;
grant select (id, booking_id, booker_id, partner_id, booker_pct, status, deposit, attested_at, invited_at, responded_at)
  on public.booking_splits to authenticated;
grant all on public.booking_splits to service_role;
drop trigger if exists t_booking_splits on public.booking_splits;
create trigger t_booking_splits before update on public.booking_splits for each row execute function public.touch_updated_at();

-- Both pilots, the plane's owner (or its school's admins) and staff can see the split.
create policy "splits read" on public.booking_splits for select to authenticated using (
  booker_id = auth.uid() or partner_id = auth.uid() or public.is_staff()
  or exists (select 1 from bookings b join planes p on p.id = b.plane_id
             where b.id = booking_id and (p.owner_id = auth.uid() or public.is_school_admin(p.school_id))));

-- The other pilot can see the booking they were invited to (while the invite is live, or once they've accepted).
create or replace function public.is_split_partner(p_booking uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from booking_splits s where s.booking_id = p_booking and s.partner_id = auth.uid()
                 and s.status in ('invited', 'accepted', 'left'))
$$;
revoke execute on function public.is_split_partner(uuid) from public;
grant execute on function public.is_split_partner(uuid) to authenticated, service_role;

drop policy if exists "bookings read" on public.bookings;
create policy "bookings read" on public.bookings for select to authenticated using (
  student_id = auth.uid() or cfi_id = auth.uid()
  or exists (select 1 from planes p where p.id = plane_id and (p.owner_id = auth.uid() or public.is_school_admin(p.school_id)))
  or exists (select 1 from affiliations a where a.id = affiliation_id and public.is_school_admin(a.school_id))
  or public.is_split_partner(id)
  or public.is_staff());

-- Find the invited pilot's account by email (server only: never exposed to the app).
create or replace function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select u.id from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_email)) and u.deleted_at is null limit 1
$$;
revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- A booking waiting on the other pilot holds the slot only until its invite runs out.
create or replace function public.busy_times(p_cfi uuid, p_plane uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, kind text)
language sql stable security definer set search_path = public as $$
  select b.starts_at, coalesce(b.ends_at, b.starts_at + interval '3 hours'),
         case when p_cfi is not null and b.cfi_id = p_cfi then 'cfi' else 'plane' end
  from bookings b
  where b.status in ('requested', 'confirmed')
    and p_to - p_from <= interval '220 days'
    and b.starts_at < p_to and coalesce(b.ends_at, b.starts_at + interval '3 hours') > p_from
    and ((p_cfi is not null and b.cfi_id = p_cfi) or (p_plane is not null and b.plane_id = p_plane))
    and (b.card_ready or b.status = 'confirmed' or b.created_at > now() - interval '30 minutes')
    and (not b.split_pending or b.hold_until > now())
  union all
  select t.starts_at, t.ends_at, 'off'
  from cfi_time_off t
  where p_cfi is not null and t.cfi_id = p_cfi
    and p_to - p_from <= interval '220 days'
    and t.starts_at < p_to and t.ends_at > p_from
$$;
revoke execute on function public.busy_times(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.busy_times(uuid, uuid, timestamptz, timestamptz) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- notifications
create or replace function public.split_partner(p_booking uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select partner_id from booking_splits where booking_id = p_booking and status = 'accepted'
$$;
revoke execute on function public.split_partner(uuid) from public, anon, authenticated;

create or replace function public.notify_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  approver uuid;
  partner uuid := public.split_partner(new.id);
  invited record;
  student text := public.first_name(new.student_id);
  whenl text := to_char(new.starts_at at time zone 'America/New_York', 'Dy Mon FMDD "at" FMHH12:MI AM');
  fee numeric;
  sent boolean;
begin
  approver := coalesce(new.cfi_id, (select owner_id from planes where id = new.plane_id));
  -- A request reaches the instructor/owner once the student's card is saved
  -- (and, on a shared rental, once the other pilot has accepted and paid their deposit).
  sent := new.status = 'requested' and new.card_ready and not new.split_pending;
  if sent and (tg_op = 'INSERT' or not (coalesce(old.card_ready, false) and not coalesce(old.split_pending, false))) then
    perform public.notify(approver, 'request', 'New lesson request',
      student || coalesce(' + ' || public.first_name(partner), '') || ' want' || case when partner is null then 's ' else ' ' end || whenl || ' · ' || new.goal,
      jsonb_build_object('screen', 'Teaching'));
  end if;
  -- Shared rental: the invite goes out once the booker's card is saved.
  if new.status = 'requested' and new.card_ready and new.split_pending and (tg_op = 'INSERT' or not coalesce(old.card_ready, false)) then
    select s.id, s.partner_id, s.booker_pct into invited from booking_splits s where s.booking_id = new.id and s.status = 'invited';
    if invited.partner_id is not null then
      perform public.notify(invited.partner_id, 'split_invite', student || ' invited you to share a flight',
        whenl || ' · you pay ' || (100 - invited.booker_pct) || '% · reply by ' ||
        to_char(new.hold_until at time zone 'America/New_York', 'Dy FMHH12:MI AM'),
        jsonb_build_object('screen', 'SplitInvite', 'params', jsonb_build_object('id', new.id)));
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.notify(new.student_id, 'confirmed', 'Lesson confirmed ✓', whenl || ' · ' || new.goal, jsonb_build_object('screen', 'Lessons'));
      perform public.notify(partner, 'confirmed', 'Shared flight confirmed ✓', whenl || ' with ' || student, jsonb_build_object('screen', 'Lessons'));
    elsif new.status = 'completed' then
      perform public.notify(new.student_id, 'completed', 'Flight closed out',
        'Charged $' || to_char(coalesce((new.final_split->'final'->>'charged')::numeric, (new.final_split->'final'->>'total')::numeric, 0), 'FM999,990.00') || ' for ' || coalesce(new.actual_hobbs::text, '?') || ' hr. Leave a review?',
        jsonb_build_object('screen', 'Lessons'));
      if partner is not null then
        perform public.notify(partner, 'completed', 'Shared flight closed out',
          'Your share: $' || to_char(coalesce((new.final_split->'final'->>'partnerShare')::numeric, 0), 'FM999,990.00') || ' for ' || coalesce(new.actual_hobbs::text, '?') || ' hr.',
          jsonb_build_object('screen', 'Lessons'));
      end if;
    elsif new.status = 'cancelled' and old.status = 'requested' and new.cancelled_by = approver then
      perform public.notify(new.student_id, 'declined', 'Request declined', 'Your request for ' || whenl || ' wasn’t accepted. No charge.', jsonb_build_object('screen', 'Lessons'));
      perform public.notify(partner, 'declined', 'Shared flight declined', 'The owner didn’t accept ' || whenl || '. Your deposit is refunded.', jsonb_build_object('screen', 'Lessons'));
    elsif new.status = 'cancelled' and old.status in ('requested', 'confirmed') then
      select amount into fee from ledger where booking_id = new.id and kind = 'charge_late_cancel' limit 1;
      if new.cancelled_by = new.student_id then
        if (old.status = 'confirmed' or old.card_ready) and not old.split_pending then
          perform public.notify(approver, 'cancelled', 'Lesson cancelled', student || ' cancelled ' || whenl || coalesce(' · late fee $' || to_char(fee, 'FM999,990.00') || ' paid to you', ''), jsonb_build_object('screen', 'Teaching'));
        end if;
        perform public.notify(partner, 'cancelled', 'Shared flight cancelled', student || ' cancelled ' || whenl || '. Your deposit is refunded.', jsonb_build_object('screen', 'Lessons'));
      elsif new.cancelled_by is not null then
        perform public.notify(new.student_id, 'cancelled', 'Lesson cancelled', 'Your lesson ' || whenl || ' was cancelled. No charge.', jsonb_build_object('screen', 'Lessons'));
        if new.cancelled_by is distinct from partner then
          perform public.notify(partner, 'cancelled', 'Shared flight cancelled', whenl || ' was cancelled. Your deposit is refunded.', jsonb_build_object('screen', 'Lessons'));
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

-- The booker hears back when the other pilot answers (or the invite runs out).
create or replace function public.notify_split() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b record;
  partner text := public.first_name(new.partner_id);
  whenl text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select starts_at into b from bookings where id = new.booking_id;
  whenl := to_char(b.starts_at at time zone 'America/New_York', 'Dy Mon FMDD');
  if new.status = 'accepted' then
    perform public.notify(new.booker_id, 'split_accepted', partner || ' is in ✓', partner || ' paid their deposit for ' || whenl || '. Your request is now with the owner.', jsonb_build_object('screen', 'Lessons'));
  elsif new.status = 'declined' then
    perform public.notify(new.booker_id, 'split_declined', partner || ' can’t make it', 'Fly ' || whenl || ' solo, or cancel at no charge.', jsonb_build_object('screen', 'Lessons'));
  elsif new.status = 'expired' then
    perform public.notify(new.booker_id, 'split_expired', 'Invite ran out', partner || ' didn’t accept in time, so the plane was released for ' || whenl || '. No charge.', jsonb_build_object('screen', 'Lessons'));
    perform public.notify(new.partner_id, 'split_expired', 'Invite expired', 'The shared flight on ' || whenl || ' was released.', jsonb_build_object('screen', 'Lessons'));
  elsif new.status = 'left' then
    perform public.notify(new.booker_id, 'split_left', partner || ' left the flight', 'You’re now paying the full cost of ' || whenl || '. Cancel at no charge if you’d rather not fly.', jsonb_build_object('screen', 'Lessons'));
  end if;
  return new;
end $$;
drop trigger if exists booking_splits_notify on public.booking_splits;
create trigger booking_splits_notify after update on public.booking_splits for each row execute function public.notify_split();

-- ---------------------------------------------------------------- hourly sweeps
-- Shared rentals whose invite wasn't accepted in time: release the plane.
-- Nothing was charged (the deposit is only taken when the other pilot accepts).
create or replace function public.split_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with gone as (
    update bookings b set status = 'cancelled', cancel_reason = 'Shared-flight invite expired', split_pending = false
    where b.status = 'requested' and b.split_pending and b.hold_until <= now()
    returning b.id
  )
  update booking_splits s set status = 'expired', responded_at = now()
  from gone where s.booking_id = gone.id and s.status in ('invited', 'declined');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.split_sweep() from public, anon, authenticated;

-- Remind instructors whose pay is waiting on a debrief, 1, 3 and 7 days after the flight
-- (and weekly after that). Each reminder is sent once.
create or replace function public.debrief_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  stage int;
  n int := 0;
begin
  for r in
    select b.id, b.cfi_id, b.starts_at, public.first_name(b.student_id) as student,
           sum(l.amount) filter (where l.kind = 'await_cfi') as owed,
           extract(epoch from now() - coalesce(b.ends_at, b.starts_at)) / 86400 as days
    from bookings b
    join ledger l on l.booking_id = b.id and l.kind like 'await\_%'
                 and not exists (select 1 from ledger x where x.source_id = l.id)
    where b.status = 'completed' and b.cfi_id is not null
      and not exists (select 1 from debriefs d where d.booking_id = b.id)
    group by b.id
  loop
    stage := case when r.days >= 7 then 7 + 7 * floor((r.days - 7) / 7)::int
                  when r.days >= 3 then 3 when r.days >= 1 then 1 else 0 end;
    continue when stage = 0;
    continue when exists (select 1 from notifications x where x.user_id = r.cfi_id and x.kind = 'debrief_due'
                            and x.data->>'bookingId' = r.id::text and (x.data->>'stage')::int >= stage);
    perform public.notify(r.cfi_id, 'debrief_due', 'Write ' || r.student || '’s debrief to get paid',
      coalesce('$' || to_char(r.owed, 'FM999,990.00') || ' is waiting for the debrief from ', 'Your pay is waiting for the debrief from ')
        || to_char(r.starts_at at time zone 'America/New_York', 'Dy Mon FMDD') || '.',
      jsonb_build_object('screen', 'WriteDebrief', 'params', jsonb_build_object('id', r.id), 'bookingId', r.id, 'stage', stage));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.debrief_reminders() from public, anon, authenticated;

create or replace function public.booking_sweeps() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('splitsExpired', public.split_sweep(), 'debriefReminders', public.debrief_reminders())
$$;
revoke execute on function public.booking_sweeps() from public, anon, authenticated;
grant execute on function public.booking_sweeps() to service_role;
