-- Shared flights are always split 50/50: each pilot pays their pro rata share of the
-- operating expenses (14 CFR 61.113(c)). Previously the booker could pay 50–90%.
alter table public.booking_splits drop constraint if exists booking_splits_booker_pct_check;
alter table public.booking_splits add constraint booking_splits_booker_pct_check check (booker_pct = 50);
