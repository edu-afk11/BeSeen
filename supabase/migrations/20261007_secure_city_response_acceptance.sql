-- Revalidate the temporary outfit and relationship at acceptance time. A response
-- created earlier must not reveal an identity after its proof expired or a block.
create or replace function public.accept_city_post_response(response_id_input uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare selected city_post_responses; responder_username text; created_match_id uuid;
begin
  select r.* into selected
  from city_post_responses r
  join city_posts p on p.id=r.post_id
  join outfits o on o.id=r.outfit_id
  where r.id=response_id_input and p.user_id=auth.uid() and p.expires_at>now()
    and o.expires_at>now() and o.moderation_status='approved'
    and not exists(
      select 1 from blocks b
      where (b.blocker_id=auth.uid() and b.blocked_id=r.responder_id)
         or (b.blocker_id=r.responder_id and b.blocked_id=auth.uid())
    );
  if selected.id is null then raise exception 'Response unavailable'; end if;

  update city_post_responses set accepted_at=now() where id=selected.id and accepted_at is null;
  select id into created_match_id from matches where user_low=least(auth.uid(),selected.responder_id) and user_high=greatest(auth.uid(),selected.responder_id);
  if created_match_id is null then
    insert into matches(user_low,user_high) values(least(auth.uid(),selected.responder_id),greatest(auth.uid(),selected.responder_id))
    on conflict(user_low,user_high) do nothing returning id into created_match_id;
    if created_match_id is null then select id into created_match_id from matches where user_low=least(auth.uid(),selected.responder_id) and user_high=greatest(auth.uid(),selected.responder_id); end if;
  end if;
  select p.username into responder_username from profiles p where p.id=selected.responder_id;
  return jsonb_build_object('matched',true,'match_id',created_match_id,'username',responder_username);
end $$;

revoke execute on function public.accept_city_post_response(uuid) from public,anon;
grant execute on function public.accept_city_post_response(uuid) to authenticated;
