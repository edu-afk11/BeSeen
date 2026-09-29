drop function if exists public.list_city_posts();

create function public.list_city_posts()
returns table(post_id uuid,description text,place_hint text,time_hint text,created_at timestamptz,response_sent boolean,is_own boolean,moderation_status text)
language sql security definer set search_path=public as $$
  select p.id,p.description,p.place_hint,p.time_hint,p.created_at,
    exists(select 1 from city_post_responses r where r.post_id=p.id and r.responder_id=auth.uid()),
    p.user_id=auth.uid(),p.moderation_status
  from city_posts p join profiles viewer on viewer.id=auth.uid()
  where lower(p.city)=lower(viewer.city)
    and (p.user_id=auth.uid() or p.moderation_status='approved')
    and p.expires_at>now()
    and (p.user_id=auth.uid() or not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=auth.uid())))
    and p.created_at>now()-case when exists(select 1 from subscriptions s where s.user_id=auth.uid() and s.entitlement='plus' and s.expires_at>now()) then interval '24 hours' else interval '3 hours' end
  order by p.created_at desc limit 100;
$$;

revoke execute on function public.list_city_posts() from public,anon;
grant execute on function public.list_city_posts() to authenticated;
