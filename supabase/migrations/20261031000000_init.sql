-- RightSeat — initial schema
-- Every table has Row Level Security on. Money moves only through the server
-- (service role); clients can never write payment, payout or verification state.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- people
create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  full_name     text not null default '',
  avatar_url    text,
  home_airport  text,
  phone         text,
  roles         text[] not null default '{student}',   -- student | cfi | owner | school_admin
  onboarded     boolean not null default false,
  stripe_customer_id text,           -- server-only
  stripe_account_id  text,           -- Connect account for payouts, server-only
  is_staff      boolean not null default false,          -- admin console access, server-only
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_staff from profiles where id = auth.uid()), false) $$;

-- New sign-ups get a profile row automatically.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- schools
create table public.schools (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  home_airport  text not null,
  details       jsonb not null default '{}',   -- about, programs, training types, phone, website…
  -- affiliation terms offered to instructors
  terms_model   text not null default 'split' check (terms_model in ('split','employee')),
  terms_school_pct numeric(4,3) not null default 0.25 check (terms_school_pct between 0 and 0.8),
  terms_min_rate numeric(8,2),
  terms_notice_days int not null default 14,
  plan          text not null default 'starter',
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table public.school_admins (
  school_id uuid references public.schools on delete cascade,
  user_id   uuid references public.profiles on delete cascade,
  primary key (school_id, user_id)
);
create or replace function public.is_school_admin(s uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from school_admins where school_id = s and user_id = auth.uid()) $$;

-- ---------------------------------------------------------------- instructors
create table public.cfis (
  id            uuid primary key references public.profiles on delete cascade,
  certs         text[] not null default '{CFI}',
  flight_rate   numeric(8,2) not null,
  ground_rate   numeric(8,2) not null,
  discovery_price numeric(8,2),
  specialties   text[] not null default '{}',
  availability  text[] not null default '{}',
  details       jsonb not null default '{}',   -- bio, style, background, languages, packages, hours…
  pro           boolean not null default false,             -- server-only (subscription)
  verified      boolean not null default false,             -- server-only (verification pipeline)
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- aircraft
create table public.planes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles on delete cascade,
  school_id     uuid references public.schools on delete set null,
  tail          text not null,
  make          text not null,
  model         text not null,
  year          int,
  category      text not null default 'Single',
  owner_type    text not null default 'Private owner',
  home_airport  text not null,
  wet_rate      numeric(8,2) not null,
  dry_rate      numeric(8,2),
  details       jsonb not null default '{}',   -- avionics, specs, rules, notes, art
  hobbs_total   numeric(8,1),
  next_100_at   numeric(8,1),
  insured       boolean not null default false,  -- server-only
  airworthy_verified boolean not null default false, -- server-only (FAA registry match)
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tail)
);
create table public.plane_photos (
  id        uuid primary key default gen_random_uuid(),
  plane_id  uuid not null references public.planes on delete cascade,
  path      text not null,             -- storage: plane-photos/<owner_id>/<plane_id>/<file>
  position  int not null default 0
);
create table public.squawks (
  id        uuid primary key default gen_random_uuid(),
  plane_id  uuid not null references public.planes on delete cascade,
  reported_by uuid references public.profiles,
  text      text not null,
  grounding boolean not null default false,
  status    text not null default 'open' check (status in ('open','deferred','fixed')),
  created_at timestamptz not null default now()
);
create table public.cfi_planes (
  cfi_id   uuid references public.cfis on delete cascade,
  plane_id uuid references public.planes on delete cascade,
  primary key (cfi_id, plane_id)
);

-- ---------------------------------------------------------------- school affiliations
create table public.affiliations (
  id          uuid primary key default gen_random_uuid(),
  cfi_id      uuid not null references public.cfis on delete cascade,
  school_id   uuid not null references public.schools on delete cascade,
  status      text not null default 'pending' check (status in ('pending','active','declined','ended')),
  model       text not null check (model in ('split','employee')),
  school_pct  numeric(4,3) not null check (school_pct between 0 and 0.8),
  set_rate    numeric(8,2),           -- employee model: the school sets the rate
  initiated_by text not null check (initiated_by in ('cfi','school')),
  message     text,
  proposed    jsonb,                  -- pending terms change awaiting the CFI (split model)
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);
-- One active school per instructor.
create unique index one_active_school on public.affiliations (cfi_id) where status = 'active';

