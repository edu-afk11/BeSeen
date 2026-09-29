create or replace function public.report_city_post(post_id_input uuid,reason_input text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if reason_input not in ('personal_data','harassment','sexual_content','spam','other') then raise exception 'Invalid reason'; end if;
  if not exists(
    select 1 from city_posts p join profiles me on lower(me.city)=lower(p.city)
    where p.id=post_id_input and me.id=auth.uid() and p.user_id<>auth.uid()
      and p.moderation_status='approved' and p.expires_at>now()
  ) then raise exception 'Post unavailable'; end if;
  if (select count(*) from city_post_reports where reporter_id=auth.uid() and created_at>now()-interval '24 hours')>=10 then raise exception 'Report limit reached'; end if;
  insert into city_post_reports(post_id,reporter_id,reason) values(post_id_input,auth.uid(),reason_input) on conflict do nothing;
  if (select count(*) from city_post_reports where post_id=post_id_input)>=3 then update city_posts set moderation_status='pending' where id=post_id_input; end if;
end $$;

revoke execute on function public.report_city_post(uuid,text) from public,anon;
grant execute on function public.report_city_post(uuid,text) to authenticated;
