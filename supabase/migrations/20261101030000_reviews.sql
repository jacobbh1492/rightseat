-- Reviews: record what each review is about (the instructor or plane), so listings can
-- show their reviews publicly without exposing the private booking. The author's display
-- name is set from their profile as "First L." (no full surnames on public reviews).
alter table public.reviews add column if not exists subject_id uuid;
alter table public.reviews add column if not exists author_name text;
alter table public.reviews add column if not exists lesson text;
create index if not exists reviews_subject on public.reviews (subject, subject_id);

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
    when fullname = '' then 'RightSeat pilot'
    when position(' ' in fullname) = 0 then fullname
    else split_part(fullname, ' ', 1) || ' ' || left(split_part(fullname, ' ', array_length(string_to_array(fullname, ' '), 1)), 1) || '.'
  end;
  new.body := left(trim(coalesce(new.body, '')), 2000);
  return new;
end $$;
drop trigger if exists reviews_prepare on public.reviews;
create trigger reviews_prepare before insert on public.reviews for each row execute function public.prepare_review();

-- Replies are written by the instructor/owner; nothing else on a review is editable.
revoke update on public.reviews from authenticated;
grant update (reply) on public.reviews to authenticated;
