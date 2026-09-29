create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

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

drop trigger if exists notify_new_match on public.matches;
create trigger notify_new_match after insert on public.matches
for each row execute function public.invoke_beseen_match_notification();
drop trigger if exists notify_new_city_response on public.city_post_responses;
create trigger notify_new_city_response after insert on public.city_post_responses
for each row execute function public.invoke_beseen_city_response_notification();

revoke execute on function public.invoke_beseen_match_notification() from public,anon,authenticated;
revoke execute on function public.invoke_beseen_city_response_notification() from public,anon,authenticated;
