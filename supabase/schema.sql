create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,24}$'),
  username_changed_at timestamptz not null default now(),
  city text not null check(char_length(city) between 2 and 80),
  discovery_category text not null check(discovery_category in ('woman','man','nonbinary')),
  discovery_preference text not null check(discovery_preference in ('woman','man','nonbinary','everyone')),
  created_at timestamptz not null default now()
);

create table public.identity_verifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  provider_reference text unique,
  status text not null check (status in ('pending','verified','rejected')) default 'pending',
  adult_verified boolean not null default false,
  verified_at timestamptz,
  requested_at timestamptz not null default now()
);

create or replace function public.reserve_identity_attempt(user_id_input uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into identity_verifications(user_id,status,adult_verified,requested_at)
  values(user_id_input,'pending',false,now()) on conflict(user_id) do nothing;
  if found then return true; end if;
  update identity_verifications set status='pending',adult_verified=false,provider_reference=null,requested_at=now()
  where user_id=user_id_input and status<>'verified' and requested_at<now()-interval '10 minutes';
  return found;
end $$;

create table public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  entitlement text not null check(entitlement='plus'),
  expires_at timestamptz not null,
  revenuecat_event_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create or replace function public.apply_revenuecat_event(user_id_input uuid,expires_at_input timestamptz,event_at_input timestamptz)
returns void language sql security definer set search_path=public as $$
  insert into subscriptions(user_id,entitlement,expires_at,revenuecat_event_at,updated_at)
  values(user_id_input,'plus',expires_at_input,event_at_input,now())
  on conflict(user_id) do update set
    expires_at=excluded.expires_at,
    revenuecat_event_at=excluded.revenuecat_event_at,
    updated_at=now()
  where subscriptions.revenuecat_event_at<excluded.revenuecat_event_at;
$$;

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  automatic_moderated_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  constraint outfits_expiry_within_24_hours check(expires_at<=created_at+interval '24 hours')
);

create table public.street_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  -- Nullable so the precise position can be erased as soon as street mode ends.
  location geography(point,4326),
  location_updated_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  check (expires_at <= started_at + interval '60 minutes')
);
create table public.street_activation_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now()
);
create index street_activation_usage_user_time_idx on public.street_activation_usage(user_id,started_at desc);
create index street_sessions_location_idx on public.street_sessions using gist(location);
create unique index one_active_street_session_per_user on public.street_sessions(user_id) where ended_at is null;

create or replace function public.erase_location_when_street_mode_ends()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.ended_at is not null then new.location=null; end if;
  return new;
end $$;
create trigger erase_ended_street_location before update of ended_at on public.street_sessions
for each row execute function public.erase_location_when_street_mode_ends();

create table public.interaction_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  requester_session_id uuid not null references public.street_sessions(id) on delete cascade,
  target_session_id uuid not null references public.street_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(requester_session_id, target_session_id),
  check (requester_id <> target_id)
);

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  observer_id uuid not null references public.profiles(id) on delete cascade,
  observer_session_id uuid not null references public.street_sessions(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  target_session_id uuid not null references public.street_sessions(id) on delete cascade,
  target_outfit_id uuid not null references public.outfits(id) on delete cascade,
  crossed_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '3 hours',
  unique(observer_session_id,target_session_id),
  check(observer_id<>target_id),
  check(expires_at<=crossed_at+interval '3 hours')
);
create index encounters_observer_expiry_idx on public.encounters(observer_id,expires_at desc);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_low, user_high),
  check (user_low < user_high)
);

create table public.blocks (
  blocker_id uuid references public.profiles(id) on delete cascade,
  blocked_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check(platform in ('ios','android')),
  updated_at timestamptz not null default now()
);

create table public.notification_deliveries (
  event_key text primary key check(char_length(event_key) between 3 and 120),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  target_session_id uuid references public.street_sessions(id) on delete set null,
  reason text not null check(reason in ('inappropriate_outfit','harassment','fake_profile','other')),
  status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  check(reporter_id<>reported_id)
);
create unique index one_report_per_encounter on public.reports(reporter_id,target_session_id) where target_session_id is not null;

create table public.city_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  city text not null,
  description text not null check(char_length(description) between 12 and 280),
  place_hint text not null check(char_length(place_hint) between 3 and 100),
  time_hint text not null check(char_length(time_hint) between 3 and 40),
  moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','rejected')),
  automatic_moderated_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  check(expires_at<=created_at+interval '24 hours')
);
create index city_posts_feed_idx on public.city_posts(lower(city),created_at desc);

