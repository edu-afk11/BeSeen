drop policy if exists "outfit owner manages own" on public.outfits;
drop policy if exists "outfit owner reads own" on public.outfits;
drop policy if exists "outfit owner deletes own" on public.outfits;
create policy "outfit owner reads own" on public.outfits for select using(user_id=auth.uid());
create policy "outfit owner deletes own" on public.outfits for delete using(user_id=auth.uid());

drop policy if exists "outfit image owner deletes" on storage.objects;
create policy "outfit image owner deletes" on storage.objects for delete to authenticated
using(bucket_id='outfits' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.create_pending_outfit(storage_path_input text)
returns jsonb language plpgsql security definer set search_path=public,storage as $$
declare created public.outfits;
begin
  if storage_path_input !~ ('^'||auth.uid()::text||'/[0-9]+\.(jpg|jpeg|png|webp)$') then raise exception 'Invalid outfit path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='outfits' and name=storage_path_input and owner_id=auth.uid()::text) then raise exception 'Uploaded outfit not found'; end if;
  insert into public.outfits(user_id,storage_path,moderation_status,created_at,expires_at)
  values(auth.uid(),storage_path_input,'pending',now(),now()+interval '4 hours') returning * into created;
  return to_jsonb(created);
end $$;

revoke execute on function public.create_pending_outfit(text) from public,anon;
grant execute on function public.create_pending_outfit(text) to authenticated;
