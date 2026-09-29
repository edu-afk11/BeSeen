alter table public.profiles
  add column if not exists discovery_category text,
  add column if not exists discovery_preference text;

update public.profiles
set discovery_category=coalesce(discovery_category,'nonbinary'),
    discovery_preference=coalesce(discovery_preference,'everyone');

alter table public.profiles
  alter column discovery_category set not null,
  alter column discovery_preference set not null,
  add constraint profiles_discovery_category_check check(discovery_category in ('woman','man','nonbinary')),
  add constraint profiles_discovery_preference_check check(discovery_preference in ('woman','man','nonbinary','everyone'));

create or replace function public.update_discovery_preferences(category_input text, preference_input text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if category_input not in ('woman','man','nonbinary') or preference_input not in ('woman','man','nonbinary','everyone') then
    raise exception 'Invalid discovery preference';
  end if;
  update profiles set discovery_category=category_input, discovery_preference=preference_input where id=auth.uid();
end $$;

revoke execute on function public.update_discovery_preferences(text,text) from public,anon;
grant execute on function public.update_discovery_preferences(text,text) to authenticated;

create or replace function public.find_recent_encounters(latitude_input double precision, longitude_input double precision, radius_meters_input integer default 200)
returns table(session_id uuid, outfit_path text, crossed_at timestamptz, requested boolean)
language plpgsql security definer set search_path=public as $$
declare own_session street_sessions;
begin
  select * into own_session from street_sessions where user_id=auth.uid() and ended_at is null and expires_at>now() order by started_at desc limit 1;
  if own_session.id is not null then
    insert into encounters(observer_id,observer_session_id,target_id,target_session_id,target_outfit_id,crossed_at,expires_at)
    select auth.uid(),own_session.id,s.user_id,s.id,s.outfit_id,now(),now()+interval '3 hours'
    from street_sessions s
    join outfits o on o.id=s.outfit_id
    join profiles viewer on viewer.id=auth.uid()
    join profiles target on target.id=s.user_id
    where s.user_id<>auth.uid() and s.ended_at is null and s.expires_at>now() and o.moderation_status='approved'
      and st_dwithin(s.location,st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography,least(greatest(radius_meters_input,50),500))
      and not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=s.user_id) or (b.blocker_id=s.user_id and b.blocked_id=auth.uid()))
      and (viewer.discovery_preference='everyone' or viewer.discovery_preference=target.discovery_category)
      and (target.discovery_preference='everyone' or target.discovery_preference=viewer.discovery_category)
    on conflict(observer_session_id,target_session_id) do update set crossed_at=excluded.crossed_at,expires_at=excluded.expires_at;
  end if;
  return query
    select e.target_session_id,o.storage_path,e.crossed_at,
      exists(select 1 from interaction_requests r where r.requester_id=auth.uid() and r.target_session_id=e.target_session_id)
    from encounters e join outfits o on o.id=e.target_outfit_id
    where e.observer_id=auth.uid() and e.expires_at>now()
      and not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=e.target_id) or (b.blocker_id=e.target_id and b.blocked_id=auth.uid()))
    order by e.crossed_at desc limit 30;
end;
$$;

create policy "encounter observer reads temporary outfit" on storage.objects for select to authenticated
using (
  bucket_id='outfits' and exists(
    select 1 from public.outfits o
    join public.encounters e on e.target_outfit_id=o.id
    where o.storage_path=storage.objects.name and e.observer_id=auth.uid() and e.expires_at>now() and o.expires_at>now()
  )
);
