-- Payments: saved-card setup, Connect payout readiness, final charge references.
alter table public.profiles add column if not exists payouts_ready boolean not null default false;   -- server-only
alter table public.schools  add column if not exists stripe_account_id text;                         -- server-only
alter table public.schools  add column if not exists payouts_ready boolean not null default false;   -- server-only
alter table public.bookings add column if not exists setup_intent_id text;                          -- server-only
alter table public.bookings add column if not exists card_ready boolean not null default false;     -- server-only
alter table public.bookings add column if not exists charge_id text;                                -- server-only
alter table public.bookings add column if not exists ends_at timestamptz;

-- Fast overlap checks for double-booking.
create index if not exists bookings_cfi_window   on public.bookings (cfi_id, starts_at, ends_at)   where status in ('requested','confirmed');
create index if not exists bookings_plane_window on public.bookings (plane_id, starts_at, ends_at) where status in ('requested','confirmed');

-- Webhook idempotency: each Stripe event is processed once.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;   -- no policies: server only
revoke all on public.stripe_events from authenticated, anon;

-- School admins edit their page, not billing/payout fields.
revoke update on public.schools from authenticated;
grant  update (name, home_airport, details, terms_model, terms_school_pct, terms_min_rate, terms_notice_days, published) on public.schools to authenticated;
