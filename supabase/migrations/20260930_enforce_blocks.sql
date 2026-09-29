create or replace function public.block_encounter(target_session_id_input uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target_user uuid;
begin
  select target_id into target_user from encounters
  where observer_id=auth.uid() and target_session_id=target_session_id_input and expires_at>now()
  order by crossed_at desc limit 1;
  if target_user is null or target_user=auth.uid() then raise exception 'Invalid encounter'; end if;
  insert into blocks(blocker_id,blocked_id) values(auth.uid(),target_user) on conflict do nothing;
  delete from interaction_requests where (requester_id=auth.uid() and target_id=target_user) or (requester_id=target_user and target_id=auth.uid());
  delete from city_post_responses r using city_posts p where r.post_id=p.id and ((r.responder_id=auth.uid() and p.user_id=target_user) or (r.responder_id=target_user and p.user_id=auth.uid()));
  delete from encounters where (observer_id=auth.uid() and target_id=target_user) or (observer_id=target_user and target_id=auth.uid());
  delete from matches where user_low=least(auth.uid(),target_user) and user_high=greatest(auth.uid(),target_user);
end $$;

create or replace function public.reject_blocked_request()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from blocks b where (b.blocker_id=new.requester_id and b.blocked_id=new.target_id) or (b.blocker_id=new.target_id and b.blocked_id=new.requester_id)) then raise exception 'Blocked relationship'; end if;
  return new;
end $$;

drop trigger if exists reject_blocked_interaction on public.interaction_requests;
create trigger reject_blocked_interaction before insert on public.interaction_requests for each row execute function public.reject_blocked_request();

create or replace function public.reject_blocked_match()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from blocks b where (b.blocker_id=new.user_low and b.blocked_id=new.user_high) or (b.blocker_id=new.user_high and b.blocked_id=new.user_low)) then raise exception 'Blocked relationship'; end if;
  return new;
end $$;

drop trigger if exists reject_blocked_match on public.matches;
create trigger reject_blocked_match before insert on public.matches for each row execute function public.reject_blocked_match();

revoke execute on function public.block_encounter(uuid) from public,anon;
grant execute on function public.block_encounter(uuid) to authenticated;
