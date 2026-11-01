-- Fix: build the flags array with array_append (text || text[] literal coercion failed).
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
  if new.body ~ phone then flags := array_append(flags, 'phone'); end if;
  if new.body ~ email then flags := array_append(flags, 'email'); end if;
  if new.body ~* offapp then flags := array_append(flags, 'off_app'); end if;
  if not public.have_booked_together(new.sender_id, other) then
    new.body := regexp_replace(new.body, phone, '[number hidden until first booking]', 'g');
    new.body := regexp_replace(new.body, email, '[email hidden until first booking]', 'g');
  end if;
  new.flagged := flags;
  return new;
end $$;
