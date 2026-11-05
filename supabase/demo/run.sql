select json_build_object(
 'me', (select row_to_json(p) from (select u.id, u.email, pr.full_name, pr.roles from auth.users u join public.profiles pr on pr.id=u.id where u.email ilike 'jacobbh1492@gmail.com') p),
 'users', (select json_agg(json_build_object('id',u.id,'email',u.email,'name',pr.full_name,'roles',pr.roles)) from auth.users u left join public.profiles pr on pr.id=u.id),
 'cfis', (select json_agg(json_build_object('id',id,'published',published,'verified',to_jsonb(c)->'verified')) from public.cfis c),
 'planes', (select json_agg(json_build_object('id',id,'tail',tail,'owner',owner_id,'published',published)) from public.planes),
 'bookings', (select json_agg(to_jsonb(b)) from public.bookings b),
 'ledger', (select json_agg(to_jsonb(l)) from public.ledger l),
 'tables', (select json_agg(table_name order by table_name) from information_schema.tables where table_schema='public')
) as out;
