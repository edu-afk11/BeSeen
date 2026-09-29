create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  entitlement text not null check(entitlement='plus'),
  expires_at timestamptz not null,
  revenuecat_event_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "subscription owner reads self" on public.subscriptions for select using(user_id=auth.uid());

create or replace function public.activate_street_mode(outfit_id_input uuid, latitude_input double precision, longitude_input double precision, expires_at_input timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid; has_plus boolean; uses_last_24h integer;
begin
  if not exists(select 1 from identity_verifications where user_id=auth.uid() and status='verified' and adult_verified) then
    raise exception 'Identity and adult verification required';
  end if;
  if not exists(select 1 from outfits where id=outfit_id_input and user_id=auth.uid() and moderation_status='approved') then
    raise exception 'Approved outfit required';
  end if;
  select exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select count(*) into uses_last_24h from street_sessions where user_id=auth.uid() and started_at>now()-interval '24 hours';
  if not has_plus and uses_last_24h>=3 then raise exception 'Has usado tus 3 modos calle de las últimas 24 horas'; end if;
  update street_sessions set ended_at=now() where user_id=auth.uid() and ended_at is null;
  insert into street_sessions(user_id,outfit_id,location,expires_at)
  values(auth.uid(),outfit_id_input,st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography,least(expires_at_input,now()+interval '60 minutes'))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.get_street_mode_allowance()
returns table(has_plus boolean, used integer, remaining integer)
language sql security definer set search_path=public as $$
  with allowance as (
    select
      exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) as plus,
      (select count(*)::integer from street_sessions where user_id=auth.uid() and started_at>now()-interval '24 hours') as uses
  )
  select plus, uses, case when plus then 2147483647 else greatest(3-uses,0) end from allowance;
$$;

revoke execute on function public.get_street_mode_allowance() from public,anon;
grant execute on function public.get_street_mode_allowance() to authenticated;
