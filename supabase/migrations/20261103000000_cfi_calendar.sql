-- Instructor calendar (Calendly-style).
--   cfi_schedules: weekly working hours in the instructor's time zone, plus booking rules
--                  (minimum notice, how far ahead, buffer after each lesson, start-time step).
--   cfi_time_off:  blocked time (a few hours or whole days), labels private to the instructor.
--   busy_times():  start/end of an instructor's or plane's busy times, with no names or
--                  labels, so students can see open slots without seeing anyone's bookings.
-- The book function enforces all of it (supabase/functions/_shared/schedule.js).

create table if not exists public.cfi_schedules (
  cfi_id           uuid primary key references public.cfis on delete cascade,
  timezone         text not null default 'America/New_York',
  weekly           jsonb not null default '{}',     -- { "mon": [[480, 720], [780, 1080]], ... } minutes after midnight
  min_notice_hours int not null default 2 check (min_notice_hours between 1 and 168),
  max_days_ahead   int not null default 60 check (max_days_ahead between 7 and 180),
  buffer_min       int not null default 30 check (buffer_min in (0, 15, 30, 45, 60)),
  increment_min    int not null default 30 check (increment_min in (15, 30, 60)),
  updated_at       timestamptz not null default now()
);
alter table public.cfi_schedules enable row level security;
revoke all on public.cfi_schedules from anon, authenticated;
grant select on public.cfi_schedules to anon, authenticated;
grant insert, update on public.cfi_schedules to authenticated;
grant all on public.cfi_schedules to service_role;

-- Working hours are public for bookable instructors (that's what students book against).
create policy "schedules read" on public.cfi_schedules for select using (
  cfi_id = auth.uid() or public.is_staff() or exists (select 1 from cfis c where c.id = cfi_id and c.published));
create policy "schedules insert" on public.cfi_schedules for insert to authenticated with check (cfi_id = auth.uid());
create policy "schedules update" on public.cfi_schedules for update to authenticated using (cfi_id = auth.uid()) with check (cfi_id = auth.uid());

-- Check the time zone and the weekly shape, and keep the profile's working-days list in step.
create or replace function public.prepare_cfi_schedule() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text; days text[] := '{}';
begin
  perform now() at time zone new.timezone;   -- raises on an unknown time zone
  if jsonb_typeof(new.weekly) <> 'object' then raise exception 'weekly must be an object'; end if;
  foreach k in array array['sun','mon','tue','wed','thu','fri','sat'] loop
    if new.weekly ? k and jsonb_typeof(new.weekly -> k) <> 'array' then raise exception 'weekly.% must be a list of ranges', k; end if;
    if jsonb_array_length(coalesce(new.weekly -> k, '[]')) > 0 then
      days := days || (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[array_position(array['sun','mon','tue','wed','thu','fri','sat'], k)];
    end if;
  end loop;
  new.updated_at := now();
  update cfis set availability = days where id = new.cfi_id;
  return new;
end $$;
drop trigger if exists cfi_schedules_prepare on public.cfi_schedules;
create trigger cfi_schedules_prepare before insert or update on public.cfi_schedules
  for each row execute function public.prepare_cfi_schedule();

create table if not exists public.cfi_time_off (
  id         uuid primary key default gen_random_uuid(),
  cfi_id     uuid not null default auth.uid() references public.cfis on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  all_day    boolean not null default false,
  label      text not null default '' check (char_length(label) <= 80),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '120 days')
);
create index if not exists cfi_time_off_window on public.cfi_time_off (cfi_id, starts_at, ends_at);
alter table public.cfi_time_off enable row level security;
revoke all on public.cfi_time_off from anon, authenticated;
grant select, insert, update, delete on public.cfi_time_off to authenticated;
grant all on public.cfi_time_off to service_role;
create policy "time off own" on public.cfi_time_off for all to authenticated
  using (cfi_id = auth.uid()) with check (cfi_id = auth.uid());

-- Busy times for an instructor and/or a plane between two instants (max ~7 months).
-- Same rules as the book function's overlap check: a request whose card was never
-- saved stops holding its slot after 30 minutes.
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
  union all
  select t.starts_at, t.ends_at, 'off'
  from cfi_time_off t
  where p_cfi is not null and t.cfi_id = p_cfi
    and p_to - p_from <= interval '220 days'
    and t.starts_at < p_to and t.ends_at > p_from
$$;
revoke execute on function public.busy_times(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.busy_times(uuid, uuid, timestamptz, timestamptz) to anon, authenticated, service_role;
