-- Messaging: contact info stays hidden until two people have a real booking together,
-- enforced in the database (the app shows the same rule, but can't be trusted to apply it).

create or replace function public.have_booked_together(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
    left join planes p on p.id = b.plane_id
    where b.status in ('confirmed', 'completed')
      and ((b.student_id = x and (b.cfi_id = y or p.owner_id = y))
        or (b.student_id = y and (b.cfi_id = x or p.owner_id = x)))
  )
$$;

create or replace function public.guard_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  other uuid;
  phone constant text := '(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}';
  email constant text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.]+';
  offapp constant text := '\m(venmo|zelle|cash ?app|paypal|pay (you|me) (in )?cash|cash only|off the app|outside the app|text me|call me|my (cell|number))\M';
  flags text[] := '{}';
begin
  select case when t.a = new.sender_id then t.b else t.a end into other from threads t where t.id = new.thread_id;
  new.body := left(trim(new.body), 4000);
  if new.body = '' then raise exception 'Empty message'; end if;
  if new.body ~ phone then flags := flags || 'phone'; end if;
  if new.body ~ email then flags := flags || 'email'; end if;
  if new.body ~* offapp then flags := flags || 'off_app'; end if;
  if not public.have_booked_together(new.sender_id, other) then
    new.body := regexp_replace(new.body, phone, '[number hidden until first booking]', 'g');
    new.body := regexp_replace(new.body, email, '[email hidden until first booking]', 'g');
  end if;
  new.flagged := flags;
  return new;
end $$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert on public.messages for each row execute function public.guard_message();

-- The insert policy required flagged = '{}' from the client; the trigger now sets it.
drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from threads t where t.id = thread_id and auth.uid() in (t.a, t.b)));

-- Read receipts: when each person last opened the thread.
alter table public.threads add column if not exists a_read_at timestamptz;
alter table public.threads add column if not exists b_read_at timestamptz;
alter table public.threads add column if not exists last_message_at timestamptz;
create policy "threads update" on public.threads for update to authenticated using (auth.uid() in (a, b));
revoke update on public.threads from authenticated;
grant update (a_read_at, b_read_at) on public.threads to authenticated;

create or replace function public.touch_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update threads set last_message_at = new.created_at,
    a_read_at = case when a = new.sender_id then new.created_at else a_read_at end,
    b_read_at = case when b = new.sender_id then new.created_at else b_read_at end
  where id = new.thread_id;
  return new;
end $$;
drop trigger if exists messages_touch on public.messages;
create trigger messages_touch after insert on public.messages for each row execute function public.touch_thread();

-- Live updates in the chat screen.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null;
end $$;
