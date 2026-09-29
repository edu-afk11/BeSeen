delete from public.reports a using public.reports b
where a.target_session_id is not null and a.reporter_id=b.reporter_id and a.target_session_id=b.target_session_id
  and (a.created_at,a.id)>(b.created_at,b.id);
create unique index if not exists one_report_per_encounter on public.reports(reporter_id,target_session_id) where target_session_id is not null;

create or replace function public.block_encounter(target_session_id_input uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target_user uuid;
begin
  select target_id into target_user from encounters
  where observer_id=auth.uid() and target_session_id=target_session_id_input and expires_at>now()
  order by crossed_at desc limit 1;
  if target_user is null or target_user=auth.uid() then raise exception 'Invalid encounter'; end if;
  insert into blocks(blocker_id,blocked_id) values(auth.uid(),target_user) on conflict do nothing;
end $$;

create or replace function public.report_encounter(target_session_id_input uuid,reason_input text)
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
end $$;

revoke execute on function public.block_encounter(uuid) from public,anon;
revoke execute on function public.report_encounter(uuid,text) from public,anon;
grant execute on function public.block_encounter(uuid) to authenticated;
grant execute on function public.report_encounter(uuid,text) to authenticated;
