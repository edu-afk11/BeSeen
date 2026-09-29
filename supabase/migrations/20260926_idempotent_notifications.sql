create table if not exists public.notification_deliveries (
  event_key text primary key check(char_length(event_key) between 3 and 120),
  created_at timestamptz not null default now()
);

alter table public.notification_deliveries enable row level security;

-- No client policies: only Edge Functions using the service role can claim deliveries.
