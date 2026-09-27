-- Scopes rooms to their owner. The original policy (`using (true)`) let any
-- signed-in or anonymous user read/write/delete every room in the table.
alter table public.rooms
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Existing rows have no owner and become unreachable under the new policy
-- once user_id is required. If you have real data to keep, backfill
-- user_id for those rows before running the "not null" line below.
-- update public.rooms set user_id = '<owner-uuid>' where id = '<room-id>';
-- alter table public.rooms alter column user_id set not null;

create index if not exists rooms_user_id_idx on public.rooms(user_id);

drop policy if exists "rooms_public_access" on public.rooms;

create policy "rooms_select_own"
  on public.rooms
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "rooms_insert_own"
  on public.rooms
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "rooms_update_own"
  on public.rooms
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "rooms_delete_own"
  on public.rooms
  for delete
  to authenticated
  using (auth.uid() = user_id);
