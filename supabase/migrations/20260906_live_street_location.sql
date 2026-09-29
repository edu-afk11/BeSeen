create or replace function public.refresh_street_location(latitude_input double precision,longitude_input double precision)
returns void language plpgsql security definer set search_path=public as $$
begin
  update street_sessions set location=st_setsrid(st_makepoint(longitude_input,latitude_input),4326)::geography
  where user_id=auth.uid() and ended_at is null and expires_at>now();
  if not found then raise exception 'No active street session'; end if;
end $$;

revoke execute on function public.refresh_street_location(double precision,double precision) from public,anon;
grant execute on function public.refresh_street_location(double precision,double precision) to authenticated;
