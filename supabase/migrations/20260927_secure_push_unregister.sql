drop policy if exists "push token owner deletes" on public.push_tokens;

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

revoke execute on function public.unregister_push_token(text) from public,anon;
grant execute on function public.unregister_push_token(text) to authenticated;
