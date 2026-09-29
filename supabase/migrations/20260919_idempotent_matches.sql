create or replace function public.request_interaction(target_session_id_input uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare recorded_encounter encounters; matched boolean; revealed_username text; created_match_id uuid;
begin
  select * into recorded_encounter from encounters where observer_id=auth.uid() and target_session_id=target_session_id_input and expires_at>now() order by crossed_at desc limit 1;
  if recorded_encounter.id is null then raise exception 'Recent proximity encounter required'; end if;
  if not exists(select 1 from interaction_requests where requester_session_id=recorded_encounter.observer_session_id and target_session_id=recorded_encounter.target_session_id)
    and (select count(*) from interaction_requests where requester_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Request limit reached'; end if;
  insert into interaction_requests(requester_id,target_id,requester_session_id,target_session_id)
  values(auth.uid(),recorded_encounter.target_id,recorded_encounter.observer_session_id,recorded_encounter.target_session_id) on conflict do nothing;
  select exists(select 1 from interaction_requests where requester_id=recorded_encounter.target_id and target_id=auth.uid() and requester_session_id=recorded_encounter.target_session_id and target_session_id=recorded_encounter.observer_session_id and created_at>now()-interval '3 hours') into matched;
  if matched then
    select id into created_match_id from matches where user_low=least(auth.uid(),recorded_encounter.target_id) and user_high=greatest(auth.uid(),recorded_encounter.target_id);
    if created_match_id is null then
      insert into matches(user_low,user_high) values(least(auth.uid(),recorded_encounter.target_id),greatest(auth.uid(),recorded_encounter.target_id))
      on conflict(user_low,user_high) do nothing returning id into created_match_id;
      if created_match_id is null then select id into created_match_id from matches where user_low=least(auth.uid(),recorded_encounter.target_id) and user_high=greatest(auth.uid(),recorded_encounter.target_id); end if;
    end if;
    select username into revealed_username from profiles where id=recorded_encounter.target_id;
  end if;
  return jsonb_build_object('matched',matched,'match_id',created_match_id,'username',revealed_username);
end $$;

create or replace function public.accept_city_post_response(response_id_input uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare selected city_post_responses; responder_username text; created_match_id uuid;
begin
  select r.* into selected from city_post_responses r join city_posts p on p.id=r.post_id where r.id=response_id_input and p.user_id=auth.uid() and p.expires_at>now();
  if selected.id is null then raise exception 'Response unavailable'; end if;
  update city_post_responses set accepted_at=now() where id=selected.id and accepted_at is null;
  select id into created_match_id from matches where user_low=least(auth.uid(),selected.responder_id) and user_high=greatest(auth.uid(),selected.responder_id);
  if created_match_id is null then
    insert into matches(user_low,user_high) values(least(auth.uid(),selected.responder_id),greatest(auth.uid(),selected.responder_id))
    on conflict(user_low,user_high) do nothing returning id into created_match_id;
    if created_match_id is null then select id into created_match_id from matches where user_low=least(auth.uid(),selected.responder_id) and user_high=greatest(auth.uid(),selected.responder_id); end if;
  end if;
  select username into responder_username from profiles where id=selected.responder_id;
  return jsonb_build_object('matched',true,'match_id',created_match_id,'username',responder_username);
end $$;

revoke execute on function public.request_interaction(uuid) from public,anon;
revoke execute on function public.accept_city_post_response(uuid) from public,anon;
grant execute on function public.request_interaction(uuid) to authenticated;
grant execute on function public.accept_city_post_response(uuid) to authenticated;
