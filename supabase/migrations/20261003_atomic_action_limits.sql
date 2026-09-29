create or replace function public.enforce_city_post_rate()
returns trigger language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('city-post:'||new.user_id::text,0));
  if (select count(*) from city_posts where user_id=new.user_id and created_at>now()-interval '1 hour')>=5 then raise exception 'City post rate limit reached'; end if;
  return new;
end $$;

drop trigger if exists enforce_city_post_rate on public.city_posts;
create trigger enforce_city_post_rate before insert on public.city_posts for each row execute function public.enforce_city_post_rate();

create or replace function public.enforce_city_response_rate()
returns trigger language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('city-response:'||new.responder_id::text,0));
  if (select count(*) from city_post_responses where responder_id=new.responder_id and created_at>now()-interval '1 hour')>=20 then raise exception 'City response rate limit reached'; end if;
  return new;
end $$;

drop trigger if exists enforce_city_response_rate on public.city_post_responses;
create trigger enforce_city_response_rate before insert on public.city_post_responses for each row execute function public.enforce_city_response_rate();

create or replace function public.enforce_interaction_rate()
returns trigger language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('interaction:'||new.requester_id::text,0));
  if (select count(*) from interaction_requests where requester_id=new.requester_id and created_at>now()-interval '1 hour')>=20 then raise exception 'Interaction rate limit reached'; end if;
  return new;
end $$;

drop trigger if exists enforce_interaction_rate on public.interaction_requests;
create trigger enforce_interaction_rate before insert on public.interaction_requests for each row execute function public.enforce_interaction_rate();
