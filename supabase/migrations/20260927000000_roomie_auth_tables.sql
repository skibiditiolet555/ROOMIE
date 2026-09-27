-- Server-side account/session storage for the Roomie Supabase Edge Function.
-- Keep the database secret out of the frontend.

create table if not exists public.roomie_users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    name text not null,
    password_hash text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.roomie_sessions (
    token text primary key,
    user_id uuid not null references public.roomie_users(id) on delete cascade,
    expires_at timestamptz not null
);

create index if not exists roomie_sessions_user_id_idx
    on public.roomie_sessions(user_id);
create index if not exists roomie_sessions_expires_at_idx
    on public.roomie_sessions(expires_at);

alter table public.roomie_users enable row level security;
alter table public.roomie_sessions enable row level security;
