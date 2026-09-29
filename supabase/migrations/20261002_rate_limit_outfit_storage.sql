create or replace function public.can_upload_outfit()
returns boolean language plpgsql security definer set search_path=public,storage as $$
declare recent_uploads integer;
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('outfit-upload:'||auth.uid()::text,0));
  select count(*) into recent_uploads from storage.objects
  where bucket_id='outfits' and owner_id=auth.uid()::text and created_at>now()-interval '1 hour';
  return recent_uploads<10;
end $$;

drop policy if exists "outfit image owner uploads" on storage.objects;
create policy "outfit image owner uploads" on storage.objects for insert to authenticated
with check (
  bucket_id='outfits'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.can_upload_outfit()
);

revoke execute on function public.can_upload_outfit() from public,anon;
grant execute on function public.can_upload_outfit() to authenticated;
