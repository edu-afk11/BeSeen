drop function if exists public.list_city_posts();

create function public.list_city_posts()
returns table(post_id uuid,description text,place_hint text,time_hint text,created_at timestamptz,response_sent boolean,is_own boolean,moderation_status text)
language sql security definer set search_path=public as $$
  select p.id,p.description,p.place_hint,p.time_hint,p.created_at,
    exists(select 1 from city_post_responses r where r.post_id=p.id and r.responder_id=auth.uid()),
    p.user_id=auth.uid(),p.moderation_status
  from city_posts p
  join profiles viewer on viewer.id=auth.uid()
  join profiles author on author.id=p.user_id
  where lower(p.city)=lower(viewer.city)
    and (p.user_id=auth.uid() or p.moderation_status='approved')
    and p.expires_at>now()
    and (p.user_id=auth.uid() or (
      (viewer.discovery_preference='everyone' or viewer.discovery_preference=author.discovery_category)
      and (author.discovery_preference='everyone' or author.discovery_preference=viewer.discovery_category)
    ))
    and (p.user_id=auth.uid() or not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=auth.uid())))
    and p.created_at>now()-case when exists(select 1 from subscriptions s where s.user_id=auth.uid() and s.entitlement='plus' and s.expires_at>now()) then interval '24 hours' else interval '3 hours' end
  order by p.created_at desc limit 100;
$$;

create or replace function public.respond_to_city_post(post_id_input uuid,outfit_id_input uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from outfits where id=outfit_id_input and user_id=auth.uid() and moderation_status='approved' and expires_at>now()) then raise exception 'Approved current outfit required'; end if;
  if (select count(*) from city_post_responses where responder_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Response limit reached'; end if;
  if not exists(
    select 1 from city_posts p
    join profiles me on lower(me.city)=lower(p.city)
    join profiles author on author.id=p.user_id
    where p.id=post_id_input and me.id=auth.uid() and p.user_id<>auth.uid()
      and p.moderation_status='approved' and p.expires_at>now()
      and (me.discovery_preference='everyone' or me.discovery_preference=author.discovery_category)
      and (author.discovery_preference='everyone' or author.discovery_preference=me.discovery_category)
      and not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=auth.uid()))
  ) then raise exception 'Post unavailable'; end if;
  insert into city_post_responses(post_id,responder_id,outfit_id) values(post_id_input,auth.uid(),outfit_id_input) on conflict do nothing;
end $$;

revoke execute on function public.list_city_posts() from public,anon;
revoke execute on function public.respond_to_city_post(uuid,uuid) from public,anon;
grant execute on function public.list_city_posts() to authenticated;
grant execute on function public.respond_to_city_post(uuid,uuid) to authenticated;
