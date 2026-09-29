-- Session rows remain briefly so recent encounters can reference them, but the
-- precise coordinate is no longer needed once visibility stops.
alter table public.street_sessions alter column location drop not null;

create or replace function public.erase_location_when_street_mode_ends()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.ended_at is not null then new.location=null; end if;
  return new;
end $$;
drop trigger if exists erase_ended_street_location on public.street_sessions;
create trigger erase_ended_street_location before update of ended_at on public.street_sessions
for each row execute function public.erase_location_when_street_mode_ends();

create or replace function public.activate_street_mode(outfit_id_input uuid, latitude_input double precision, longitude_input double precision, expires_at_input timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; has_plus boolean; uses_last_24h integer;
begin
  if not exists(select 1 from identity_verifications where user_id=auth.uid() and status='verified' and adult_verified) then
    raise exception 'Identity and adult verification required';
  end if;
  if not exists(select 1 from outfits where id=outfit_id_input and user_id=auth.uid() and moderation_status='approved' and expires_at>now()) then
    raise exception 'Approved current outfit required';
  end if;
  select exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select count(*) into uses_last_24h from street_sessions where user_id=auth.uid() and started_at>now()-interval '24 hours';
  if not has_plus and uses_last_24h>=3 then raise exception 'Street mode limit reached'; end if;
  update street_sessions set ended_at=now() where user_id=auth.uid() and ended_at is null;
  insert into street_sessions(user_id,outfit_id,location,expires_at)
  values(auth.uid(),outfit_id_input,st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography,least(expires_at_input,now()+interval '60 minutes'))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.deactivate_street_mode()
returns void language sql security definer set search_path = public as $$
  update street_sessions
  set ended_at=now(), location=null
  where user_id=auth.uid() and ended_at is null;
$$;

create or replace function public.purge_expired_private_data()
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from city_posts where expires_at<now();
  delete from encounters where expires_at<now();
  update street_sessions set location=null where location is not null and (ended_at is not null or expires_at<now());
  delete from storage.objects where bucket_id='outfits' and name in (select storage_path from outfits where expires_at<now());
  delete from outfits where expires_at<now();
  delete from street_sessions where expires_at<now()-interval '4 hours';
end $$;

revoke execute on function public.deactivate_street_mode() from public,anon;
revoke execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) from public,anon;
grant execute on function public.deactivate_street_mode() to authenticated;
grant execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) to authenticated;
revoke execute on function public.purge_expired_private_data() from public,anon,authenticated;
