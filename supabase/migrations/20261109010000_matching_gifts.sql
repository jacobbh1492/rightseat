-- Get matched with an instructor, and gift discovery flights.
--
--  training_requests:      a student describes what they want (goal, airport, days, budget,
--                          style). The app ranks instructors (src/matching.js) and the student
--                          sends the request to up to 3 of them.
--  training_request_cfis:  each instructor it was sent to, and their answer.
--  gifts:                  a buyer pays for a flight up front (gift function, Stripe). The
--                          recipient redeems the code; at close-out the gift pays for as much of
--                          a lesson as it covers and their card pays the rest (booking-action).

-- ---------------------------------------------------------------- matching
create table if not exists public.training_requests (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles on delete cascade,
  goal       text not null check (length(goal) between 2 and 60),
  airport    text check (airport ~ '^[A-Z0-9]{3,4}$'),
  days       text[] not null default '{}',
  times      text[] not null default '{}',
  max_rate   numeric(8,2) check (max_rate is null or max_rate between 0 and 2000),
  need_plane boolean not null default true,
  glass      boolean not null default false,
  styles     text[] not null default '{}',
  note       text not null default '' check (length(note) <= 600),
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists training_requests_student on public.training_requests (student_id, created_at desc);
create table if not exists public.training_request_cfis (
  request_id   uuid not null references public.training_requests on delete cascade,
  cfi_id       uuid not null references public.cfis on delete cascade,
  reasons      text[] not null default '{}',
  status       text not null default 'sent' check (status in ('sent', 'interested', 'declined')),
  reply        text not null default '' check (length(reply) <= 600),
  responded_at timestamptz,
  primary key (request_id, cfi_id)
);
create index if not exists training_request_cfis_cfi on public.training_request_cfis (cfi_id, status);
alter table public.training_requests enable row level security;
alter table public.training_request_cfis enable row level security;
revoke all on public.training_requests, public.training_request_cfis from anon, authenticated;
grant select on public.training_requests, public.training_request_cfis to authenticated;
grant all on public.training_requests, public.training_request_cfis to service_role;

create or replace function public.sent_training_request(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from training_request_cfis where request_id = p_request and cfi_id = auth.uid())
$$;
revoke execute on function public.sent_training_request(uuid) from public;
grant execute on function public.sent_training_request(uuid) to authenticated, service_role;
create or replace function public.owns_training_request(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from training_requests where id = p_request and student_id = auth.uid())
$$;
revoke execute on function public.owns_training_request(uuid) from public;
grant execute on function public.owns_training_request(uuid) to authenticated, service_role;

create policy "training requests read" on public.training_requests for select to authenticated using (
  student_id = auth.uid() or public.sent_training_request(id) or public.is_staff());
create policy "training request cfis read" on public.training_request_cfis for select to authenticated using (
  cfi_id = auth.uid() or public.owns_training_request(request_id) or public.is_staff());

-- p: { goal, airport, days, times, maxRate, needPlane, glass, styles, note }
-- p_matches: [{ cfiId, reasons: [..] }], 1 to 3, published & verified instructors only.
create or replace function public.send_training_request(p jsonb, p_matches jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; m jsonb; c uuid; n int := 0; who text; ap text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) not between 1 and 3 then raise exception 'Pick 1 to 3 instructors'; end if;
  if (select count(*) from training_requests where student_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You’ve sent 5 requests today. Give instructors a little time to answer.';
  end if;
  ap := nullif(upper(btrim(coalesce(p->>'airport', ''))), '');
  insert into training_requests (student_id, goal, airport, days, times, max_rate, need_plane, glass, styles, note)
  values (auth.uid(), left(btrim(coalesce(p->>'goal', '')), 60), ap,
    coalesce((select array_agg(left(x, 20)) from jsonb_array_elements_text(coalesce(p->'days', '[]')) x), '{}'),
    coalesce((select array_agg(left(x, 30)) from jsonb_array_elements_text(coalesce(p->'times', '[]')) x), '{}'),
    nullif(p->>'maxRate', '')::numeric, coalesce((p->>'needPlane')::boolean, true), coalesce((p->>'glass')::boolean, false),
    coalesce((select array_agg(left(x, 30)) from jsonb_array_elements_text(coalesce(p->'styles', '[]')) x), '{}'),
    left(btrim(coalesce(p->>'note', '')), 600))
  returning id into rid;
  who := public.first_name(auth.uid());
  for m in select * from jsonb_array_elements(p_matches) loop
    c := (m->>'cfiId')::uuid;
    if c = auth.uid() then raise exception 'You can’t send a request to yourself'; end if;
    if not exists (select 1 from cfis where id = c and published and verified) then raise exception 'One of those instructors isn’t taking students right now'; end if;
    insert into training_request_cfis (request_id, cfi_id, reasons)
    values (rid, c, coalesce((select array_agg(left(x, 120)) from (select jsonb_array_elements_text(coalesce(m->'reasons', '[]')) x limit 4) s), '{}'))
    on conflict do nothing;
    perform public.notify(c, 'training_request', who || ' wants to train with you',
      left(coalesce(p->>'goal', 'Training'), 60) || coalesce(' at ' || ap, '') || '. You were one of their top matches.', jsonb_build_object('screen', 'StudentRequests'));
    n := n + 1;
  end loop;
  return rid;
end $$;
revoke execute on function public.send_training_request(jsonb, jsonb) from public, anon;
grant execute on function public.send_training_request(jsonb, jsonb) to authenticated;

create or replace function public.respond_training_request(p_request uuid, p_interested boolean, p_reply text default '')
returns public.training_request_cfis language plpgsql security definer set search_path = public as $$
declare r training_request_cfis; st uuid;
begin
  select * into r from training_request_cfis where request_id = p_request and cfi_id = auth.uid();
  if r.request_id is null then raise exception 'That request wasn’t sent to you'; end if;
  select student_id into st from training_requests where id = p_request and status = 'open';
  if st is null then raise exception 'The student closed this request'; end if;
  update training_request_cfis set status = case when p_interested then 'interested' else 'declined' end,
    reply = left(btrim(coalesce(p_reply, '')), 600), responded_at = now()
  where request_id = p_request and cfi_id = auth.uid() returning * into r;
  if p_interested then
    perform public.notify(st, 'training_match', public.first_name(auth.uid()) || ' would love to fly with you',
      coalesce(nullif(left(r.reply, 140), ''), 'Message them or book a first lesson.'), jsonb_build_object('screen', 'MyMatches'));
  end if;
  return r;
end $$;
revoke execute on function public.respond_training_request(uuid, boolean, text) from public, anon;
grant execute on function public.respond_training_request(uuid, boolean, text) to authenticated;

create or replace function public.close_training_request(p_request uuid) returns void
language sql security definer set search_path = public as $$
  update training_requests set status = 'closed' where id = p_request and student_id = auth.uid()
$$;
revoke execute on function public.close_training_request(uuid) from public, anon;
grant execute on function public.close_training_request(uuid) to authenticated;

-- ---------------------------------------------------------------- gifts
create table if not exists public.gifts (
  id                uuid primary key default gen_random_uuid(),
  buyer_id          uuid not null references public.profiles,
  code              text unique check (code ~ '^RS-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  amount            numeric(8,2) not null check (amount between 50 and 1500),
  remaining         numeric(8,2) not null default 0 check (remaining >= 0 and remaining <= amount),
  recipient_name    text not null check (length(recipient_name) between 1 and 80),
  recipient_email   text check (recipient_email is null or recipient_email = lower(recipient_email)),
  from_name         text not null default '' check (length(from_name) <= 80),
  message           text not null default '' check (length(message) <= 500),
  cfi_id            uuid references public.cfis on delete set null,   -- suggested instructor
  status            text not null default 'pending' check (status in ('pending', 'active', 'claimed', 'used', 'refunded')),
  payment_intent_id text unique,
  charge_id         text,
  recipient_id      uuid references public.profiles,
  paid_at           timestamptz,
  claimed_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists gifts_buyer on public.gifts (buyer_id, created_at desc);
create index if not exists gifts_recipient on public.gifts (recipient_id) where recipient_id is not null;
alter table public.gifts enable row level security;
revoke all on public.gifts from anon, authenticated;
grant select on public.gifts to authenticated;
grant all on public.gifts to service_role;
drop trigger if exists t_gifts on public.gifts;
create trigger t_gifts before update on public.gifts for each row execute function public.touch_updated_at();
-- The buyer sees the code to pass on; the recipient sees what's left.
create policy "gifts read" on public.gifts for select to authenticated using (buyer_id = auth.uid() or recipient_id = auth.uid() or public.is_staff());

alter table public.bookings
  add column if not exists gift_id   uuid references public.gifts,
  add column if not exists gift_used numeric(8,2);

-- Redeem a gift code: it becomes the signed-in pilot's to spend.
create or replace function public.claim_gift(p_code text) returns public.gifts
language plpgsql security definer set search_path = public as $$
declare g gifts; core text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if core like 'RS%' and length(core) = 10 then core := substr(core, 3); end if;
  if length(core) <> 8 then raise exception 'Gift codes look like RS-ABCD-2345'; end if;
  select * into g from gifts where code = 'RS-' || substr(core, 1, 4) || '-' || substr(core, 5, 4) for update;
  if g.id is null or g.status = 'pending' or g.status = 'refunded' then raise exception 'That gift code isn’t valid. Check the spelling and try again.'; end if;
  if g.recipient_id = auth.uid() then return g; end if;
  if g.recipient_id is not null then raise exception 'That gift was already redeemed'; end if;
  update gifts set recipient_id = auth.uid(), status = 'claimed', claimed_at = now() where id = g.id returning * into g;
  if g.buyer_id <> auth.uid() then
    perform public.notify(g.buyer_id, 'gift_claimed', g.recipient_name || ' redeemed your gift ✈️', 'They can book their flight now.', jsonb_build_object('screen', 'Gifts'));
  end if;
  return g;
end $$;
revoke execute on function public.claim_gift(text) from public, anon;
grant execute on function public.claim_gift(text) to authenticated;

-- Close-out (service role): take this booking's share from its gift, once.
-- Same rule as giftUse() in _shared/bookings.js: the gift covers what it can, and any card
-- remainder is at least Stripe's $0.50 minimum.
create or replace function public.apply_gift(p_booking uuid, p_total numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare b bookings; g gifts; t numeric := round(greatest(coalesce(p_total, 0), 0), 2); u numeric;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or b.gift_id is null then return 0; end if;
  if b.gift_used is not null then return b.gift_used; end if;
  select * into g from gifts where id = b.gift_id for update;
  if g.id is null or g.status not in ('claimed', 'active') or g.recipient_id is distinct from b.student_id then u := 0;
  elsif g.remaining >= t then u := t;
  elsif t - g.remaining < 0.5 then u := greatest(0, t - least(t, 0.5));
  else u := g.remaining;
  end if;
  u := round(u, 2);
  if u > 0 then
    update gifts set remaining = remaining - u, status = case when remaining - u <= 0 then 'used' else status end where id = g.id;
  end if;
  update bookings set gift_used = u where id = p_booking;
  return u;
end $$;
revoke execute on function public.apply_gift(uuid, numeric) from public, anon, authenticated;
grant execute on function public.apply_gift(uuid, numeric) to service_role;
