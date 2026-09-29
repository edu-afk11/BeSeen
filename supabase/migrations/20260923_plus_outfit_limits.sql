-- BeSeen Plus now unlocks city chat and unlimited outfit changes.
-- Free accounts can publish one outfit in each rolling 24-hour period.

update storage.buckets
set file_size_limit=10485760
where id='outfits';

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid='public.outfits'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%expires_at%created_at%4 hour%'
  loop
    execute format('alter table public.outfits drop constraint %I',constraint_name);
  end loop;
end $$;
alter table public.outfits alter column expires_at set default now()+interval '24 hours';
alter table public.outfits drop constraint if exists outfits_expiry_within_24_hours;
alter table public.outfits add constraint outfits_expiry_within_24_hours check(expires_at<=created_at+interval '24 hours');

create table if not exists public.outfit_change_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  changed_at timestamptz not null default now()
);
create index if not exists outfit_change_usage_user_time_idx
  on public.outfit_change_usage(user_id,changed_at desc);
alter table public.outfit_change_usage enable row level security;

create or replace function public.get_outfit_change_allowance()
returns table(has_plus boolean, can_change boolean, last_changed_at timestamptz, next_available_at timestamptz)
language sql security definer set search_path=public as $$
  with state as (
    select
      exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) as plus,
      (select max(changed_at) from outfit_change_usage where user_id=auth.uid()) as last_change
  )
  select plus, plus or last_change is null or last_change<=now()-interval '24 hours',
    last_change, case when plus or last_change is null then null else last_change+interval '24 hours' end
  from state;
$$;

create or replace function public.can_upload_outfit()
returns boolean language plpgsql security definer set search_path=public,storage as $$
declare has_plus boolean; last_change timestamptz;
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('outfit-upload:'||auth.uid()::text,0));
  select exists(select 1 from public.subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select max(changed_at) into last_change from public.outfit_change_usage where user_id=auth.uid();
  return has_plus or last_change is null or last_change<=now()-interval '24 hours';
end $$;

create or replace function public.create_pending_outfit(storage_path_input text)
returns jsonb language plpgsql security definer set search_path=public,storage as $$
declare created public.outfits; has_plus boolean; last_change timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('outfit-upload:'||auth.uid()::text,0));
  if storage_path_input !~ ('^'||auth.uid()::text||'/[0-9]+\.(jpg|jpeg|png|webp)$') then raise exception 'Invalid outfit path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='outfits' and name=storage_path_input and owner_id=auth.uid()::text) then raise exception 'Uploaded outfit not found'; end if;
  select exists(select 1 from public.subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select max(changed_at) into last_change from public.outfit_change_usage where user_id=auth.uid();
  if not has_plus and last_change>now()-interval '24 hours' then
    raise exception 'Tu próximo cambio de outfit estará disponible 24 horas después del último';
  end if;
  insert into public.outfits(user_id,storage_path,moderation_status,created_at,expires_at)
  values(auth.uid(),storage_path_input,'approved',now(),now()+interval '24 hours') returning * into created;
  insert into public.outfit_change_usage(user_id,changed_at) values(auth.uid(),now());
  return to_jsonb(created);
end $$;

-- Street mode remains part of the free core experience. Plus does not gate it.
create or replace function public.activate_street_mode(outfit_id_input uuid, latitude_input double precision, longitude_input double precision, expires_at_input timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if latitude_input not between -90 and 90 or longitude_input not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  if not exists(select 1 from identity_verifications where user_id=auth.uid() and status='verified' and adult_verified) then raise exception 'Identity and adult verification required'; end if;
  if not exists(select 1 from outfits where id=outfit_id_input and user_id=auth.uid() and moderation_status='approved' and expires_at>now()) then raise exception 'Approved outfit required'; end if;
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
  select exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()),
    (select count(*)::integer from street_activation_usage where user_id=auth.uid() and started_at>now()-interval '24 hours'),
    2147483647;
$$;

revoke execute on function public.get_outfit_change_allowance() from public,anon;
revoke execute on function public.can_upload_outfit() from public,anon;
revoke execute on function public.create_pending_outfit(text) from public,anon;
grant execute on function public.get_outfit_change_allowance() to authenticated;
grant execute on function public.can_upload_outfit() to authenticated;
grant execute on function public.create_pending_outfit(text) to authenticated;
