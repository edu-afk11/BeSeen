drop policy if exists "consent owner manages" on public.legal_consents;
drop policy if exists "consent owner reads own" on public.legal_consents;
create policy "consent owner reads own" on public.legal_consents for select using(user_id=auth.uid());

create or replace function public.capture_signup_consent()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.raw_user_meta_data->>'legal_version'='2026-09-03' then
    insert into legal_consents(user_id,terms_version,privacy_version,accepted_at)
    values(new.id,'2026-09-03','2026-09-03',new.created_at) on conflict(user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists capture_signup_legal_consent on auth.users;
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
  return new;
end $$;
drop trigger if exists require_street_location_consent on public.street_sessions;
create trigger require_street_location_consent before insert on public.street_sessions for each row execute function public.require_location_consent_for_street_mode();

revoke execute on function public.accept_core_legal(text) from public,anon;
revoke execute on function public.accept_location_legal(text) from public,anon;
grant execute on function public.accept_core_legal(text) to authenticated;
grant execute on function public.accept_location_legal(text) to authenticated;
