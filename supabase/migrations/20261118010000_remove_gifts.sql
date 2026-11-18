-- Gift flights are removed from Positive Rate (Nov 18, 2026). The launch reset
-- (20261110010000) already cleared every test-era gift, so there is nothing to refund.
-- Also delete the deployed `gift` Edge Function: `supabase functions delete gift`.

drop function if exists public.apply_gift(uuid, numeric);
drop function if exists public.claim_gift(text);

alter table public.bookings
  drop column if exists gift_used,
  drop column if exists gift_id;

drop table if exists public.gifts;
