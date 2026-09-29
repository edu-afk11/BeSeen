create or replace function public.activate_street_mode(outfit_id_input uuid,latitude_input double precision,longitude_input double precision,expires_at_input timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid; has_plus boolean; uses_last_24h integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if latitude_input not between -90 and 90 or longitude_input not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  if not exists(select 1 from identity_verifications where user_id=auth.uid() and status='verified' and adult_verified) then raise exception 'Identity and adult verification required'; end if;
  if not exists(select 1 from outfits where id=outfit_id_input and user_id=auth.uid() and moderation_status='approved' and expires_at>now()) then raise exception 'Approved current outfit required'; end if;
  select exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select count(*) into uses_last_24h from street_sessions where user_id=auth.uid() and started_at>now()-interval '24 hours';
  if not has_plus and uses_last_24h>=3 then raise exception 'Street mode limit reached'; end if;
  update street_sessions set ended_at=now() where user_id=auth.uid() and ended_at is null;
  insert into street_sessions(user_id,outfit_id,location,expires_at)
  values(auth.uid(),outfit_id_input,st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography,now()+interval '30 minutes')
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.refresh_street_location(latitude_input double precision,longitude_input double precision)
returns void language plpgsql security definer set search_path=public as $$
begin
  if latitude_input not between -90 and 90 or longitude_input not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  update street_sessions set location=st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography
  where user_id=auth.uid() and ended_at is null and expires_at>now();
  if not found then raise exception 'No active street session'; end if;
end $$;

revoke execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) from public,anon;
revoke execute on function public.refresh_street_location(double precision,double precision) from public,anon;
grant execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) to authenticated;
grant execute on function public.refresh_street_location(double precision,double precision) to authenticated;
