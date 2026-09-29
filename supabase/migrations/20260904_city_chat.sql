alter table public.profiles add column if not exists city text;
update public.profiles set city='Madrid' where city is null;
alter table public.profiles alter column city set not null;

create table public.city_posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  city text not null, description text not null check(char_length(description) between 12 and 280), place_hint text not null check(char_length(place_hint) between 3 and 100), time_hint text not null check(char_length(time_hint) between 3 and 40),
  moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours'
);
create index city_posts_feed_idx on public.city_posts(lower(city),created_at desc);
create table public.city_post_responses (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.city_posts(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade, created_at timestamptz not null default now(), accepted_at timestamptz, unique(post_id,responder_id)
);
create table public.city_post_reports (id uuid primary key default gen_random_uuid(),post_id uuid not null references public.city_posts(id) on delete cascade,reporter_id uuid not null references public.profiles(id) on delete cascade,reason text not null check(reason in ('personal_data','harassment','sexual_content','spam','other')),created_at timestamptz not null default now(),unique(post_id,reporter_id));
alter table public.city_posts enable row level security;
alter table public.city_post_responses enable row level security;
alter table public.city_post_reports enable row level security;
create policy "city post owner reads own" on public.city_posts for select using(user_id=auth.uid());
create policy "city response participants read" on public.city_post_responses for select using(responder_id=auth.uid() or exists(select 1 from city_posts p where p.id=post_id and p.user_id=auth.uid()));
create policy "city reporter reads own" on public.city_post_reports for select using(reporter_id=auth.uid());

create or replace function public.update_city(city_input text) returns void language plpgsql security definer set search_path=public as $$
begin city_input=trim(regexp_replace(city_input,'\s+',' ','g')); if char_length(city_input) not between 2 and 80 then raise exception 'Invalid city'; end if; update profiles set city=city_input where id=auth.uid(); end $$;
create or replace function public.create_city_post(description_input text,place_hint_input text,time_hint_input text) returns uuid language plpgsql security definer set search_path=public as $$
declare post_id uuid; profile_city text; begin description_input=trim(description_input);place_hint_input=trim(place_hint_input);time_hint_input=trim(time_hint_input);if char_length(description_input) not between 12 and 280 or char_length(place_hint_input) not between 3 and 100 or char_length(time_hint_input) not between 3 and 40 then raise exception 'Description, place and time required'; end if; if (select count(*) from city_posts where user_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Post limit reached'; end if; select city into profile_city from profiles where id=auth.uid(); insert into city_posts(user_id,city,description,place_hint,time_hint) values(auth.uid(),lower(profile_city),description_input,place_hint_input,time_hint_input) returning id into post_id; return post_id; end $$;
create or replace function public.list_city_posts() returns table(post_id uuid,description text,place_hint text,time_hint text,created_at timestamptz,response_sent boolean,is_own boolean) language sql security definer set search_path=public as $$
select p.id,p.description,p.place_hint,p.time_hint,p.created_at,exists(select 1 from city_post_responses r where r.post_id=p.id and r.responder_id=auth.uid()),p.user_id=auth.uid() from city_posts p join profiles viewer on viewer.id=auth.uid() where lower(p.city)=lower(viewer.city) and (p.user_id=auth.uid() or p.moderation_status='approved') and p.expires_at>now() and p.created_at>now()-case when exists(select 1 from subscriptions s where s.user_id=auth.uid() and s.entitlement='plus' and s.expires_at>now()) then interval '24 hours' else interval '3 hours' end order by p.created_at desc limit 100 $$;
create or replace function public.respond_to_city_post(post_id_input uuid,outfit_id_input uuid) returns void language plpgsql security definer set search_path=public as $$
begin if not exists(select 1 from outfits where id=outfit_id_input and user_id=auth.uid() and moderation_status='approved' and expires_at>now()) then raise exception 'Approved current outfit required'; end if; if not exists(select 1 from city_posts p join profiles me on lower(me.city)=lower(p.city) where p.id=post_id_input and me.id=auth.uid() and p.user_id<>auth.uid() and p.moderation_status='approved' and p.expires_at>now()) then raise exception 'Post unavailable'; end if; insert into city_post_responses(post_id,responder_id,outfit_id) values(post_id_input,auth.uid(),outfit_id_input) on conflict do nothing; end $$;

create or replace function public.list_city_post_responses(post_id_input uuid) returns table(response_id uuid,outfit_path text,created_at timestamptz,accepted boolean,username text) language plpgsql security definer set search_path=public as $$
begin if not exists(select 1 from city_posts where id=post_id_input and user_id=auth.uid() and expires_at>now()) then raise exception 'Post unavailable'; end if; return query select r.id,o.storage_path,r.created_at,r.accepted_at is not null,case when r.accepted_at is not null then p.username else null end from city_post_responses r join outfits o on o.id=r.outfit_id join profiles p on p.id=r.responder_id where r.post_id=post_id_input and o.expires_at>now() order by r.created_at desc; end $$;

create or replace function public.accept_city_post_response(response_id_input uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare selected city_post_responses; responder_username text; created_match_id uuid; begin select r.* into selected from city_post_responses r join city_posts p on p.id=r.post_id where r.id=response_id_input and p.user_id=auth.uid() and p.expires_at>now(); if selected.id is null then raise exception 'Response unavailable'; end if; update city_post_responses set accepted_at=coalesce(accepted_at,now()) where id=selected.id; insert into matches(user_low,user_high) values(least(auth.uid(),selected.responder_id),greatest(auth.uid(),selected.responder_id)) on conflict(user_low,user_high) do update set user_low=excluded.user_low returning id into created_match_id; select p.username into responder_username from profiles p where p.id=selected.responder_id; return jsonb_build_object('matched',true,'match_id',created_match_id,'username',responder_username); end $$;

create policy "city post author reads response outfit" on storage.objects for select to authenticated using(bucket_id='outfits' and exists(select 1 from public.outfits o join public.city_post_responses r on r.outfit_id=o.id join public.city_posts p on p.id=r.post_id where o.storage_path=storage.objects.name and p.user_id=auth.uid() and o.expires_at>now() and p.expires_at>now()));

create or replace function public.report_city_post(post_id_input uuid,reason_input text) returns void language plpgsql security definer set search_path=public as $$ begin if reason_input not in ('personal_data','harassment','sexual_content','spam','other') then raise exception 'Invalid reason'; end if; if not exists(select 1 from city_posts where id=post_id_input and user_id<>auth.uid()) then raise exception 'Post unavailable'; end if; insert into city_post_reports(post_id,reporter_id,reason) values(post_id_input,auth.uid(),reason_input) on conflict do nothing; end $$;

revoke execute on function public.update_city(text),public.create_city_post(text,text,text),public.list_city_posts(),public.respond_to_city_post(uuid,uuid),public.list_city_post_responses(uuid),public.accept_city_post_response(uuid),public.report_city_post(uuid,text) from public,anon;
grant execute on function public.update_city(text),public.create_city_post(text,text,text),public.list_city_posts(),public.respond_to_city_post(uuid,uuid),public.list_city_post_responses(uuid),public.accept_city_post_response(uuid),public.report_city_post(uuid,text) to authenticated;
