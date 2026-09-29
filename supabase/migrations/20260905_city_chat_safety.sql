create or replace function public.list_city_posts()
returns table(post_id uuid,description text,place_hint text,time_hint text,created_at timestamptz,response_sent boolean,is_own boolean)
language sql security definer set search_path=public as $$
select p.id,p.description,p.place_hint,p.time_hint,p.created_at,exists(select 1 from city_post_responses r where r.post_id=p.id and r.responder_id=auth.uid()),p.user_id=auth.uid()
from city_posts p join profiles viewer on viewer.id=auth.uid()
where lower(p.city)=lower(viewer.city) and (p.user_id=auth.uid() or p.moderation_status='approved') and p.expires_at>now()
  and (p.user_id=auth.uid() or not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=auth.uid())))
  and p.created_at>now()-case when exists(select 1 from subscriptions s where s.user_id=auth.uid() and s.entitlement='plus' and s.expires_at>now()) then interval '24 hours' else interval '3 hours' end
order by p.created_at desc limit 100 $$;

create or replace function public.respond_to_city_post(post_id_input uuid,outfit_id_input uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from outfits where id=outfit_id_input and user_id=auth.uid() and moderation_status='approved' and expires_at>now()) then raise exception 'Approved current outfit required'; end if;
  if (select count(*) from city_post_responses where responder_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Response limit reached'; end if;
  if not exists(select 1 from city_posts p join profiles me on lower(me.city)=lower(p.city) where p.id=post_id_input and me.id=auth.uid() and p.user_id<>auth.uid() and p.moderation_status='approved' and p.expires_at>now() and not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=auth.uid()))) then raise exception 'Post unavailable'; end if;
  insert into city_post_responses(post_id,responder_id,outfit_id) values(post_id_input,auth.uid(),outfit_id_input) on conflict do nothing;
end $$;

create or replace function public.report_city_post(post_id_input uuid,reason_input text) returns void language plpgsql security definer set search_path=public as $$
begin
  if reason_input not in ('personal_data','harassment','sexual_content','spam','other') then raise exception 'Invalid reason'; end if;
  if not exists(select 1 from city_posts where id=post_id_input and user_id<>auth.uid()) then raise exception 'Post unavailable'; end if;
  insert into city_post_reports(post_id,reporter_id,reason) values(post_id_input,auth.uid(),reason_input) on conflict do nothing;
  if (select count(*) from city_post_reports where post_id=post_id_input)>=3 then update city_posts set moderation_status='pending' where id=post_id_input; end if;
end $$;
