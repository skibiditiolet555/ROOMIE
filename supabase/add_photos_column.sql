alter table public.rooms add column if not exists photos jsonb not null default '[]'::jsonb;
