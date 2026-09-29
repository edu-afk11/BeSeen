create or replace function public.require_location_consent_for_street_mode()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from legal_consents where user_id=auth.uid() and location_version='2026-09-03') then raise exception 'Location consent required'; end if;
  if not exists(select 1 from outfits where id=new.outfit_id and user_id=auth.uid() and moderation_status='approved' and expires_at>=new.expires_at) then raise exception 'Outfit must remain valid for the complete session'; end if;
  return new;
end $$;
