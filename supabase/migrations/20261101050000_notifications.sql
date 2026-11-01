-- Push notifications.
--   push_tokens:   each signed-in phone registers its Expo push token.
--   notifications: one row per thing a person should hear about (also usable as an
--                  in-app list later). Inserting a row sends it to that person's phones
--                  through Expo's push service (pg_net, asynchronous, so a slow push
--                  never blocks a booking or a message).
-- Events come from triggers on bookings, messages, debriefs and verifications, so every
-- path that changes them (app, server functions, staff tools, nightly jobs) notifies.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;
create policy "push tokens own" on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}',    -- where tapping it goes in the app
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;
create policy "notifications own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications mark read" on public.notifications for update to authenticated using (user_id = auth.uid());

-- Send a notification row to every phone the person has registered.
create or replace function public.push_notification() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', token, 'title', new.title, 'body', new.body, 'sound', 'default',
           'data', new.data || jsonb_build_object('notificationId', new.id)))
    into msgs from push_tokens where user_id = new.user_id;
  if msgs is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := msgs,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications for each row execute function public.push_notification();

create or replace function public.notify(uid uuid, kind text, title text, body text, data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, data) select uid, kind, title, body, data where uid is not null;
$$;
revoke execute on function public.notify(uuid, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.first_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(trim(full_name), ' ', 1), ''), 'Someone') from profiles where id = uid
$$;

-- ---- bookings
create or replace function public.notify_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  approver uuid;
  student text := public.first_name(new.student_id);
  whenl text := to_char(new.starts_at at time zone 'America/New_York', 'Dy Mon FMDD "at" FMHH12:MI AM');
  fee numeric;
begin
  approver := coalesce(new.cfi_id, (select owner_id from planes where id = new.plane_id));
  -- A request reaches the instructor/owner once the student's card is saved.
  if new.status = 'requested' and new.card_ready and (tg_op = 'INSERT' or not coalesce(old.card_ready, false)) then
    perform public.notify(approver, 'request', 'New lesson request', student || ' wants ' || whenl || ' · ' || new.goal, jsonb_build_object('screen', 'Teaching'));
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.notify(new.student_id, 'confirmed', 'Lesson confirmed ✓', whenl || ' · ' || new.goal, jsonb_build_object('screen', 'Lessons'));
    elsif new.status = 'completed' then
      perform public.notify(new.student_id, 'completed', 'Flight closed out',
        'Charged $' || to_char(coalesce((new.final_split->'final'->>'total')::numeric, 0), 'FM999,990.00') || ' for ' || coalesce(new.actual_hobbs::text, '?') || ' hr. Leave a review?',
        jsonb_build_object('screen', 'Lessons'));
    elsif new.status = 'cancelled' and old.status = 'requested' and new.cancelled_by = approver then
      perform public.notify(new.student_id, 'declined', 'Request declined', 'Your request for ' || whenl || ' wasn’t accepted. No charge.', jsonb_build_object('screen', 'Lessons'));
    elsif new.status = 'cancelled' and old.status in ('requested', 'confirmed') then
      select amount into fee from ledger where booking_id = new.id and kind = 'charge_late_cancel' limit 1;
      if new.cancelled_by = new.student_id then
        if old.status = 'confirmed' or old.card_ready then
          perform public.notify(approver, 'cancelled', 'Lesson cancelled', student || ' cancelled ' || whenl || coalesce(' · late fee $' || to_char(fee, 'FM999,990.00') || ' paid to you', ''), jsonb_build_object('screen', 'Teaching'));
        end if;
      elsif new.cancelled_by is not null then
        perform public.notify(new.student_id, 'cancelled', 'Lesson cancelled', 'Your lesson ' || whenl || ' was cancelled. No charge.', jsonb_build_object('screen', 'Lessons'));
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert or update on public.bookings for each row execute function public.notify_booking();

-- ---- messages
create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  select case when t.a = new.sender_id then t.b else t.a end into other from threads t where t.id = new.thread_id;
  perform public.notify(other, 'message', public.first_name(new.sender_id), left(new.body, 140),
    jsonb_build_object('screen', 'Chat', 'params', jsonb_build_object('key', new.sender_id, 'other', new.sender_id, 'name', public.first_name(new.sender_id))));
  return new;
end $$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function public.notify_message();

-- ---- debriefs
create or replace function public.notify_debrief() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.student_id, 'debrief', 'New debrief from ' || public.first_name(new.cfi_id),
    coalesce(nullif(left(new.next_plan, 120), ''), 'See what went well and what’s next.'), jsonb_build_object('screen', 'Training'));
  return new;
end $$;
drop trigger if exists debriefs_notify on public.debriefs;
create trigger debriefs_notify after insert on public.debriefs for each row execute function public.notify_debrief();

-- ---- verification results
create or replace function public.notify_verification() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid; what text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status not in ('passed', 'failed') then return new; end if;
  who := case when new.subject_type = 'cfi' then new.subject_id else (select owner_id from planes where id = new.subject_id) end;
  what := case new.check_type when 'identity' then 'ID check' when 'faa_airmen' then 'FAA instructor certificate'
    when 'faa_aircraft' then 'FAA registration' else 'Insurance' end;
  perform public.notify(who, 'verification',
    case when new.status = 'passed' then what || ' verified ✓' else what || ' needs attention' end,
    case when new.status = 'passed' then 'One step closer to taking bookings.' else coalesce(new.detail->>'reviewNote', new.detail->>'reason', 'Open RightSeat to see what to fix.') end,
    jsonb_build_object('screen', 'GetVerified'));
  return new;
end $$;
drop trigger if exists verifications_notify on public.verifications;
create trigger verifications_notify after insert or update on public.verifications for each row execute function public.notify_verification();
