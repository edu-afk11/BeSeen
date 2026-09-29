-- Remove the original unnamed four-hour expiry constraint (Postgres named it
-- outfits_check) and replace it with the current 24-hour product rule.
alter table public.outfits drop constraint if exists outfits_check;
alter table public.outfits drop constraint if exists outfits_expiry_within_24_hours;
alter table public.outfits alter column expires_at set default now() + interval '24 hours';
alter table public.outfits
  add constraint outfits_expiry_within_24_hours
  check (expires_at > created_at and expires_at <= created_at + interval '24 hours');
