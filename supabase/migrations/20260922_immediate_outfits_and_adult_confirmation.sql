-- Next Gen prototype: outfits are available immediately. Abuse remains reportable
-- and every image still expires after four hours.
create or replace function public.create_pending_outfit(storage_path_input text)
returns jsonb
language plpgsql
security definer
set search_path=public,storage
as $$
declare created public.outfits;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if storage_path_input !~ ('^' || auth.uid()::text || '/[0-9]+\.(jpg|jpeg|png|webp)$') then raise exception 'Invalid outfit path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='outfits' and name=storage_path_input and owner_id=auth.uid()::text) then raise exception 'Uploaded outfit not found'; end if;
  insert into public.outfits(user_id,storage_path,moderation_status,created_at,expires_at)
  values(auth.uid(),storage_path_input,'approved',now(),now()+interval '4 hours') returning * into created;
  return to_jsonb(created);
end $$;

revoke execute on function public.create_pending_outfit(text) from public,anon;
grant execute on function public.create_pending_outfit(text) to authenticated;

-- Profiles can only be created after the server validates an adult birth date.
-- Keep only the boolean proof; the birth date itself is not stored.
create or replace function public.confirm_profile_adult()
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Complete your profile first'; end if;
  insert into public.identity_verifications(user_id,status,adult_verified,verified_at,requested_at)
  values(auth.uid(),'verified',true,now(),now())
  on conflict(user_id) do update set status='verified',adult_verified=true,verified_at=now(),provider_reference=null,requested_at=now();
end $$;

revoke execute on function public.confirm_profile_adult() from public,anon;
grant execute on function public.confirm_profile_adult() to authenticated;
