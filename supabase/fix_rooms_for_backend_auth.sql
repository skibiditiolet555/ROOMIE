alter table public.rooms add column if not exists photos jsonb not null default '[]'::jsonb;

alter table public.rooms add column if not exists user_id uuid;

alter table public.rooms drop constraint if exists rooms_user_id_fkey;

create index if not exists rooms_user_id_idx on public.rooms(user_id);

alter table public.rooms enable row level security;

drop policy if exists "rooms_public_access" on public.rooms;
drop policy if exists "rooms_select_own" on public.rooms;
drop policy if exists "rooms_insert_own" on public.rooms;
drop policy if exists "rooms_update_own" on public.rooms;
drop policy if exists "rooms_delete_own" on public.rooms;
