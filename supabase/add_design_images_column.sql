alter table public.rooms add column if not exists design_images jsonb not null default '[]'::jsonb;
