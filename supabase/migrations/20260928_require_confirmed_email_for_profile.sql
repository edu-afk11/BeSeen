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

revoke execute on function public.create_my_profile(text,date,text,text,text) from public,anon;
grant execute on function public.create_my_profile(text,date,text,text,text) to authenticated;
