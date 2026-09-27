alter table public.rooms
  add column if not exists design_categories jsonb not null
  default '["furniture","curtains","flooring","decor","lighting"]'::jsonb;
