-- Rebrand: RightSeat → Positive Rate in database-generated text.
-- Re-creates two functions with their latest bodies; only the user-facing strings change.

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
    case when new.status = 'passed' then 'One step closer to taking bookings.' else coalesce(new.detail->>'reviewNote', new.detail->>'reason', 'Open Positive Rate to see what to fix.') end,
    jsonb_build_object('screen', 'GetVerified'));
  return new;
end $$;

create or replace function public.prepare_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record; fullname text;
begin
  select * into b from bookings where id = new.booking_id;
  new.subject_id := case new.subject when 'cfi' then b.cfi_id else b.plane_id end;
  new.lesson := b.goal;
  select full_name into fullname from profiles where id = new.author_id;
  fullname := trim(coalesce(fullname, ''));
  new.author_name := case
    when fullname = '' then 'Positive Rate pilot'
    when position(' ' in fullname) = 0 then fullname
    else split_part(fullname, ' ', 1) || ' ' || left(split_part(fullname, ' ', array_length(string_to_array(fullname, ' '), 1)), 1) || '.'
  end;
  new.body := left(trim(coalesce(new.body, '')), 2000);
  return new;
end $$;

update public.reviews set author_name = 'Positive Rate pilot' where author_name = 'RightSeat pilot';
update public.reviews set author_name = 'Former Positive Rate pilot' where author_name = 'Former RightSeat pilot';
