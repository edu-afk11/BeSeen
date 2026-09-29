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

revoke execute on function public.apply_revenuecat_event(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_revenuecat_event(uuid,timestamptz,timestamptz) to service_role;
