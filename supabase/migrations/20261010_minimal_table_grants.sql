-- Automatic Data API exposure is disabled. Grant only the direct reads used
-- by the mobile client; RLS still limits every query to the user's own rows.
grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.identity_verifications to authenticated;
grant select on table public.outfits to authenticated;
