create table if not exists public.rooms (
  id                  text primary key,
  name                text not null default 'Untitled Room',
  category            text,
  style               text,
  budget              numeric not null default 0,
  spent               numeric not null default 0,
  status              text not null default 'In Progress',
  thumbnail           text,
  original_thumbnail  text,
  design_image        text,
  design_prompt       text,
  design_categories   jsonb not null default '["furniture","curtains","flooring","decor","lighting"]'::jsonb,
  items               jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now()
);

alter table public.rooms enable row level security;

drop policy if exists "rooms_public_access" on public.rooms;

create policy "rooms_public_access"
  on public.rooms
  for all
  to anon, authenticated
  using (true)
  with check (true);