create table public.city_post_responses (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.city_posts(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique(post_id,responder_id)
);

create table public.city_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.city_posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check(reason in ('personal_data','harassment','sexual_content','spam','other')),
  created_at timestamptz not null default now(),
  unique(post_id,reporter_id)
);

create table public.legal_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  location_version text,
  accepted_at timestamptz not null,
  location_accepted_at timestamptz
);

create or replace function public.enforce_city_post_rate()
returns trigger language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('city-post:'||new.user_id::text,0));
  if (select count(*) from city_posts where user_id=new.user_id and created_at>now()-interval '1 hour')>=5 then raise exception 'City post rate limit reached'; end if;
  return new;
end $$;
create trigger enforce_city_post_rate before insert on public.city_posts for each row execute function public.enforce_city_post_rate();

create or replace function public.enforce_city_response_rate()
returns trigger language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('city-response:'||new.responder_id::text,0));
  if (select count(*) from city_post_responses where responder_id=new.responder_id and created_at>now()-interval '1 hour')>=20 then raise exception 'City response rate limit reached'; end if;
  return new;
end $$;
create trigger enforce_city_response_rate before insert on public.city_post_responses for each row execute function public.enforce_city_response_rate();

create or replace function public.enforce_interaction_rate()
returns trigger language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('interaction:'||new.requester_id::text,0));
  if (select count(*) from interaction_requests where requester_id=new.requester_id and created_at>now()-interval '1 hour')>=20 then raise exception 'Interaction rate limit reached'; end if;
  return new;
end $$;
create trigger enforce_interaction_rate before insert on public.interaction_requests for each row execute function public.enforce_interaction_rate();

alter table public.profiles enable row level security;
alter table public.identity_verifications enable row level security;
alter table public.subscriptions enable row level security;
alter table public.outfits enable row level security;
alter table public.street_sessions enable row level security;
alter table public.street_activation_usage enable row level security;
alter table public.interaction_requests enable row level security;
alter table public.encounters enable row level security;
alter table public.matches enable row level security;
alter table public.blocks enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.reports enable row level security;
alter table public.city_posts enable row level security;
alter table public.city_post_responses enable row level security;
alter table public.city_post_reports enable row level security;
alter table public.legal_consents enable row level security;


create policy "profile owner reads self" on public.profiles for select using (id = auth.uid());
create policy "verification owner reads self" on public.identity_verifications for select using (user_id = auth.uid());
create policy "subscription owner reads self" on public.subscriptions for select using (user_id=auth.uid());
create policy "outfit owner reads own" on public.outfits for select using (user_id=auth.uid());
create policy "outfit owner deletes own" on public.outfits for delete using (user_id=auth.uid());
create policy "street session owner reads own" on public.street_sessions for select using (user_id = auth.uid());
create policy "request participants read" on public.interaction_requests for select using (requester_id = auth.uid() or target_id = auth.uid());
create policy "encounter owner reads" on public.encounters for select using (observer_id=auth.uid());
create policy "match participants read" on public.matches for select using (user_low = auth.uid() or user_high = auth.uid());
create policy "block owner manages" on public.blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "reporter reads own reports" on public.reports for select using (reporter_id=auth.uid());
create policy "city post owner reads own" on public.city_posts for select using(user_id=auth.uid());
create policy "city response participants read" on public.city_post_responses for select using(responder_id=auth.uid() or exists(select 1 from city_posts p where p.id=post_id and p.user_id=auth.uid()));
create policy "city reporter reads own" on public.city_post_reports for select using(reporter_id=auth.uid());
create policy "consent owner reads own" on public.legal_consents for select using(user_id=auth.uid());

