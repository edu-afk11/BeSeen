create or replace function public.purge_expired_private_data()
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from city_posts where expires_at<now();
  delete from encounters where expires_at<now();
  update street_sessions set location=null where location is not null and (ended_at is not null or expires_at<now());
  delete from street_sessions where expires_at<now()-interval '4 hours';
end $$;

revoke execute on function public.purge_expired_private_data() from public,anon,authenticated;
