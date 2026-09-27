alter table public.rooms add column if not exists style_overrides jsonb not null default '{}'::jsonb;