create or replace function public.register_push_token(token_input text,platform_input text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if token_input !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then raise exception 'Invalid push token'; end if;
  if platform_input not in ('ios','android') then raise exception 'Invalid platform'; end if;
  insert into push_tokens(token,user_id,platform,updated_at) values(token_input,auth.uid(),platform_input,now())
  on conflict(token) do update set user_id=auth.uid(),platform=excluded.platform,updated_at=now();
  delete from push_tokens where user_id=auth.uid() and token not in (
    select token from push_tokens where user_id=auth.uid() order by updated_at desc limit 5
  );
end $$;

create or replace function public.unregister_push_token(token_input text)
returns boolean language plpgsql security definer set search_path=public as $$
declare removed_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if token_input !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then raise exception 'Invalid push token'; end if;
  delete from push_tokens where token=token_input and user_id=auth.uid();
  get diagnostics removed_count = row_count;
  return removed_count>0;
end $$;

create or replace function public.capture_signup_consent()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.raw_user_meta_data->>'legal_version'='2026-09-03' then
    insert into legal_consents(user_id,terms_version,privacy_version,accepted_at)
    values(new.id,'2026-09-03','2026-09-03',new.created_at) on conflict(user_id) do nothing;
  end if;
  return new;
end $$;
create trigger capture_signup_legal_consent after insert on auth.users for each row execute function public.capture_signup_consent();

create or replace function public.accept_core_legal(version_input text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if version_input<>'2026-09-03' then raise exception 'Outdated legal version'; end if;
  insert into legal_consents(user_id,terms_version,privacy_version,accepted_at) values(auth.uid(),version_input,version_input,now())
  on conflict(user_id) do update set terms_version=excluded.terms_version,privacy_version=excluded.privacy_version,accepted_at=excluded.accepted_at;
end $$;

create or replace function public.accept_location_legal(version_input text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if version_input<>'2026-09-03' then raise exception 'Outdated legal version'; end if;
  update legal_consents set location_version=version_input,location_accepted_at=now() where user_id=auth.uid();
  if not found then raise exception 'Core legal consent required'; end if;
end $$;

create or replace function public.require_location_consent_for_street_mode()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from legal_consents where user_id=auth.uid() and location_version='2026-09-03') then raise exception 'Location consent required'; end if;
  if not exists(select 1 from outfits where id=new.outfit_id and user_id=auth.uid() and moderation_status in ('pending','approved') and expires_at>=new.expires_at) then raise exception 'Outfit must remain valid for the complete session'; end if;
  return new;
end $$;
create trigger require_street_location_consent before insert on public.street_sessions for each row execute function public.require_location_consent_for_street_mode();

create or replace function public.create_my_profile(username_input text,birth_date_input date,city_input text,category_input text,preference_input text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare created public.profiles;
begin
  username_input=lower(trim(username_input));
  city_input=trim(regexp_replace(city_input,'\s+',' ','g'));
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirmed email required'; end if;
  if not exists(select 1 from public.legal_consents where user_id=auth.uid() and terms_version='2026-09-03' and privacy_version='2026-09-03') then raise exception 'Current legal consent required'; end if;
  if username_input !~ '^[a-z0-9._]{3,24}$' then raise exception 'Invalid username'; end if;
  if birth_date_input>current_date-interval '18 years' or birth_date_input<current_date-interval '120 years' then raise exception 'Adults only'; end if;
  if char_length(city_input) not between 2 and 80 then raise exception 'Invalid city'; end if;
  if category_input not in ('woman','man','nonbinary') or preference_input not in ('woman','man','nonbinary','everyone') then raise exception 'Invalid discovery preference'; end if;
  insert into profiles(id,username,city,discovery_category,discovery_preference)
  values(auth.uid(),username_input,city_input,category_input,preference_input) returning * into created;
  return to_jsonb(created);
end $$;

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
create trigger reject_blocked_interaction before insert on public.interaction_requests for each row execute function public.reject_blocked_request();

create or replace function public.reject_blocked_match()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from blocks b where (b.blocker_id=new.user_low and b.blocked_id=new.user_high) or (b.blocker_id=new.user_high and b.blocked_id=new.user_low)) then raise exception 'Blocked relationship'; end if;
  return new;
end $$;
create trigger reject_blocked_match before insert on public.matches for each row execute function public.reject_blocked_match();

create or replace function public.report_encounter(target_session_id_input uuid, reason_input text)
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
  delete from encounters where observer_id=auth.uid() and target_session_id=target_session_id_input;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('outfits','outfits',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

create or replace function public.can_upload_outfit()
returns boolean language plpgsql security definer set search_path=public,storage as $$
declare recent_uploads integer;
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('outfit-upload:'||auth.uid()::text,0));
  select count(*) into recent_uploads from storage.objects
  where bucket_id='outfits' and owner_id=auth.uid()::text and created_at>now()-interval '1 hour';
  return recent_uploads<10;
end $$;

create policy "outfit image owner uploads" on storage.objects for insert to authenticated
with check (bucket_id='outfits' and (storage.foldername(name))[1]=auth.uid()::text and public.can_upload_outfit());
create policy "outfit image owner reads" on storage.objects for select to authenticated
using (bucket_id='outfits' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "outfit image owner deletes" on storage.objects for delete to authenticated
using (bucket_id='outfits' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "encounter observer reads temporary outfit" on storage.objects for select to authenticated
using (
  bucket_id='outfits' and exists(
    select 1 from public.outfits o
    join public.encounters e on e.target_outfit_id=o.id
    where o.storage_path=storage.objects.name and e.observer_id=auth.uid() and e.expires_at>now() and o.expires_at>now()
  )
);
create policy "city post author reads response outfit" on storage.objects for select to authenticated
using (
  bucket_id='outfits' and exists(
    select 1 from public.outfits o
    join public.city_post_responses r on r.outfit_id=o.id
    join public.city_posts p on p.id=r.post_id
    where o.storage_path=storage.objects.name and p.user_id=auth.uid() and o.expires_at>now() and p.expires_at>now()
  )
);

create or replace function public.create_pending_outfit(storage_path_input text)
returns jsonb language plpgsql security definer set search_path=public,storage as $$
declare created public.outfits;
begin
  if storage_path_input !~ ('^'||auth.uid()::text||'/[0-9]+\.(jpg|jpeg|png|webp)$') then raise exception 'Invalid outfit path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='outfits' and name=storage_path_input and owner_id=auth.uid()::text) then raise exception 'Uploaded outfit not found'; end if;
  insert into public.outfits(user_id,storage_path,moderation_status,created_at,expires_at)
  values(auth.uid(),storage_path_input,'approved',now(),now()+interval '24 hours') returning * into created;
  return to_jsonb(created);
end $$;

create or replace function public.confirm_profile_adult()
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Complete your profile first'; end if;
  insert into public.identity_verifications(user_id,status,adult_verified,verified_at,requested_at)
  values(auth.uid(),'verified',true,now(),now())
  on conflict(user_id) do update set status='verified',adult_verified=true,verified_at=now(),provider_reference=null,requested_at=now();
end $$;

create or replace function public.change_username(username_input text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if username_input !~ '^[a-z0-9._]{3,24}$' then raise exception 'Invalid username'; end if;
  if exists(select 1 from profiles where id=auth.uid() and username_changed_at > now()-interval '30 days') then
    raise exception 'Username can only be changed every 30 days';
  end if;
  update profiles set username=username_input, username_changed_at=now() where id=auth.uid();
end $$;

create or replace function public.update_discovery_preferences(category_input text, preference_input text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if category_input not in ('woman','man','nonbinary') or preference_input not in ('woman','man','nonbinary','everyone') then
    raise exception 'Invalid discovery preference';
  end if;
  update profiles set discovery_category=category_input, discovery_preference=preference_input where id=auth.uid();
end $$;

create or replace function public.update_city(city_input text)
returns void language plpgsql security definer set search_path=public as $$
begin
  city_input=trim(regexp_replace(city_input,'\s+',' ','g'));
  if char_length(city_input) not between 2 and 80 then raise exception 'Invalid city'; end if;
  update profiles set city=city_input where id=auth.uid();
end $$;

create or replace function public.create_city_post(description_input text,place_hint_input text,time_hint_input text)
returns uuid language plpgsql security definer set search_path=public as $$
declare post_id uuid; profile_city text;
begin
  description_input=trim(description_input); place_hint_input=trim(place_hint_input); time_hint_input=trim(time_hint_input);
  if char_length(description_input) not between 12 and 280 then raise exception 'La descripción debe tener entre 12 y 280 caracteres'; end if;
  if char_length(place_hint_input) not between 3 and 100 or char_length(time_hint_input) not between 3 and 40 then raise exception 'Lugar y hora son obligatorios'; end if;
  if (select count(*) from city_posts where user_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Has alcanzado el límite de publicaciones'; end if;
  select city into profile_city from profiles where id=auth.uid();
  insert into city_posts(user_id,city,description,place_hint,time_hint) values(auth.uid(),lower(profile_city),description_input,place_hint_input,time_hint_input) returning id into post_id;
  return post_id;
end $$;

create or replace function public.list_city_posts()
returns table(post_id uuid,description text,place_hint text,time_hint text,created_at timestamptz,response_sent boolean,is_own boolean,moderation_status text)
language sql security definer set search_path=public as $$
  select p.id,p.description,p.place_hint,p.time_hint,p.created_at,exists(select 1 from city_post_responses r where r.post_id=p.id and r.responder_id=auth.uid()),p.user_id=auth.uid(),p.moderation_status
  from city_posts p join profiles viewer on viewer.id=auth.uid() join profiles author on author.id=p.user_id
  where lower(p.city)=lower(viewer.city) and (p.user_id=auth.uid() or p.moderation_status='approved') and p.expires_at>now()
    and (p.user_id=auth.uid() or ((viewer.discovery_preference='everyone' or viewer.discovery_preference=author.discovery_category) and (author.discovery_preference='everyone' or author.discovery_preference=viewer.discovery_category)))
    and (p.user_id=auth.uid() or not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=auth.uid())))
    and (p.user_id=auth.uid() or not exists(select 1 from city_post_reports cpr where cpr.post_id=p.id and cpr.reporter_id=auth.uid()))
    and p.created_at>now()-case when exists(select 1 from subscriptions s where s.user_id=auth.uid() and s.entitlement='plus' and s.expires_at>now()) then interval '24 hours' else interval '3 hours' end
  order by p.created_at desc limit 100;
$$;

create or replace function public.respond_to_city_post(post_id_input uuid,outfit_id_input uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from outfits where id=outfit_id_input and user_id=auth.uid() and moderation_status='approved' and expires_at>now()) then raise exception 'Approved current outfit required'; end if;
  if (select count(*) from city_post_responses where responder_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Response limit reached'; end if;
  if not exists(select 1 from city_posts p join profiles me on lower(me.city)=lower(p.city) join profiles author on author.id=p.user_id where p.id=post_id_input and me.id=auth.uid() and p.user_id<>auth.uid() and p.moderation_status='approved' and p.expires_at>now() and (me.discovery_preference='everyone' or me.discovery_preference=author.discovery_category) and (author.discovery_preference='everyone' or author.discovery_preference=me.discovery_category) and not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=auth.uid()))) then raise exception 'Post unavailable'; end if;
  insert into city_post_responses(post_id,responder_id,outfit_id) values(post_id_input,auth.uid(),outfit_id_input) on conflict do nothing;
end $$;

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

create or replace function public.list_city_post_responses(post_id_input uuid)
returns table(response_id uuid,outfit_path text,created_at timestamptz,accepted boolean,username text)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from city_posts where id=post_id_input and user_id=auth.uid() and expires_at>now()) then raise exception 'Post unavailable'; end if;
  return query select r.id,o.storage_path,r.created_at,r.accepted_at is not null,case when r.accepted_at is not null then p.username else null end
  from city_post_responses r join outfits o on o.id=r.outfit_id join profiles p on p.id=r.responder_id
  where r.post_id=post_id_input and o.expires_at>now() order by r.created_at desc;
end $$;

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
    and not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=r.responder_id) or (b.blocker_id=r.responder_id and b.blocked_id=auth.uid()));
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

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth, storage as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from storage.objects where bucket_id='outfits' and (storage.foldername(name))[1]=auth.uid()::text;
  delete from auth.users where id=auth.uid();
end $$;

create or replace function public.activate_street_mode(outfit_id_input uuid, latitude_input double precision, longitude_input double precision, expires_at_input timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; has_plus boolean; uses_last_24h integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if latitude_input not between -90 and 90 or longitude_input not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  if not exists(select 1 from identity_verifications where user_id = auth.uid() and status = 'verified' and adult_verified) then
    raise exception 'Identity and adult verification required';
  end if;
  if not exists(select 1 from outfits where id = outfit_id_input and user_id = auth.uid() and moderation_status in ('pending','approved') and expires_at>now()) then
    raise exception 'Valid outfit required';
  end if;
  select exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) into has_plus;
  select count(*) into uses_last_24h from street_activation_usage where user_id=auth.uid() and started_at>now()-interval '24 hours';
  if not has_plus and uses_last_24h>=3 then
    raise exception 'Has usado tus 3 modos calle de las últimas 24 horas';
  end if;
  update street_sessions set ended_at = now() where user_id = auth.uid() and ended_at is null;
  insert into street_sessions(user_id,outfit_id,location,expires_at)
  values(auth.uid(),outfit_id_input,st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography,now()+interval '30 minutes')
  returning id into new_id;
  insert into street_activation_usage(user_id,started_at) values(auth.uid(),now());
  return new_id;
end $$;

create or replace function public.deactivate_street_mode()
returns void language sql security definer set search_path = public as $$
  update street_sessions set ended_at = now(), location = null where user_id = auth.uid() and ended_at is null;
$$;

create or replace function public.refresh_street_location(latitude_input double precision,longitude_input double precision)
returns void language plpgsql security definer set search_path=public as $$
begin
  if latitude_input not between -90 and 90 or longitude_input not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  update street_sessions set location=st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography,location_updated_at=now()
  where user_id=auth.uid() and ended_at is null and expires_at>now();
  if not found then raise exception 'No active street session'; end if;
end $$;

create or replace function public.get_street_mode_allowance()
returns table(has_plus boolean, used integer, remaining integer)
language sql security definer set search_path=public as $$
  with allowance as (
    select
      exists(select 1 from subscriptions where user_id=auth.uid() and entitlement='plus' and expires_at>now()) as plus,
      (select count(*)::integer from street_activation_usage where user_id=auth.uid() and started_at>now()-interval '24 hours') as uses
  )
  select plus, uses, case when plus then 2147483647 else greatest(3-uses,0) end from allowance;
$$;

create or replace function public.get_my_active_street_session()
returns table(session_id uuid, expires_at timestamptz, outfit_id uuid)
language sql security definer set search_path=public as $$
  select id, street_sessions.expires_at, street_sessions.outfit_id
  from street_sessions
  where user_id=auth.uid() and ended_at is null and street_sessions.expires_at>now()
  order by started_at desc limit 1;
$$;

create or replace function public.find_recent_encounters()
returns table(session_id uuid, outfit_path text, crossed_at timestamptz, requested boolean)
language plpgsql security definer set search_path = public as $$
declare own_session street_sessions;
begin
  select * into own_session from street_sessions where user_id=auth.uid() and ended_at is null and expires_at>now() and location_updated_at>now()-interval '3 minutes' order by started_at desc limit 1;
  if own_session.id is not null then
    insert into encounters(observer_id,observer_session_id,target_id,target_session_id,target_outfit_id,crossed_at,expires_at)
    select auth.uid(),own_session.id,s.user_id,s.id,s.outfit_id,now(),now()+interval '3 hours'
    from street_sessions s join outfits o on o.id=s.outfit_id
    join profiles viewer on viewer.id=auth.uid()
    join profiles target on target.id=s.user_id
    where s.user_id<>auth.uid() and s.ended_at is null and s.expires_at>now() and s.location_updated_at>now()-interval '3 minutes' and o.moderation_status='approved'
      -- Fixed server-side so a modified client cannot scan a wider area.
      and own_session.location is not null and st_dwithin(s.location,own_session.location,50)
      and not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=s.user_id) or (b.blocker_id=s.user_id and b.blocked_id=auth.uid()))
      and (viewer.discovery_preference='everyone' or viewer.discovery_preference=target.discovery_category)
      and (target.discovery_preference='everyone' or target.discovery_preference=viewer.discovery_category)
    on conflict(observer_session_id,target_session_id) do update set crossed_at=excluded.crossed_at,expires_at=excluded.expires_at;
  end if;
  return query
    select e.target_session_id,o.storage_path,e.crossed_at,
      exists(select 1 from interaction_requests r where r.requester_id=auth.uid() and r.target_session_id=e.target_session_id)
    from encounters e join outfits o on o.id=e.target_outfit_id
    where e.observer_id=auth.uid() and e.expires_at>now()
      and not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=e.target_id) or (b.blocker_id=e.target_id and b.blocked_id=auth.uid()))
    order by e.crossed_at desc limit 30;
