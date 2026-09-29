create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

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

revoke execute on function public.invoke_beseen_storage_cleanup() from public,anon,authenticated;
select cron.schedule('beseen-storage-cleanup','*/15 * * * *','select public.invoke_beseen_storage_cleanup()');
