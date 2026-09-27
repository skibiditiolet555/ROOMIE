-- Authentication no longer goes through Supabase Auth (see backend/app's
-- new /api/auth/* endpoints + backend/auth.db) — user ids are now generated
-- by the backend, not by auth.users, so the old foreign key would reject
-- every insert. Rooms are still stored in this table; the backend is now
-- the only thing that reads/writes it, using the service-role key, which
-- bypasses RLS entirely. The old auth.uid()-based policies below are
-- harmless dead weight (no request will ever carry a Supabase Auth JWT
-- again) but are replaced for clarity.

alter table public.rooms drop constraint if exists rooms_user_id_fkey;

drop policy if exists "rooms_select_own" on public.rooms;
drop policy if exists "rooms_insert_own" on public.rooms;
drop policy if exists "rooms_update_own" on public.rooms;
drop policy if exists "rooms_delete_own" on public.rooms;

-- No policies for anon/authenticated are created here on purpose: with RLS
-- enabled and zero matching policies, the table is unreachable through the
-- public API (anon/publishable key) entirely. Only the service-role key
-- (used exclusively by the backend) can read or write it, which is what
-- enforces per-user ownership now (see backend/app/routers/rooms.py).
