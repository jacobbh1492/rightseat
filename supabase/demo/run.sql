select json_build_object(
 'cust', (select json_agg(json_build_object('id',id,'c',stripe_customer_id,'name',full_name, 'home', home_airport)) from public.profiles),
 'jcfi', (select to_jsonb(c) from public.cfis c where id='24b9cbd5-53ce-4a4a-bd52-32b09b913190'),
 'sched', (select json_agg(to_jsonb(s)) from public.cfi_schedules s),
 'cols', (select json_object_agg(table_name, cols) from (select table_name, json_agg(column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') order by ordinal_position) cols from information_schema.columns where table_schema='public' and table_name in ('debriefs','threads','messages','training','profiles','preflight_reviews','lesson_progress','notifications') group by table_name) t),
 'checks', (select json_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid in ('public.bookings'::regclass,'public.ledger'::regclass,'public.debriefs'::regclass) and contype in ('c','u','x')),
 'triggers', (select json_agg(tgname||' on '||tgrelid::regclass) from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'public.%')
) as out;
