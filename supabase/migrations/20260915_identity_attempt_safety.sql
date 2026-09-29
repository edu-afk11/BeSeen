alter table public.identity_verifications add column if not exists requested_at timestamptz not null default now();

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

revoke execute on function public.reserve_identity_attempt(uuid) from public,anon,authenticated;
grant execute on function public.reserve_identity_attempt(uuid) to service_role;