-- ---------------------------------------------------------------- bookings
create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles,
  cfi_id        uuid references public.cfis,          -- null = solo rental
  plane_id      uuid references public.planes,
  affiliation_id uuid references public.affiliations,
  starts_at     timestamptz not null,
  goal          text not null,
  flight_hours  numeric(4,1) not null,
  ground_hours  numeric(4,1) not null default 0,
  status        text not null default 'requested'
                check (status in ('requested','confirmed','completed','cancelled','no_show','disputed')),
  quote         jsonb not null,      -- frozen fee breakdown at booking time (server computes)
  actual_hobbs  numeric(4,1),
  final_split   jsonb,               -- cfi / school / owner / platform / protection, server-only
  payment_intent_id text,            -- server-only
  cancelled_by  uuid references public.profiles,
  cancel_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.bookings (cfi_id, starts_at);
create index on public.bookings (plane_id, starts_at);
create index on public.bookings (student_id, starts_at);

-- ---------------------------------------------------------------- reviews (verified only)
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings on delete cascade,
  author_id   uuid not null references public.profiles,
  subject     text not null check (subject in ('cfi','plane')),
  rating      int not null check (rating between 1 and 5),
  tags        text[] not null default '{}',
  body        text not null default '',
  reply       text,
  hidden      boolean not null default false,   -- moderation, staff only
  created_at  timestamptz not null default now(),
  unique (booking_id, subject)
);

