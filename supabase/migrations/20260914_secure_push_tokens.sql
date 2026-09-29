drop policy if exists "push token owner manages" on public.push_tokens;
drop policy if exists "push token owner deletes" on public.push_tokens;
create policy "push token owner deletes" on public.push_tokens for delete using(user_id=auth.uid());

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

revoke execute on function public.register_push_token(text,text) from public,anon;
grant execute on function public.register_push_token(text,text) to authenticated;
