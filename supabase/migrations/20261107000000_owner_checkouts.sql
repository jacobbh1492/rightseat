-- Checkout flights with the owner.
-- A plane's owner can choose to do renter checkouts themselves (planes.details.checkoutBy:
-- 'cfi' | 'owner' | 'either'). A renter who isn't checked out books a "checkout flight":
-- a rental with the owner on board. At close-out the owner records the result; a pass marks
-- the renter checked out (plane_checkouts) for solo rentals.
alter table public.bookings add column if not exists purpose text check (purpose in ('checkout'));
