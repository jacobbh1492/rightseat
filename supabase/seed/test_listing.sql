-- Test listing for end-to-end booking tests (sandbox payments only).
-- A placeholder instructor/owner who cannot sign in (no password, unconfirmed
-- test address), one published CFI profile and one published Cessna 172.
-- Remove before launch:  delete from auth.users where email = 'test-cfi@mail.flyingrightseat.com';
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'test-cfi@mail.flyingrightseat.com', '{"full_name":"Test Instructor (sandbox)"}', '{"provider":"email","providers":["email"]}', now(), now())
on conflict (id) do nothing;

update public.profiles set roles = '{cfi,owner}', home_airport = 'KPIE', onboarded = true where id = 'a0000000-0000-4000-8000-000000000001';

insert into public.cfis (id, certs, flight_rate, ground_rate, discovery_price, specialties, availability, details, published)
values ('a0000000-0000-4000-8000-000000000001', '{CFI,CFII}', 70, 50, 149, '{"Private Pilot","Instrument","Discovery flights"}',
        '{Mon,Tue,Wed,Thu,Fri,Sat,Sun}', '{"bio":"Sandbox test instructor for payment testing. Not a real listing.","totalHours":1200}', true)
on conflict (id) do nothing;

insert into public.planes (id, owner_id, tail, make, model, year, category, owner_type, home_airport, wet_rate, dry_rate, details, hobbs_total, next_100_at, published)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'N0TEST', 'Cessna', '172S Skyhawk (test)', 2006, 'Single', 'Private owner', 'KPIE',
        160, 120, '{"blockRate":150,"soloRental":true,"notes":"Sandbox test aircraft. Not a real listing."}', 5000.0, 5090.0, true)
on conflict (id) do nothing;

insert into public.cfi_planes (cfi_id, plane_id) values ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001') on conflict do nothing;

select (select count(*) from public.cfis where published) as live_cfis, (select count(*) from public.planes where published) as live_planes;
