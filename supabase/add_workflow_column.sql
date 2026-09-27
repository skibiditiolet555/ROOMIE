alter table public.rooms add column if not exists workflow jsonb not null default '{}'::jsonb;
alter table public.rooms add column if not exists style_overrides jsonb not null default '{}'::jsonb;
alter table public.rooms add column if not exists design_categories jsonb not null default '[]'::jsonb;
