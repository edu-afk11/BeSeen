create table if not exists public.street_activation_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now()
);
create index if not exists street_activation_usage_user_time_idx on public.street_activation_usage(user_id,started_at desc);
alter table public.street_activation_usage enable row level security;

insert into public.street_activation_usage(user_id,started_at)
select user_id,started_at from public.street_sessions
where started_at>now()-interval '24 hours'
on conflict do nothing;

create or replace function public.activate_street_mode(outfit_id_input uuid, latitude_input double precision, longitude_input double precision, expires_at_input timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid; has_plus boolean; uses_last_24h integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if latitude_input not between -90 and 90 or longitude_input not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  if not exists(select 1 from identity_verifications where user_id=auth.uid() and status='verified' and adult_verified) then raise exception 'Identity and adult verification required'; end if;
  if not exists(select 1 from outfits where id=outfit_id_input and user_id=auth.uid() and moderation_status='approved' and expires_at>now()) then raise exception 'Approved outfit required'; end if;
  select exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select count(*) into uses_last_24h from street_activation_usage where user_id=auth.uid() and started_at>now()-interval '24 hours';
  if not has_plus and uses_last_24h>=3 then raise exception 'Has usado tus 3 modos calle de las últimas 24 horas'; end if;
  update street_sessions set ended_at=now() where user_id=auth.uid() and ended_at is null;
  insert into street_sessions(user_id,outfit_id,location,expires_at)
  values(auth.uid(),outfit_id_input,st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography,now()+interval '30 minutes')
  returning id into new_id;
  insert into street_activation_usage(user_id,started_at) values(auth.uid(),now());
  return new_id;
end $$;

create or replace function public.get_street_mode_allowance()
returns table(has_plus boolean, used integer, remaining integer)
language sql security definer set search_path=public as $$
  with allowance as (
    select exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) as plus,
      (select count(*)::integer from street_activation_usage where user_id=auth.uid() and started_at>now()-interval '24 hours') as uses
  )
  select plus,uses,case when plus then 2147483647 else greatest(3-uses,0) end from allowance;
$$;

create or replace function public.purge_expired_private_data()
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from city_posts where expires_at<now();
  delete from encounters where expires_at<now();
  update street_sessions set location=null where location is not null and (ended_at is not null or expires_at<now());
  delete from street_sessions where expires_at<now()-interval '4 hours';
  delete from street_activation_usage where started_at<=now()-interval '24 hours';
end $$;

revoke execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) from public,anon;
revoke execute on function public.get_street_mode_allowance() from public,anon;
revoke execute on function public.purge_expired_private_data() from public,anon,authenticated;
grant execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) to authenticated;
grant execute on function public.get_street_mode_allowance() to authenticated;
