-- Learning Library: the lesson content ships in the app (src/library); the database
-- stores lesson ids only.
--   lesson_progress:   which lessons a student has studied, and when.
--   preflight_reviews: lessons an instructor assigns before one of their upcoming lessons.
-- The student gets a notification when a review is assigned or changed; the instructor
-- gets one when the student has studied every lesson in it (after it was assigned).

-- ---------------------------------------------------------------- studied lessons
create table if not exists public.lesson_progress (
  student_id uuid not null references public.profiles on delete cascade,
  lesson_id  text not null check (lesson_id ~ '^[a-z0-9-]{2,40}$'),
  studied_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);
alter table public.lesson_progress enable row level security;
revoke all on public.lesson_progress from anon, authenticated;
grant select, insert, update, delete on public.lesson_progress to authenticated;
grant all on public.lesson_progress to service_role;

-- The student, and any instructor they have a lesson with, can see what they've studied.
create policy "lesson progress read" on public.lesson_progress for select to authenticated using (
  student_id = auth.uid()
  or exists (select 1 from bookings b where b.student_id = lesson_progress.student_id and b.cfi_id = auth.uid())
  or public.is_staff());
create policy "lesson progress insert" on public.lesson_progress for insert to authenticated with check (student_id = auth.uid());
create policy "lesson progress update" on public.lesson_progress for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "lesson progress delete" on public.lesson_progress for delete to authenticated using (student_id = auth.uid());

-- ---------------------------------------------------------------- pre-flight reviews
create table if not exists public.preflight_reviews (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null unique references public.bookings on delete cascade,
  student_id   uuid not null references public.profiles on delete cascade,
  cfi_id       uuid not null references public.cfis on delete cascade,
  lesson_ids   text[] not null check (cardinality(lesson_ids) between 1 and 12),
  note         text not null default '' check (char_length(note) <= 500),
  assigned_at  timestamptz not null default now(),   -- reset when the lessons change
  completed_at timestamptz,                          -- set when every lesson is studied
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists preflight_reviews_student on public.preflight_reviews (student_id);
create index if not exists preflight_reviews_cfi on public.preflight_reviews (cfi_id);
alter table public.preflight_reviews enable row level security;
revoke all on public.preflight_reviews from anon, authenticated;
grant select, delete on public.preflight_reviews to authenticated;
grant insert (booking_id, lesson_ids, note) on public.preflight_reviews to authenticated;
grant update (lesson_ids, note) on public.preflight_reviews to authenticated;
grant all on public.preflight_reviews to service_role;

-- Student and instructor come from the booking, never from the client.
create or replace function public.prepare_preflight_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if tg_op = 'UPDATE' and new.booking_id is distinct from old.booking_id then
    raise exception 'A review stays with its lesson';
  end if;
  select student_id, cfi_id into b from bookings where id = new.booking_id;
  if b is null or b.cfi_id is null then raise exception 'Lesson not found'; end if;
  new.student_id := b.student_id;
  new.cfi_id := b.cfi_id;
  new.note := left(trim(coalesce(new.note, '')), 500);
  -- Drop duplicates and malformed ids, keeping the instructor's order.
  select coalesce(array_agg(l order by ord), '{}') into new.lesson_ids from (
    select l, min(ord) as ord from unnest(new.lesson_ids) with ordinality u(l, ord)
    where l ~ '^[a-z0-9-]{2,40}$' group by l) x;
  new.updated_at := now();
  -- New or changed lessons start the clock again. (Clients can't write assigned_at or
  -- completed_at; the completion trigger below sets completed_at.)
  if tg_op = 'INSERT' or new.lesson_ids is distinct from old.lesson_ids then
    new.assigned_at := now(); new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists preflight_reviews_prepare on public.preflight_reviews;
create trigger preflight_reviews_prepare before insert or update on public.preflight_reviews
  for each row execute function public.prepare_preflight_review();

-- Only the lesson's own instructor, and only while the lesson is still upcoming.
create policy "preflight read" on public.preflight_reviews for select to authenticated
  using (student_id = auth.uid() or cfi_id = auth.uid() or public.is_staff());
create policy "preflight insert" on public.preflight_reviews for insert to authenticated with check (
  cfi_id = auth.uid() and exists (
    select 1 from bookings b where b.id = booking_id and b.cfi_id = auth.uid() and b.status in ('requested', 'confirmed')));
create policy "preflight update" on public.preflight_reviews for update to authenticated
  using (cfi_id = auth.uid())
  with check (cfi_id = auth.uid() and exists (
    select 1 from bookings b where b.id = booking_id and b.cfi_id = auth.uid() and b.status in ('requested', 'confirmed')));
create policy "preflight delete" on public.preflight_reviews for delete to authenticated using (cfi_id = auth.uid());

-- ---------------------------------------------------------------- notifications
-- Student: a review was assigned (or its lessons changed).
create or replace function public.notify_preflight_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare whenl text; n int := cardinality(new.lesson_ids);
begin
  if tg_op = 'UPDATE' and new.lesson_ids is not distinct from old.lesson_ids and new.note is not distinct from old.note then
    return new;
  end if;
  select to_char(starts_at at time zone 'America/New_York', 'Dy Mon FMDD') into whenl from bookings where id = new.booking_id;
  perform public.notify(new.student_id, 'preflight_review',
    case when tg_op = 'INSERT' then 'Pre-flight review from ' else 'Review updated by ' end || public.first_name(new.cfi_id),
    'Study ' || n || ' lesson' || case when n = 1 then '' else 's' end || ' before your ' || coalesce(whenl, 'next') || ' lesson.',
    jsonb_build_object('screen', 'PreflightReview', 'params', jsonb_build_object('bookingId', new.booking_id)));
  return new;
end $$;
drop trigger if exists preflight_reviews_notify on public.preflight_reviews;
create trigger preflight_reviews_notify after insert or update on public.preflight_reviews
  for each row execute function public.notify_preflight_review();

-- Instructor: the student studied every lesson in the review (after it was assigned).
create or replace function public.complete_preflight_reviews() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    update preflight_reviews pr set completed_at = now()
    where pr.student_id = new.student_id and pr.completed_at is null and new.lesson_id = any (pr.lesson_ids)
      and not exists (
        select 1 from unnest(pr.lesson_ids) l
        where not exists (select 1 from lesson_progress p where p.student_id = pr.student_id and p.lesson_id = l and p.studied_at >= pr.assigned_at))
    returning pr.booking_id, pr.cfi_id, pr.student_id
  loop
    perform public.notify(r.cfi_id, 'preflight_done', public.first_name(r.student_id) || ' finished the pre-flight review',
      'Every assigned lesson is studied.', jsonb_build_object('screen', 'Schedule'));
  end loop;
  return new;
end $$;
drop trigger if exists lesson_progress_complete on public.lesson_progress;
create trigger lesson_progress_complete after insert or update on public.lesson_progress
  for each row execute function public.complete_preflight_reviews();
