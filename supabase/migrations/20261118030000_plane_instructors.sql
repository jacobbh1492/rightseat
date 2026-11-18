-- Listing a plane: owners approve which instructors may teach in it, found by the email on
-- their Positive Rate account. The approved list lives in planes.details.approvedCfiIds;
-- details.lessons = false turns instruction off. The book function enforces both.

-- Find an instructor by account email. Returns their public instructor card only.
create or replace function public.find_cfi_by_email(p_email text)
returns table (id uuid, full_name text, avatar_url text, certs text[], home_airport text, verified boolean)
language plpgsql stable security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return; end if;
  return query
    select c.id, pr.full_name, pr.avatar_url, c.certs, pr.home_airport, c.verified
    from auth.users u join cfis c on c.id = u.id join profiles pr on pr.id = c.id
    where lower(u.email) = e limit 1;
end $$;
revoke execute on function public.find_cfi_by_email(text) from public, anon;
grant execute on function public.find_cfi_by_email(text) to authenticated;
