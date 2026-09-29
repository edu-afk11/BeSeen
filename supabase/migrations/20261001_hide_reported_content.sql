create or replace function public.report_encounter(target_session_id_input uuid, reason_input text)
returns void language plpgsql security definer set search_path=public as $$
declare target_user uuid;
begin
  if reason_input not in ('inappropriate_outfit','harassment','fake_profile','other') then raise exception 'Invalid reason'; end if;
  select target_id into target_user from encounters
  where observer_id=auth.uid() and target_session_id=target_session_id_input and expires_at>now()
  order by crossed_at desc limit 1;
  if target_user is null or target_user=auth.uid() then raise exception 'Invalid encounter'; end if;
  if (select count(*) from reports where reporter_id=auth.uid() and created_at>now()-interval '24 hours')>=10 then raise exception 'Report limit reached'; end if;
  insert into reports(reporter_id,reported_id,target_session_id,reason)
  values(auth.uid(),target_user,target_session_id_input,reason_input) on conflict do nothing;
  delete from encounters where observer_id=auth.uid() and target_session_id=target_session_id_input;
end $$;

create or replace function public.list_city_posts()
returns table(post_id uuid,description text,place_hint text,time_hint text,created_at timestamptz,response_sent boolean,is_own boolean,moderation_status text)
language sql security definer set search_path=public as $$
  select p.id,p.description,p.place_hint,p.time_hint,p.created_at,
    exists(select 1 from city_post_responses r where r.post_id=p.id and r.responder_id=auth.uid()),
    p.user_id=auth.uid(),p.moderation_status
  from city_posts p join profiles viewer on viewer.id=auth.uid() join profiles author on author.id=p.user_id
  where lower(p.city)=lower(viewer.city) and (p.user_id=auth.uid() or p.moderation_status='approved') and p.expires_at>now()
    and (p.user_id=auth.uid() or ((viewer.discovery_preference='everyone' or viewer.discovery_preference=author.discovery_category) and (author.discovery_preference='everyone' or author.discovery_preference=viewer.discovery_category)))
    and (p.user_id=auth.uid() or not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=auth.uid())))
    and (p.user_id=auth.uid() or not exists(select 1 from city_post_reports cpr where cpr.post_id=p.id and cpr.reporter_id=auth.uid()))
    and p.created_at>now()-case when exists(select 1 from subscriptions s where s.user_id=auth.uid() and s.entitlement='plus' and s.expires_at>now()) then interval '24 hours' else interval '3 hours' end
  order by p.created_at desc limit 100;
$$;

revoke execute on function public.report_encounter(uuid,text) from public,anon;
revoke execute on function public.list_city_posts() from public,anon;
grant execute on function public.report_encounter(uuid,text) to authenticated;
grant execute on function public.list_city_posts() to authenticated;