-- ---------------------------------------------------------------- messaging
create table public.threads (
  id         uuid primary key default gen_random_uuid(),
  a          uuid not null references public.profiles,
  b          uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  unique (a, b)
);
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads on delete cascade,
  sender_id  uuid not null references public.profiles,
  body       text not null,
  flagged    text[] not null default '{}',   -- anti-leakage scan results (phone, email, payment apps)
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- training records
create table public.training (
  student_id  uuid primary key references public.profiles on delete cascade,
  program     text not null default 'Private Pilot (ASEL)',
  primary_cfi uuid references public.cfis,
  hours       jsonb not null default '{}',
  completed_lessons text[] not null default '{}',
  endorsements jsonb not null default '[]',
  knowledge_test jsonb,
  prior       jsonb,          -- self-reported previous experience
  prior_status text not null default 'none' check (prior_status in ('none','self','confirmed')),
  prior_confirmed_by uuid references public.cfis,
  share_cfi_ids uuid[] not null default '{}',   -- instructors the student shares records with
  share_debriefs boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table public.debriefs (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid unique references public.bookings on delete set null,
  student_id  uuid not null references public.profiles on delete cascade,
  cfi_id      uuid references public.cfis,
  flown_on    date not null,
  grades      jsonb not null default '[]',
  went_well   text not null default '',
  needs_work  text not null default '',
  next_plan   text not null default '',
  homework    jsonb not null default '[]',
  student_note text not null default '',
  acknowledged boolean not null default false,
  locked_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Once the student reviews a debrief it is locked: the instructor's text can only
-- be corrected by an amendment. Students may still tick homework and add their note.
create or replace function public.guard_debrief() returns trigger language plpgsql as $$
begin
  if old.locked_at is not null and (
       new.grades is distinct from old.grades or new.went_well is distinct from old.went_well
    or new.needs_work is distinct from old.needs_work or new.next_plan is distinct from old.next_plan
    or new.cfi_id is distinct from old.cfi_id or new.flown_on is distinct from old.flown_on
    or new.locked_at is distinct from old.locked_at) then
    raise exception 'Debrief is locked; add an amendment instead';
  end if;
  if new.acknowledged and old.locked_at is null then new.locked_at = now(); end if;
  return new;
end $$;
create trigger debrief_lock before update on public.debriefs
  for each row execute function public.guard_debrief();

create table public.debrief_amendments (
  id         uuid primary key default gen_random_uuid(),
  debrief_id uuid not null references public.debriefs on delete cascade,
  author_id  uuid not null references public.profiles,
  body       text not null,
  read_by_student boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- verification
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles on delete cascade,
  plane_id    uuid references public.planes on delete cascade,
  doc_type    text not null,     -- cfi_cert, medical, insurance, registration, airworthiness, annual…
  path        text not null,     -- storage: documents/<owner_id>/<file>
  extracted   jsonb,             -- server-only
  checks      jsonb,             -- server-only
  status      text not null default 'processing'
              check (status in ('processing','approved','review','rejected','expired')),
  expires_on  date,
  reviewer_id uuid references public.profiles,
  review_note text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- money (server-written ledger)
create table public.ledger (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references public.bookings,
  party_id    uuid references public.profiles,
  school_id   uuid references public.schools,
  kind        text not null,      -- charge, refund, payout_cfi, payout_owner, payout_school, fee, credit
  amount      numeric(10,2) not null,
  stripe_ref  text,
  created_at  timestamptz not null default now()
);
create table public.wallets (
  user_id  uuid primary key references public.profiles on delete cascade,
  balance  numeric(10,2) not null default 0
);

-- ---------------------------------------------------------------- admin audit
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles,
  action     text not null,
  target     text,
  reason     text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- updated_at triggers
create trigger t_profiles  before update on public.profiles  for each row execute function public.touch_updated_at();
create trigger t_schools   before update on public.schools   for each row execute function public.touch_updated_at();
create trigger t_cfis      before update on public.cfis      for each row execute function public.touch_updated_at();
create trigger t_planes    before update on public.planes    for each row execute function public.touch_updated_at();
create trigger t_bookings  before update on public.bookings  for each row execute function public.touch_updated_at();
create trigger t_debriefs  before update on public.debriefs  for each row execute function public.touch_updated_at();
create trigger t_documents before update on public.documents for each row execute function public.touch_updated_at();
create trigger t_training  before update on public.training  for each row execute function public.touch_updated_at();

-- ================================================================ ROW LEVEL SECURITY
alter table public.profiles           enable row level security;
alter table public.schools            enable row level security;
alter table public.school_admins      enable row level security;
alter table public.cfis               enable row level security;
alter table public.planes             enable row level security;
alter table public.plane_photos       enable row level security;
alter table public.squawks            enable row level security;
alter table public.cfi_planes         enable row level security;
alter table public.affiliations       enable row level security;
alter table public.bookings           enable row level security;
alter table public.reviews            enable row level security;
alter table public.threads            enable row level security;
alter table public.messages           enable row level security;
alter table public.training           enable row level security;
alter table public.debriefs           enable row level security;
alter table public.debrief_amendments enable row level security;
alter table public.documents          enable row level security;
alter table public.ledger             enable row level security;
alter table public.wallets            enable row level security;
alter table public.audit_log          enable row level security;

-- Base privileges (new tables are not auto-exposed). RLS still decides which rows;
-- the column-level grants below decide which columns clients may write.
grant select on public.schools, public.cfis, public.planes, public.plane_photos, public.cfi_planes, public.reviews to anon;
grant select, insert, update on all tables in schema public to authenticated;
grant delete on public.plane_photos, public.cfi_planes to authenticated;
grant usage on all sequences in schema public to authenticated;

-- profiles: anyone signed in can see names/airports; you edit only yourself and
-- never the server-owned columns.
create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles update" on public.profiles for update to authenticated using (id = auth.uid());
revoke update on public.profiles from authenticated;
grant  update (full_name, avatar_url, home_airport, phone, roles, onboarded) on public.profiles to authenticated;

-- public listings
create policy "schools read"  on public.schools for select using (published or public.is_school_admin(id) or public.is_staff());
create policy "schools write" on public.schools for update to authenticated using (public.is_school_admin(id));
create policy "school admins read" on public.school_admins for select to authenticated using (user_id = auth.uid() or public.is_school_admin(school_id));

create policy "cfis read"   on public.cfis for select using (published or id = auth.uid() or public.is_staff());
create policy "cfis insert" on public.cfis for insert to authenticated with check (id = auth.uid() and not verified and not pro);
create policy "cfis update" on public.cfis for update to authenticated using (id = auth.uid());
revoke update on public.cfis from authenticated;
grant  update (certs, flight_rate, ground_rate, discovery_price, specialties, availability, details, published) on public.cfis to authenticated;

create policy "planes read"   on public.planes for select using (published or owner_id = auth.uid() or public.is_school_admin(school_id) or public.is_staff());
create policy "planes insert" on public.planes for insert to authenticated with check (owner_id = auth.uid() and not insured and not airworthy_verified);
create policy "planes update" on public.planes for update to authenticated using (owner_id = auth.uid() or public.is_school_admin(school_id));
revoke update on public.planes from authenticated;
grant  update (school_id, make, model, year, category, owner_type, home_airport, wet_rate, dry_rate, details, hobbs_total, next_100_at, published) on public.planes to authenticated;

create policy "photos read"  on public.plane_photos for select using (true);
create policy "photos write" on public.plane_photos for all to authenticated
  using (exists (select 1 from planes p where p.id = plane_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from planes p where p.id = plane_id and p.owner_id = auth.uid()));

create policy "squawks read"   on public.squawks for select to authenticated using (true);
create policy "squawks insert" on public.squawks for insert to authenticated with check (reported_by = auth.uid());
create policy "squawks owner"  on public.squawks for update to authenticated
  using (exists (select 1 from planes p where p.id = plane_id and (p.owner_id = auth.uid() or public.is_school_admin(p.school_id))));

create policy "cfi planes read"  on public.cfi_planes for select using (true);
create policy "cfi planes write" on public.cfi_planes for all to authenticated using (cfi_id = auth.uid()) with check (cfi_id = auth.uid());

-- affiliations: visible to that instructor and that school's admins. Status
-- changes go through server functions so both sides' rules are enforced.
create policy "affiliations read" on public.affiliations for select to authenticated
  using (cfi_id = auth.uid() or public.is_school_admin(school_id) or public.is_staff());

-- bookings: the student, the instructor, the plane owner and (for affiliated
-- instructors) the school can see a booking. Writes go through the server.
create policy "bookings read" on public.bookings for select to authenticated using (
  student_id = auth.uid() or cfi_id = auth.uid()
  or exists (select 1 from planes p where p.id = plane_id and (p.owner_id = auth.uid() or public.is_school_admin(p.school_id)))
  or exists (select 1 from affiliations a where a.id = affiliation_id and public.is_school_admin(a.school_id))
  or public.is_staff());

-- reviews: only the student on a completed booking can leave one.
create policy "reviews reply" on public.reviews for update to authenticated using (
  (subject = 'cfi' and exists (select 1 from bookings b where b.id = booking_id and b.cfi_id = auth.uid()))
  or (subject = 'plane' and exists (select 1 from bookings b join planes p on p.id = b.plane_id where b.id = booking_id and p.owner_id = auth.uid())));
revoke update on public.reviews from authenticated;
grant  update (reply) on public.reviews to authenticated;
create policy "reviews read" on public.reviews for select using (not hidden or author_id = auth.uid() or public.is_staff());
create policy "reviews insert" on public.reviews for insert to authenticated with check (
  author_id = auth.uid() and not hidden and reply is null and exists (
    select 1 from bookings b where b.id = booking_id and b.student_id = auth.uid() and b.status = 'completed'
      and ((subject = 'cfi' and b.cfi_id is not null) or (subject = 'plane' and b.plane_id is not null))));

-- messaging
create policy "threads read"   on public.threads for select to authenticated using (auth.uid() in (a, b) or public.is_staff());
create policy "threads insert" on public.threads for insert to authenticated with check (auth.uid() in (a, b));
create policy "messages read"  on public.messages for select to authenticated
  using (exists (select 1 from threads t where t.id = thread_id and auth.uid() in (t.a, t.b)) or public.is_staff());
create policy "messages insert" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and flagged = '{}' and exists (select 1 from threads t where t.id = thread_id and auth.uid() in (t.a, t.b)));

-- training: the student owns it; instructors they share with can read it.
create policy "training read" on public.training for select to authenticated
  using (student_id = auth.uid() or auth.uid() = any (share_cfi_ids) or auth.uid() = primary_cfi);
create policy "training insert" on public.training for insert to authenticated with check (student_id = auth.uid());
create policy "training update" on public.training for update to authenticated using (student_id = auth.uid());
revoke update on public.training from authenticated;
grant  update (program, primary_cfi, prior, share_cfi_ids, share_debriefs) on public.training to authenticated;

-- debriefs: written by the instructor; read by the student and by instructors the
-- student shares debriefs with (that's how a new CFI picks up where the last left off).
create policy "debriefs read" on public.debriefs for select to authenticated using (
  student_id = auth.uid() or cfi_id = auth.uid()
  or exists (select 1 from training t where t.student_id = debriefs.student_id and t.share_debriefs and auth.uid() = any (t.share_cfi_ids))
  or public.is_staff());
create policy "debriefs insert" on public.debriefs for insert to authenticated with check (
  cfi_id = auth.uid() and locked_at is null and not acknowledged and exists (select 1 from bookings b where b.id = booking_id and b.cfi_id = auth.uid() and b.student_id = debriefs.student_id));
create policy "debriefs cfi edit" on public.debriefs for update to authenticated using (cfi_id = auth.uid());
create policy "debriefs student" on public.debriefs for update to authenticated using (student_id = auth.uid());
revoke update on public.debriefs from authenticated;
grant  update (grades, went_well, needs_work, next_plan, homework, student_note, acknowledged) on public.debriefs to authenticated;
create or replace function public.debrief_column_owner() returns trigger language plpgsql as $$
begin
  if auth.uid() = old.student_id and auth.uid() is distinct from old.cfi_id then
    if new.grades is distinct from old.grades or new.went_well is distinct from old.went_well
       or new.needs_work is distinct from old.needs_work or new.next_plan is distinct from old.next_plan then
      raise exception 'Only the instructor can edit debrief content';
    end if;
  elsif auth.uid() = old.cfi_id then
    if new.student_note is distinct from old.student_note or (new.acknowledged and not old.acknowledged) then
      raise exception 'Only the student can review a debrief';
    end if;
  end if;
  return new;
end $$;
create trigger debrief_columns before update on public.debriefs for each row execute function public.debrief_column_owner();

create policy "amendments read" on public.debrief_amendments for select to authenticated
  using (exists (select 1 from debriefs d where d.id = debrief_id));   -- inherits debrief visibility
create policy "amendments insert" on public.debrief_amendments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from debriefs d where d.id = debrief_id and d.cfi_id = auth.uid()));
-- amendments are append-only: no update/delete policies.

-- documents: private to the owner (and staff). Status is set by the server.
create policy "documents read"   on public.documents for select to authenticated using (owner_id = auth.uid() or public.is_staff());
create policy "documents insert" on public.documents for insert to authenticated with check (owner_id = auth.uid() and status = 'processing' and extracted is null and checks is null and reviewer_id is null);
revoke update on public.documents from authenticated;

-- money and audit: read your own, never write.
revoke insert, update on public.ledger, public.wallets, public.audit_log, public.bookings, public.affiliations, public.school_admins from authenticated;
revoke insert on public.profiles, public.schools from authenticated;
create policy "ledger read"  on public.ledger  for select to authenticated
  using (party_id = auth.uid() or public.is_school_admin(school_id) or public.is_staff());
create policy "wallet read"  on public.wallets for select to authenticated using (user_id = auth.uid());
create policy "audit read"   on public.audit_log for select to authenticated using (public.is_staff());


-- ================================================================ STORAGE
insert into storage.buckets (id, name, public) values
  ('plane-photos', 'plane-photos', true),
  ('avatars', 'avatars', true),
  ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "public images read" on storage.objects for select using (bucket_id in ('plane-photos','avatars'));
create policy "own uploads" on storage.objects for insert to authenticated
  with check (bucket_id in ('plane-photos','avatars','documents') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own uploads update" on storage.objects for update to authenticated
  using (bucket_id in ('plane-photos','avatars','documents') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
