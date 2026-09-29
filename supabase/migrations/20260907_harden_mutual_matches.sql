-- Keep discovery local and prevent requests from unrelated sessions matching.
create or replace function public.find_recent_encounters(latitude_input double precision, longitude_input double precision, radius_meters_input integer default 50)
returns table(session_id uuid, outfit_path text, crossed_at timestamptz, requested boolean)
language plpgsql security definer set search_path = public as $$
declare own_session street_sessions;
begin
  select * into own_session from street_sessions where user_id=auth.uid() and ended_at is null and expires_at>now() order by started_at desc limit 1;
  if own_session.id is not null then
    insert into encounters(observer_id,observer_session_id,target_id,target_session_id,target_outfit_id,crossed_at,expires_at)
    select auth.uid(),own_session.id,s.user_id,s.id,s.outfit_id,now(),now()+interval '3 hours'
    from street_sessions s join outfits o on o.id=s.outfit_id
    join profiles viewer on viewer.id=auth.uid()
    join profiles target on target.id=s.user_id
    where s.user_id<>auth.uid() and s.ended_at is null and s.expires_at>now() and o.moderation_status='approved'
      and st_dwithin(s.location,st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography,50)
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

create or replace function public.request_interaction(target_session_id_input uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare recorded_encounter encounters; matched boolean; revealed_username text; created_match_id uuid;
begin
  select * into recorded_encounter from encounters where observer_id=auth.uid() and target_session_id=target_session_id_input and expires_at>now() order by crossed_at desc limit 1;
  if recorded_encounter.id is null then raise exception 'Recent proximity encounter required'; end if;
  if (select count(*) from interaction_requests where requester_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Request limit reached'; end if;
  insert into interaction_requests(requester_id,target_id,requester_session_id,target_session_id)
  values(auth.uid(),recorded_encounter.target_id,recorded_encounter.observer_session_id,recorded_encounter.target_session_id) on conflict do nothing;
  select exists(
    select 1 from interaction_requests
    where requester_id=recorded_encounter.target_id and target_id=auth.uid()
      and requester_session_id=recorded_encounter.target_session_id
      and target_session_id=recorded_encounter.observer_session_id
      and created_at>now()-interval '3 hours'
  ) into matched;
  if matched then
    insert into matches(user_low,user_high) values(least(auth.uid(),recorded_encounter.target_id),greatest(auth.uid(),recorded_encounter.target_id))
    on conflict(user_low,user_high) do update set user_low=excluded.user_low returning id into created_match_id;
    select username into revealed_username from profiles where id=recorded_encounter.target_id;
  end if;
  return jsonb_build_object('matched',matched,'match_id',created_match_id,'username',revealed_username);
end $$;

revoke execute on function public.find_recent_encounters(double precision,double precision,integer) from public,anon;
revoke execute on function public.request_interaction(uuid) from public,anon;
grant execute on function public.find_recent_encounters(double precision,double precision,integer) to authenticated;
grant execute on function public.request_interaction(uuid) to authenticated;
