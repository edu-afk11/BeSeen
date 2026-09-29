-- Physical storage objects are removed by the authenticated delete-account
-- Edge Function before the auth user and cascading database rows are deleted.
revoke execute on function public.delete_my_account() from public,anon,authenticated;
