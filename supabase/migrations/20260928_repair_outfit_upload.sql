-- A failed/partial upload must never leave a free user unable to create the
-- outfit required by Street Mode. The 24-hour rule limits changes only while
-- the user already has a current valid outfit.

create or replace function public.get_outfit_change_allowance()
returns table(has_plus boolean, can_change boolean, last_changed_at timestamptz, next_available_at timestamptz)
language sql security definer set search_path=public as $$
  with state as (
    select
      exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) as plus,
      exists(select 1 from outfits where user_id=auth.uid() and moderation_status='approved' and expires_at>now()) as has_current,
      (select max(changed_at) from outfit_change_usage where user_id=auth.uid()) as last_change
  )
  select plus,
    plus or not has_current or last_change is null or last_change<=now()-interval '24 hours',
    last_change,
    case when plus or not has_current or last_change is null then null else last_change+interval '24 hours' end
  from state;
$$;

create or replace function public.can_upload_outfit()
returns boolean language plpgsql security definer set search_path=public,storage as $$
declare has_plus boolean; has_current boolean; last_change timestamptz;
begin
  if auth.uid() is null then return false; end if;
  select exists(select 1 from public.subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select exists(select 1 from public.outfits where user_id=auth.uid() and moderation_status='approved' and expires_at>now()) into has_current;
  select max(changed_at) into last_change from public.outfit_change_usage where user_id=auth.uid();
  return has_plus or not has_current or last_change is null or last_change<=now()-interval '24 hours';
end $$;

create or replace function public.create_pending_outfit(storage_path_input text)
returns jsonb language plpgsql security definer set search_path=public,storage as $$
declare created public.outfits; has_plus boolean; has_current boolean; last_change timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('outfit-upload:'||auth.uid()::text,0));
  if storage_path_input !~ ('^'||auth.uid()::text||'/[0-9]+\.(jpg|jpeg|png|webp)$') then raise exception 'Invalid outfit path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='outfits' and name=storage_path_input) then raise exception 'Uploaded outfit not found'; end if;
  select exists(select 1 from public.subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select exists(select 1 from public.outfits where user_id=auth.uid() and moderation_status='approved' and expires_at>now()) into has_current;
  select max(changed_at) into last_change from public.outfit_change_usage where user_id=auth.uid();
  if not has_plus and has_current and last_change>now()-interval '24 hours' then
    raise exception 'Your next outfit change will be available 24 hours after the previous one';
  end if;
  insert into public.outfits(user_id,storage_path,moderation_status,created_at,expires_at)
  values(auth.uid(),storage_path_input,'approved',now(),now()+interval '24 hours') returning * into created;
  insert into public.outfit_change_usage(user_id,changed_at) values(auth.uid(),now());
  return to_jsonb(created);
end $$;

revoke execute on function public.get_outfit_change_allowance() from public,anon;
revoke execute on function public.can_upload_outfit() from public,anon;
revoke execute on function public.create_pending_outfit(text) from public,anon;
grant execute on function public.get_outfit_change_allowance() to authenticated;
grant execute on function public.can_upload_outfit() to authenticated;
grant execute on function public.create_pending_outfit(text) to authenticated;
