-- Training record: flight conditions logged at close-out (night, cross-country, simulated
-- instrument), so a student's hours toward FAA minimums come from real, billed flights.
alter table public.bookings add column if not exists conditions jsonb not null default '{}';