end;
$$;

create or replace function public.request_interaction(target_session_id_input uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare recorded_encounter encounters; matched boolean; revealed_username text; created_match_id uuid;
begin
  select * into recorded_encounter from encounters where observer_id=auth.uid() and target_session_id=target_session_id_input and expires_at>now() order by crossed_at desc limit 1;
  if recorded_encounter.id is null then raise exception 'Recent proximity encounter required'; end if;
  if not exists(select 1 from interaction_requests where requester_session_id=recorded_encounter.observer_session_id and target_session_id=recorded_encounter.target_session_id)
    and (select count(*) from interaction_requests where requester_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Request limit reached'; end if;
  insert into interaction_requests(requester_id,target_id,requester_session_id,target_session_id)
  values(auth.uid(),recorded_encounter.target_id,recorded_encounter.observer_session_id,recorded_encounter.target_session_id) on conflict do nothing;
  select exists(
    select 1 from interaction_requests
    where requester_id=recorded_encounter.target_id
      and target_id=auth.uid()
      and requester_session_id=recorded_encounter.target_session_id
      and target_session_id=recorded_encounter.observer_session_id
      and created_at>now()-interval '3 hours'
  ) into matched;
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

create or replace function public.list_my_matches()
returns table(match_id uuid, username text, matched_at timestamptz)
language sql security definer set search_path=public as $$
  select m.id, p.username, m.created_at
  from matches m
  join profiles p on p.id=case when m.user_low=auth.uid() then m.user_high else m.user_low end
  where (m.user_low=auth.uid() or m.user_high=auth.uid())
    and not exists(select 1 from blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=auth.uid()))
  order by m.created_at desc;
$$;

create or replace function public.purge_expired_private_data()
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from city_posts where expires_at<now();
  delete from encounters where expires_at<now();
  update street_sessions set location=null where location is not null and (ended_at is not null or expires_at<now());
  -- Expired outfit files and rows are removed through the Storage API by cleanup-expired.
  delete from street_sessions where expires_at<now()-interval '4 hours';
  delete from street_activation_usage where started_at<=now()-interval '24 hours';
end $$;

create or replace function public.invoke_beseen_storage_cleanup()
returns void language plpgsql security definer set search_path=public,vault,net,extensions as $$
declare project_url text; cleanup_secret text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name='beseen_project_url' limit 1;
  select decrypted_secret into cleanup_secret from vault.decrypted_secrets where name='beseen_cleanup_webhook_secret' limit 1;
  if project_url is null or cleanup_secret is null then return; end if;
  perform net.http_post(
    url=>rtrim(project_url,'/')||'/functions/v1/cleanup-expired',
    headers=>jsonb_build_object('content-type','application/json','x-cleanup-secret',cleanup_secret),
    body=>'{}'::jsonb,
    timeout_milliseconds=>10000
  );
end $$;

create or replace function public.invoke_beseen_match_notification()
returns trigger language plpgsql security definer set search_path=public,vault,net,extensions as $$
declare project_url text; webhook_secret text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name='beseen_project_url' limit 1;
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name='beseen_match_webhook_secret' limit 1;
  if project_url is null or webhook_secret is null then return new; end if;
  perform net.http_post(
    url=>rtrim(project_url,'/')||'/functions/v1/notify-match',
    headers=>jsonb_build_object('content-type','application/json','x-webhook-secret',webhook_secret),
    body=>jsonb_build_object('record',jsonb_build_object('id',new.id)),
    timeout_milliseconds=>10000
  );
  return new;
end $$;

create or replace function public.invoke_beseen_city_response_notification()
returns trigger language plpgsql security definer set search_path=public,vault,net,extensions as $$
declare project_url text; webhook_secret text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name='beseen_project_url' limit 1;
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name='beseen_chat_webhook_secret' limit 1;
  if project_url is null or webhook_secret is null then return new; end if;
  perform net.http_post(
    url=>rtrim(project_url,'/')||'/functions/v1/notify-city-chat',
    headers=>jsonb_build_object('content-type','application/json','x-webhook-secret',webhook_secret),
    body=>jsonb_build_object('record',jsonb_build_object('id',new.id)),
    timeout_milliseconds=>10000
  );
  return new;
end $$;

create trigger notify_new_match after insert on public.matches
for each row execute function public.invoke_beseen_match_notification();
create trigger notify_new_city_response after insert on public.city_post_responses
for each row execute function public.invoke_beseen_city_response_notification();

revoke execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) from public,anon;
revoke execute on function public.deactivate_street_mode() from public,anon;
revoke execute on function public.refresh_street_location(double precision,double precision) from public,anon;
revoke execute on function public.get_street_mode_allowance() from public,anon;
revoke execute on function public.get_my_active_street_session() from public,anon;
revoke execute on function public.find_recent_encounters() from public,anon;
revoke execute on function public.request_interaction(uuid) from public,anon;
revoke execute on function public.list_my_matches() from public,anon;
revoke execute on function public.change_username(text) from public,anon;
revoke execute on function public.update_discovery_preferences(text,text) from public,anon;
revoke execute on function public.update_city(text) from public,anon;
revoke execute on function public.create_city_post(text,text,text) from public,anon;
revoke execute on function public.list_city_posts() from public,anon;
revoke execute on function public.respond_to_city_post(uuid,uuid) from public,anon;
revoke execute on function public.list_city_post_responses(uuid) from public,anon;
revoke execute on function public.accept_city_post_response(uuid) from public,anon;
revoke execute on function public.report_city_post(uuid,text) from public,anon;
revoke execute on function public.delete_my_account() from public,anon;
revoke execute on function public.block_encounter(uuid) from public,anon;
revoke execute on function public.report_encounter(uuid,text) from public,anon;
revoke execute on function public.create_pending_outfit(text) from public,anon;
revoke execute on function public.can_upload_outfit() from public,anon;
revoke execute on function public.create_my_profile(text,date,text,text,text) from public,anon;
revoke execute on function public.accept_core_legal(text) from public,anon;
revoke execute on function public.accept_location_legal(text) from public,anon;
revoke execute on function public.apply_revenuecat_event(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke execute on function public.register_push_token(text,text) from public,anon;
revoke execute on function public.unregister_push_token(text) from public,anon;
revoke execute on function public.reserve_identity_attempt(uuid) from public,anon,authenticated;
revoke execute on function public.confirm_profile_adult() from public,anon;
grant execute on function public.activate_street_mode(uuid,double precision,double precision,timestamptz) to authenticated;
grant execute on function public.deactivate_street_mode() to authenticated;
grant execute on function public.refresh_street_location(double precision,double precision) to authenticated;
grant execute on function public.get_street_mode_allowance() to authenticated;
grant execute on function public.get_my_active_street_session() to authenticated;
grant execute on function public.find_recent_encounters() to authenticated;
grant execute on function public.request_interaction(uuid) to authenticated;
grant execute on function public.list_my_matches() to authenticated;
grant execute on function public.change_username(text) to authenticated;
grant execute on function public.update_discovery_preferences(text,text) to authenticated;
grant execute on function public.update_city(text) to authenticated;
grant execute on function public.create_city_post(text,text,text) to authenticated;
grant execute on function public.list_city_posts() to authenticated;
grant execute on function public.respond_to_city_post(uuid,uuid) to authenticated;
grant execute on function public.list_city_post_responses(uuid) to authenticated;
grant execute on function public.accept_city_post_response(uuid) to authenticated;
grant execute on function public.report_city_post(uuid,text) to authenticated;
revoke execute on function public.delete_my_account() from authenticated;
grant execute on function public.block_encounter(uuid) to authenticated;
grant execute on function public.report_encounter(uuid,text) to authenticated;
grant execute on function public.create_pending_outfit(text) to authenticated;
grant execute on function public.can_upload_outfit() to authenticated;
grant execute on function public.create_my_profile(text,date,text,text,text) to authenticated;
grant execute on function public.confirm_profile_adult() to authenticated;
grant execute on function public.accept_core_legal(text) to authenticated;
grant execute on function public.accept_location_legal(text) to authenticated;
grant execute on function public.apply_revenuecat_event(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.register_push_token(text,text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.reserve_identity_attempt(uuid) to service_role;
grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.identity_verifications to authenticated;
grant select on table public.outfits to authenticated;
revoke execute on function public.purge_expired_private_data() from public,anon,authenticated;
revoke execute on function public.invoke_beseen_storage_cleanup() from public,anon,authenticated;
revoke execute on function public.invoke_beseen_match_notification() from public,anon,authenticated;
revoke execute on function public.invoke_beseen_city_response_notification() from public,anon,authenticated;
revoke execute on function public.capture_signup_consent() from public,anon,authenticated;
revoke execute on function public.erase_location_when_street_mode_ends() from public,anon,authenticated;
revoke execute on function public.require_location_consent_for_street_mode() from public,anon,authenticated;
revoke execute on function public.reject_blocked_request() from public,anon,authenticated;
revoke execute on function public.reject_blocked_match() from public,anon,authenticated;
revoke execute on function public.enforce_city_post_rate() from public,anon,authenticated;
revoke execute on function public.enforce_city_response_rate() from public,anon,authenticated;
revoke execute on function public.enforce_interaction_rate() from public,anon,authenticated;
select cron.schedule('beseen-purge-private-data','5 * * * *','select public.purge_expired_private_data()');
select cron.schedule('beseen-storage-cleanup','*/15 * * * *','select public.invoke_beseen_storage_cleanup()');
