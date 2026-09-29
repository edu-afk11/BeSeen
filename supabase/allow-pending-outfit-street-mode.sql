-- Permite activar Modo Calle inmediatamente mientras la moderación trabaja.
-- Los outfits pendientes siguen sin aparecer a otros usuarios: find_recent_encounters
-- solo crea cruces cuando moderation_status = 'approved'.

create or replace function public.require_location_consent_for_street_mode()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(
    select 1 from legal_consents
    where user_id=auth.uid() and location_version='2026-09-03'
  ) then
    raise exception 'Location consent required';
  end if;

  if not exists(
    select 1 from outfits
    where id=new.outfit_id
      and user_id=auth.uid()
      and moderation_status in ('pending','approved')
      and expires_at>=new.expires_at
  ) then
    raise exception 'Outfit must remain valid for the complete session';
  end if;

  return new;
end $$;

create or replace function public.activate_street_mode(
  outfit_id_input uuid,
  latitude_input double precision,
  longitude_input double precision,
  expires_at_input timestamptz
)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; has_plus boolean; uses_last_24h integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if latitude_input not between -90 and 90 or longitude_input not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  if not exists(select 1 from identity_verifications where user_id = auth.uid() and status = 'verified' and adult_verified) then
    raise exception 'Identity and adult verification required';
  end if;
  if not exists(
    select 1 from outfits
    where id=outfit_id_input
      and user_id=auth.uid()
      and moderation_status in ('pending','approved')
      and expires_at>now()
  ) then
    raise exception 'Valid outfit required';
  end if;
  select exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select count(*) from street_activation_usage where user_id=auth.uid() and started_at>now()-interval '24 hours' into uses_last_24h;
  if not has_plus and uses_last_24h>=3 then raise exception 'Has usado tus 3 modos calle de las últimas 24 horas'; end if;
  update street_sessions set ended_at=now() where user_id=auth.uid() and ended_at is null;
  insert into street_sessions(user_id,outfit_id,location,expires_at)
  values(auth.uid(),outfit_id_input,st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography,now()+interval '30 minutes')
  returning id into new_id;
  insert into street_activation_usage(user_id,started_at) values(auth.uid(),now());
  return new_id;
end $$;

revoke execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) from public,anon;
grant execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) to authenticated;
