-- Notification settings: people can turn off push for a category. The in-app notification
-- row is still written; only the phone push is skipped. Safety alerts always push.
alter table public.profiles add column if not exists notify_off text[] not null default '{}';
grant update (notify_off) on public.profiles to authenticated;

create or replace function public.notify_category(kind text) returns text
language sql immutable as $$
  select case
    when kind in ('plane_grounded', 'cancelled') then 'safety'
    when kind = 'message' then 'messages'
    when kind like 'debrief%' or kind like 'preflight%' or kind like 'training%' then 'training'
    when kind like 'squawk%' or kind like 'mechanic%' or kind like 'plane_member%' or kind like 'checkout%' then 'aircraft'
    when kind = 'verification' then 'account'
    else 'bookings'
  end $$;

create or replace function public.push_notification() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare msgs jsonb; cat text := notify_category(new.kind);
begin
  if cat <> 'safety' and exists (select 1 from profiles where id = new.user_id and cat = any(notify_off)) then
    return new;
  end if;
  select jsonb_agg(jsonb_build_object('to', token, 'title', new.title, 'body', new.body, 'sound', 'default',
           'data', new.data || jsonb_build_object('notificationId', new.id)))
    into msgs from push_tokens where user_id = new.user_id;
  if msgs is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := msgs,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
  end if;
  return new;
end $$;
