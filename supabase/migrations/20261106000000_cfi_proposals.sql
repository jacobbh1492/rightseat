-- Instructors can book a lesson for a student.
-- The instructor picks the student, time, plane and lesson; the booking starts as
-- "proposed" and holds the instructor's time and the plane. The student accepts by
-- saving their card (the same card step as booking themselves), which confirms it at
-- once: the instructor already chose the time. Proposals not accepted within 24 hours
-- (or 2 hours before the lesson) are released by the hourly sweep.

-- 'proposed' joins the booking statuses.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.bookings'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%requested%'
  loop execute format('alter table public.bookings drop constraint %I', c); end loop;
end $$;
alter table public.bookings add constraint bookings_status_check
  check (status in ('proposed', 'requested', 'confirmed', 'completed', 'cancelled', 'no_show', 'disputed'));
alter table public.bookings add column if not exists proposed_by uuid references public.profiles;  -- the instructor who booked it
alter table public.bookings add column if not exists proposal_expires timestamptz;

-- A proposal holds the time and the plane until it runs out.
create or replace function public.busy_times(p_cfi uuid, p_plane uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, kind text)
language sql stable security definer set search_path = public as $$
  select b.starts_at, coalesce(b.ends_at, b.starts_at + interval '3 hours'),
         case when p_cfi is not null and b.cfi_id = p_cfi then 'cfi' else 'plane' end
  from bookings b
  where (b.status in ('requested', 'confirmed') or (b.status = 'proposed' and b.proposal_expires > now()))
    and p_to - p_from <= interval '220 days'
    and b.starts_at < p_to and coalesce(b.ends_at, b.starts_at + interval '3 hours') > p_from
    and ((p_cfi is not null and b.cfi_id = p_cfi) or (p_plane is not null and b.plane_id = p_plane))
    and (b.card_ready or b.status in ('confirmed', 'proposed') or b.created_at > now() - interval '30 minutes')
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
  -- Lessons an instructor booked for a student: the student hears about it, the instructor
  -- hears when it's accepted, turned down or runs out.
  if new.status = 'proposed' and tg_op = 'INSERT' then
    perform public.notify(new.student_id, 'proposal', public.first_name(new.cfi_id) || ' booked you a lesson',
      whenl || ' · ' || new.goal || '. Accept by ' || to_char(new.proposal_expires at time zone 'America/New_York', 'Dy FMHH12:MI AM') || ' to lock it in.',
      jsonb_build_object('screen', 'Lessons'));
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'proposed' and new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.notify(new.cfi_id, 'proposal_accepted', student || ' accepted ✓', whenl || ' · ' || new.goal || ' is confirmed.', jsonb_build_object('screen', 'Teaching'));
    elsif new.status = 'cancelled' and new.cancelled_by = new.student_id then
      perform public.notify(new.cfi_id, 'proposal_declined', student || ' can’t make it', 'They turned down ' || whenl || '. The time is open again.', jsonb_build_object('screen', 'Teaching'));
    elsif new.status = 'cancelled' and new.cancelled_by = new.cfi_id then
      perform public.notify(new.student_id, 'cancelled', 'Lesson withdrawn', public.first_name(new.cfi_id) || ' withdrew the lesson for ' || whenl || '. No charge.', jsonb_build_object('screen', 'Lessons'));
    elsif new.status = 'cancelled' then
      perform public.notify(new.cfi_id, 'proposal_expired', 'Lesson not accepted', student || ' didn’t accept ' || whenl || ' in time, so it was released.', jsonb_build_object('screen', 'Teaching'));
    end if;
    return new;
  end if;
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

-- Proposals the student didn't accept in time: release the time (nothing was charged).
create or replace function public.proposal_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update bookings set status = 'cancelled', cancel_reason = 'Not accepted in time'
  where status = 'proposed' and proposal_expires <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.proposal_sweep() from public, anon, authenticated;

create or replace function public.booking_sweeps() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('splitsExpired', public.split_sweep(), 'proposalsExpired', public.proposal_sweep(), 'debriefReminders', public.debrief_reminders())
$$;
revoke execute on function public.booking_sweeps() from public, anon, authenticated;
grant execute on function public.booking_sweeps() to service_role;
